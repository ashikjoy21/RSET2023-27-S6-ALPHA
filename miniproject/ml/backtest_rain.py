#!/usr/bin/env python3
"""
Rain Model Backtesting Script
Retroactively evaluates the two-stage XGBoost rainfall model against
historical observed data.

For each of the last N days:
  - Uses sensor features from 3 hours before midnight (simulating T+3 prediction)
  - Predicts with the trained two-stage model
  - Compares against actual MAX daily rain reading (dailyrainin peak)

Actual daily rainfall is taken as: max(daily_rain) within each day
(the rain gauge accumulates through the day; peak = total for the day).
This is consistent with the × 24 formula used for predictions.

Output (JSON):
  {
    "success": true,
    "data": [
      { "date": "...", "displayDate": "...",
        "predicted": {"rainfall": X},
        "actual":    {"rainfall": Y},
        "variation": {"rainfall": Z} }
    ],
    "metrics": { "rainfall": { "mae": X, "rmse": Y, "dataPoints": N } }
  }
"""

import os
import sys
import json
import pickle
import warnings
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
import certifi

warnings.filterwarnings('ignore')

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

MONGODB_URI   = os.getenv('MONGODB_URI')
MODEL_PATH    = os.path.join(os.path.dirname(__file__), 'rain_model.pkl')
BACKTEST_DAYS = 30      # compare last 30 days
FORECAST_LAG  = 36      # 3h ahead in 5-min steps
RAIN_THRESHOLD = 0.1    # mm/h


def fetch_data(days_back=35):
    """Fetch weather records from MongoDB for the last N days."""
    client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
    db     = client['test']
    col    = db['weathers']

    since = datetime.now(timezone.utc) - timedelta(days=days_back)
    cursor = col.find({'date': {'$gte': since}}).sort('date', 1)

    records = []
    for doc in cursor:
        d = doc.get('data', {})
        temp_f  = d.get('tempf')
        pres_in = d.get('baromrelin')
        wmph    = d.get('windspeedmph', 0)
        records.append({
            'date':        doc.get('date'),
            'temp':        round((temp_f - 32) * 5/9, 1) if temp_f  else None,
            'humidity':    d.get('humidity'),
            'wind':        round(wmph * 1.60934, 2)       if wmph    else 0,
            'pressure':    round(pres_in * 33.8639, 1)    if pres_in else None,
            'hourly_rain': round(d.get('hourlyrainin', 0) * 25.4, 2),
            'daily_rain':  round(d.get('dailyrainin',  0) * 25.4, 2),
        })

    client.close()
    df = pd.DataFrame(records)
    df['date'] = pd.to_datetime(df['date'], utc=True).dt.tz_localize(None)
    df = df.sort_values('date').reset_index(drop=True)
    return df


def dew_point(temp_c, rh):
    """Magnus-formula dew point approximation (°C)."""
    a, b = 17.27, 237.7
    alpha = (a * temp_c) / (b + temp_c) + np.log(rh / 100.0)
    return (b * alpha) / (a - alpha)


def build_features(df, feature_cols):
    """Reproduce the same feature engineering used during training."""
    df = df.dropna(subset=['temp', 'humidity', 'wind', 'pressure']).reset_index(drop=True)

    df = df.set_index('date').resample('5min').mean()
    df['hourly_rain'] = df['hourly_rain'].fillna(0)
    df = df.interpolate(method='linear', limit=12).dropna().reset_index()

    # Cyclical time
    hour = df['date'].dt.hour + df['date'].dt.minute / 60
    df['hour_sin'] = np.sin(2 * np.pi * hour / 24)
    df['hour_cos'] = np.cos(2 * np.pi * hour / 24)

    # Pressure tendency
    df['dp_1h'] = df['pressure'].diff(12)
    df['dp_3h'] = df['pressure'].diff(36)

    # Dew point depression
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

    df = df.dropna().reset_index(drop=True)

    # Ensure all model columns present
    for c in feature_cols:
        if c not in df.columns:
            df[c] = 0.0

    return df[['date'] + feature_cols]


def predict_mmh(model, scaler, X_raw):
    """Single-stage: scale → log1p-space predict → expm1 → clip ≥ 0."""
    X_scaled = scaler.transform(X_raw)
    log_pred = model.predict(X_scaled)
    return float(np.expm1(np.clip(log_pred[0], 0, None)))


def run_backtest():
    if not os.path.exists(MODEL_PATH):
        return {'success': False,
                'error': 'Rain model not trained. Run train_rain_model.py first.'}

    with open(MODEL_PATH, 'rb') as f:
        bundle = pickle.load(f)

    reg          = bundle['model']
    clf          = bundle.get('classifier')
    scaler       = bundle['scaler']
    feature_cols = bundle['feature_cols']

    df_raw = fetch_data(days_back=35)
    if df_raw.empty:
        return {'success': False, 'error': 'No historical data found.'}

    df_feat = build_features(df_raw.copy(), feature_cols)
    if df_feat.empty:
        return {'success': False, 'error': 'Not enough data for backtesting.'}

    today   = datetime.now()
    results = []

    for day_offset in range(BACKTEST_DAYS, 0, -1):
        target_date = (today - timedelta(days=day_offset)).replace(
            hour=0, minute=0, second=0, microsecond=0)
        target_end  = target_date + timedelta(days=1)

        # Feature row: last 5-min reading available 3h before midnight
        feature_cutoff = target_date - timedelta(hours=3)
        hist_rows = df_feat[df_feat['date'] <= feature_cutoff]
        if hist_rows.empty:
            continue

        X_row = hist_rows[feature_cols].iloc[[-1]].values

        pred_mmh = predict_mmh(reg, scaler, X_row)

        # Predicted daily total: mm/h × 24 hours
        pred_mm_day = round(pred_mmh * 24, 2)

        # ── Actual daily rainfall ────────────────────────────────────
        # Use peak of daily_rain (cumulative gauge) within the day.
        # Peak value = total rain accumulated by end of day.
        actual_rows = df_raw[
            (df_raw['date'] >= target_date) & (df_raw['date'] < target_end)
        ]
        if actual_rows.empty:
            continue

        peak_daily = actual_rows['daily_rain'].max()
        actual_mm_day = round(float(peak_daily), 2) if not np.isnan(peak_daily) else None

        if actual_mm_day is None:
            continue

        variation = round(pred_mm_day - actual_mm_day, 2)

        results.append({
            'date':        target_date.strftime('%Y-%m-%d'),
            'displayDate': target_date.strftime('%a, %b %d'),
            'predicted':   {'rainfall': pred_mm_day},
            'actual':      {'rainfall': actual_mm_day},
            'variation':   {'rainfall': variation}
        })

    if results:
        errors = [abs(r['variation']['rainfall']) for r in results]
        mae  = round(sum(errors) / len(errors), 2)
        rmse = round((sum(e**2 for e in errors) / len(errors))**0.5, 2)
        metrics = {'rainfall': {'mae': mae, 'rmse': rmse, 'dataPoints': len(results)}}
    else:
        metrics = {'rainfall': None}

    return {
        'success': True,
        'data':    results,
        'metrics': metrics
    }


if __name__ == '__main__':
    print(json.dumps(run_backtest(), indent=2))
