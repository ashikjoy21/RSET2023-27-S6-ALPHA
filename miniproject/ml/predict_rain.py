#!/usr/bin/env python3
"""
Rainfall Prediction Script
Loads the trained two-stage XGBoost model and generates a 3-hour-ahead
rainfall prediction for each day over the next 10 days.

Output (JSON):
  {
    "success": true,
    "rainForecast": [
      { "date": "2026-03-19", "predictedRain": 2.3, "unit": "mm/day" },
      ...
    ]
  }
"""

import os
import sys
import json
import pickle
import warnings
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pymongo import MongoClient
import certifi

warnings.filterwarnings('ignore')

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

MONGODB_URI    = os.getenv('MONGODB_URI')
MODEL_PATH     = os.path.join(os.path.dirname(__file__), 'rain_model.pkl')
FORECAST_STEPS = 36       # 3 hours at 5-min intervals
RAIN_THRESHOLD = 0.1      # mm/h – classifier boundary


def fetch_recent_data():
    """Fetch ~50 hours of recent sensor readings for feature engineering."""
    client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
    db     = client['test']
    col    = db['weathers']

    # 600 records ≈ 50 hours at 5-min intervals — enough for all lag windows
    cursor = col.find({}).sort('date', -1).limit(600)
    records = []
    for doc in cursor:
        d = doc.get('data', {})
        temp_f   = d.get('tempf')
        pres_in  = d.get('baromrelin')
        wind_mph = d.get('windspeedmph', 0)

        records.append({
            'date':        doc.get('date'),
            'temp':        round((temp_f  - 32) * 5/9, 1) if temp_f  else None,
            'humidity':    d.get('humidity'),
            'wind':        round(wind_mph * 1.60934, 2)   if wind_mph else 0,
            'pressure':    round(pres_in  * 33.8639, 1)   if pres_in  else None,
            'hourly_rain': round(d.get('hourlyrainin', 0) * 25.4, 2),
            'daily_rain':  round(d.get('dailyrainin',  0) * 25.4, 2),
        })

    client.close()

    df = pd.DataFrame(records)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)
    return df


def dew_point(temp_c, rh):
    """Magnus-formula dew point approximation (°C)."""
    a, b = 17.27, 237.7
    alpha = (a * temp_c) / (b + temp_c) + np.log(rh / 100.0)
    return (b * alpha) / (a - alpha)


def build_feature_row(df, feature_cols):
    """
    Reproduce the same feature engineering used at training time,
    then return the LAST row (most recent reading) as a feature vector.
    """
    df = df.copy()
    core = ['temp', 'humidity', 'wind', 'pressure']
    df = df.dropna(subset=core).reset_index(drop=True)

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

    if len(df) == 0:
        return None, df

    # Align to the exact columns the model was trained on
    for c in feature_cols:
        if c not in df.columns:
            df[c] = 0.0

    last_row = df[feature_cols].iloc[[-1]].values
    return last_row, df


def predict_mmh(model, scaler, X_raw):
    """Single-stage: scale → log1p-space predict → expm1 → clip ≥ 0."""
    X_scaled = scaler.transform(X_raw)
    log_pred = model.predict(X_scaled)
    return float(np.expm1(np.clip(log_pred[0], 0, None)))


def predict_rain_next_10_days():
    """
    Generate 3-hour-ahead rain predictions for the next 10 days.
    Daily total = predicted mm/h × 24 h.
    """
    if not os.path.exists(MODEL_PATH):
        return {
            'success': False,
            'error':   'Rain model not trained. Run train_rain_model.py first.'
        }

    with open(MODEL_PATH, 'rb') as f:
        bundle = pickle.load(f)

    model        = bundle['model']
    scaler       = bundle['scaler']
    feature_cols = bundle['feature_cols']
    threshold    = bundle.get('rain_threshold', RAIN_THRESHOLD)

    df_raw = fetch_recent_data()
    X_last, df_eng = build_feature_row(df_raw, feature_cols)

    if X_last is None or len(X_last) == 0:
        return {
            'success': False,
            'error':   'Not enough recent sensor data for prediction.'
        }

    forecasts  = []
    base_date  = datetime.now()
    idx_sin    = feature_cols.index('hour_sin') if 'hour_sin' in feature_cols else -1
    idx_cos    = feature_cols.index('hour_cos') if 'hour_cos' in feature_cols else -1

    for day_offset in range(1, 11):
        target_date = base_date + timedelta(days=day_offset)

        # Adjust cyclical time to noon for the forecast day
        X_day = X_last.copy().astype(float)
        if idx_sin >= 0:
            X_day[0, idx_sin] = np.sin(2 * np.pi * 12 / 24)
        if idx_cos >= 0:
            X_day[0, idx_cos] = np.cos(2 * np.pi * 12 / 24)

        pred_mmh = predict_mmh(model, scaler, X_day)

        # Daily total: mm/h × 24 hours (consistent with backtest actuals)
        pred_mm_day = round(pred_mmh * 24, 2)

        forecasts.append({
            'date':          target_date.strftime('%Y-%m-%d'),
            'displayDate':   target_date.strftime('%a, %b %d'),
            'predictedRain': pred_mm_day,
            'rainfallRate':  round(pred_mmh, 3),
            'unit':          'mm/day',
            'confidence':    'high' if pred_mmh > threshold else 'low'
        })

    return {
        'success':         True,
        'generatedAt':     datetime.now().isoformat(),
        'modelMAE':        bundle.get('mae'),
        'modelRMSE':       bundle.get('rmse'),
        'forecastHorizon': '3 hours ahead',
        'rainForecast':    forecasts
    }


if __name__ == '__main__':
    result = predict_rain_next_10_days()
    print(json.dumps(result, indent=2))
