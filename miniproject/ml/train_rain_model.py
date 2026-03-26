#!/usr/bin/env python3
"""
Rainfall Prediction Model – Training Script
Uses a single-stage XGBoost regressor with log1p-transformed target.

Why single-stage (not two-stage classifier + regressor):
  - Only ~1.8% of 5-min readings are rainy. A classifier over this data
    either under-fires (all zeros) or over-fires (false positives) at any
    fixed threshold — both worse than a well-regularised regressor.
  - log1p(0) = 0, so the regressor naturally learns to output near-zero for
    the dry majority and positive values for wet windows.
  - expm1(clip(pred, 0)) gives a clean non-negative rainfall rate.

Features engineered:
  - Current + lagged readings (1h, 2h, 3h, 4h, 6h back):
      humidity, pressure, temp, wind, rain rate
  - Pressure tendency dP/dt (1h & 3h) — strongest single predictor
  - Dew-point depression — atmospheric moisture proxy
  - Humidity × pressure product — saturated-air instability
  - Rain streak — consecutive 5-min windows with rain > 0
  - Cyclical hour-of-day encoding (sin/cos)
  - Rolling averages (1h & 3h rain, 3h humidity, 3h pressure)

Target: log1p(hourly rain rate mm/h) at T+3 hours
"""

import os
import sys
import pickle
import warnings
import numpy as np
import pandas as pd
from datetime import datetime
from pymongo import MongoClient
import certifi
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.preprocessing import StandardScaler
import xgboost as xgb

warnings.filterwarnings('ignore')

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

MONGODB_URI    = os.getenv('MONGODB_URI')
MODEL_PATH     = os.path.join(os.path.dirname(__file__), 'rain_model.pkl')
FORECAST_STEPS = 36     # 3 hours at 5-minute intervals
RAIN_THRESHOLD = 0.1    # mm/h — used only for reporting, not for gating


def fetch_rain_data():
    """Pull all historical weather records from MongoDB."""
    print("Connecting to MongoDB...")
    client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
    db     = client['test']
    col    = db['weathers']

    cursor = col.find({}).sort('date', 1)
    records = []
    for doc in cursor:
        d        = doc.get('data', {})
        temp_f   = d.get('tempf')
        pres_in  = d.get('baromrelin')
        wind_mph = d.get('windspeedmph', 0)

        records.append({
            'date':        doc.get('date'),
            'temp':        round((temp_f  - 32) * 5/9, 1)  if temp_f  else None,
            'humidity':    d.get('humidity'),
            'wind':        round(wind_mph * 1.60934, 2)     if wind_mph else 0,
            'pressure':    round(pres_in  * 33.8639, 1)     if pres_in  else None,
            'hourly_rain': round(d.get('hourlyrainin', 0) * 25.4, 2),
            'daily_rain':  round(d.get('dailyrainin',  0) * 25.4, 2),
        })

    client.close()
    df = pd.DataFrame(records)
    print(f"Fetched {len(df)} records")
    return df


def dew_point(temp_c, rh):
    """Magnus-formula dew point approximation (°C)."""
    a, b  = 17.27, 237.7
    alpha = (a * temp_c) / (b + temp_c) + np.log(rh / 100.0)
    return (b * alpha) / (a - alpha)


def engineer_features(df):
    """Build feature matrix; target = log1p(hourly_rain) at T+3h."""
    df = df.copy()
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)

    core = ['temp', 'humidity', 'wind', 'pressure', 'hourly_rain']
    df = df.dropna(subset=core).reset_index(drop=True)

    df = df.set_index('date').resample('5min').mean()
    df['hourly_rain'] = df['hourly_rain'].fillna(0)
    df = df.interpolate(method='linear', limit=12)
    df = df.dropna().reset_index()

    print(f"Records after resampling: {len(df)}")

    # Cyclical time
    hour = df['date'].dt.hour + df['date'].dt.minute / 60
    df['hour_sin'] = np.sin(2 * np.pi * hour / 24)
    df['hour_cos'] = np.cos(2 * np.pi * hour / 24)

    # Pressure tendency
    df['dp_1h'] = df['pressure'].diff(12)
    df['dp_3h'] = df['pressure'].diff(36)

    # Dew-point depression
    df['dew_point']      = dew_point(df['temp'], df['humidity'].clip(1, 100))
    df['dew_depression'] = df['temp'] - df['dew_point']

    # Humidity × pressure
    df['humid_pres'] = df['humidity'] * df['pressure']

    # Rain streak
    streak, streaks = 0, []
    for r in (df['hourly_rain'] > RAIN_THRESHOLD).astype(int):
        streak = streak + 1 if r else 0
        streaks.append(streak)
    df['rain_streak'] = streaks

    # Lagged features
    for lag in [12, 24, 36, 48, 72]:
        df[f'humidity_lag{lag}'] = df['humidity'].shift(lag)
        df[f'pressure_lag{lag}'] = df['pressure'].shift(lag)
        df[f'temp_lag{lag}']     = df['temp'].shift(lag)
        df[f'rain_lag{lag}']     = df['hourly_rain'].shift(lag)

    # Rolling stats
    df['rain_roll_1h']  = df['hourly_rain'].rolling(12).mean()
    df['rain_roll_3h']  = df['hourly_rain'].rolling(36).mean()
    df['humid_roll_3h'] = df['humidity'].rolling(36).mean()
    df['pres_roll_3h']  = df['pressure'].rolling(36).mean()

    # Target: log1p of rain rate 3h ahead
    df['target'] = np.log1p(df['hourly_rain'].shift(-FORECAST_STEPS))

    df = df.dropna().reset_index(drop=True)
    print(f"Feature rows after engineering: {len(df)}")
    return df


def build_and_train(df):
    """
    Train single-stage XGBoost regressor on log1p-transformed target.

    Key fix: sample_weight upweights rainy rows 15× so the model is heavily
    penalised for missing rain events. Without this it just predicts the
    dataset mean (a constant ~0.75 mm/day) because 98% of rows are zero.
    """
    drop_cols    = {'date', 'target', 'daily_rain', 'hourly_rain', 'dew_point'}
    feature_cols = [c for c in df.columns if c not in drop_cols]

    X = df[feature_cols].values
    y = df['target'].values          # log1p-space

    # Temporal split — no shuffling
    split     = int(len(X) * 0.85)
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]

    # ── Sample weights: upweight rainy rows 15× ─────────────────────
    rain_mask  = y_train > np.log1p(RAIN_THRESHOLD)
    weights    = np.ones(len(y_train))
    weights[rain_mask] = 15.0
    print(f"Train: {len(X_train)} | Val: {len(X_val)}")
    print(f"Rainy train rows: {rain_mask.sum()} / {len(y_train)}  (weighted 15×)")

    scaler     = StandardScaler()
    X_train_s  = scaler.fit_transform(X_train)
    X_val_s    = scaler.transform(X_val)

    model = xgb.XGBRegressor(
        n_estimators          = 800,
        max_depth             = 7,        # deeper trees to capture rain pattern
        learning_rate         = 0.03,
        subsample             = 0.8,
        colsample_bytree      = 0.8,
        gamma                 = 0,        # removed min-gain penalty
        reg_alpha             = 0.05,
        reg_lambda            = 0.5,      # less L2 smoothing
        min_child_weight      = 1,        # allow splits on small rainy groups
        objective             = 'reg:squarederror',
        eval_metric           = 'mae',
        early_stopping_rounds = 40,
        n_jobs                = -1,
        random_state          = 42,
        verbosity             = 0,
    )

    model.fit(X_train_s, y_train,
              sample_weight=weights,
              eval_set=[(X_val_s, y_val)],
              verbose=False)

    # Evaluate in original mm/h space
    log_preds = model.predict(X_val_s)
    preds     = np.expm1(np.clip(log_preds, 0, None))
    y_real    = np.expm1(np.clip(y_val,     0, None))

    mae  = mean_absolute_error(y_real, preds)
    rmse = np.sqrt(mean_squared_error(y_real, preds))

    print(f"\n{'='*55}")
    print(f"  XGBoost Rain Model (log1p) — Validation Results")
    print(f"  MAE  : {mae:.4f} mm/h")
    print(f"  RMSE : {rmse:.4f} mm/h")
    print(f"{'='*55}")

    bundle = {
        'model':        model,
        'scaler':       scaler,
        'feature_cols': feature_cols,
        'rain_threshold': RAIN_THRESHOLD,
        'mae':          round(mae,  4),
        'rmse':         round(rmse, 4),
        'trained_at':   datetime.now().isoformat(),
        'version':      3,
    }
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(bundle, f)
    print(f"\nModel saved → {MODEL_PATH}")
    return bundle


if __name__ == '__main__':
    print("=" * 55)
    print("  Rainfall XGBoost Model (log1p) — Training")
    print("=" * 55)

    df = fetch_rain_data()
    df = engineer_features(df)

    if len(df) < 500:
        print("ERROR: Not enough data to train. Need at least 500 rows.")
        sys.exit(1)

    build_and_train(df)
    print("\nDone!")
