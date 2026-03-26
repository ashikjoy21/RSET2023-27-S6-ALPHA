#!/usr/bin/env python3
"""
Weather Prediction Script (Enhanced Version)
Loads trained LSTM model and generates accurate 10-day weather forecast.
"""

import os
import sys
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pymongo import MongoClient
import pickle
import warnings
import certifi
warnings.filterwarnings('ignore')

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Configuration - must match training
MONGODB_URI = os.getenv('MONGODB_URI')
SEQUENCE_LENGTH = 288 * 7  # 7 days lookback
BASE_FEATURES = ['temp', 'humidity', 'wind', 'pressure']
FEATURES = ['temp', 'humidity', 'wind', 'pressure', 'hour_sin', 'hour_cos', 'day_sin', 'day_cos']
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'weather_model.keras')
SCALER_PATH = os.path.join(os.path.dirname(__file__), 'scaler.pkl')
FORECAST_DAYS = 10


def add_time_features(df):
    """Add cyclical time features."""
    df['hour'] = df['date'].dt.hour + df['date'].dt.minute / 60.0
    df['day_of_year'] = df['date'].dt.dayofyear
    
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['day_sin'] = np.sin(2 * np.pi * df['day_of_year'] / 365)
    df['day_cos'] = np.cos(2 * np.pi * df['day_of_year'] / 365)
    
    return df


def fetch_recent_data():
    """Fetch the most recent data for prediction input."""
    client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
    db = client['test']
    collection = db['weathers']
    
    # Get enough recent data (7 days + buffer)
    cursor = collection.find({}).sort('date', -1).limit(SEQUENCE_LENGTH + 500)
    
    records = []
    for doc in cursor:
        data = doc.get('data', {})
        temp_f = data.get('tempf')
        temp_c = round((temp_f - 32) * 5 / 9, 1) if temp_f else None
        
        pressure_in = data.get('baromrelin')
        pressure_hpa = round(pressure_in * 33.8639, 1) if pressure_in else None
        
        wind_mph = data.get('windspeedmph', 0)
        wind_kmh = round(wind_mph * 1.60934, 2) if wind_mph else 0
        
        records.append({
            'date': doc.get('date'),
            'temp': temp_c,
            'humidity': data.get('humidity'),
            'wind': wind_kmh,
            'pressure': pressure_hpa
        })
    
    client.close()
    
    df = pd.DataFrame(records)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)
    df = df.dropna(subset=BASE_FEATURES)
    
    # Add time features
    df = add_time_features(df)
    
    # Take the last SEQUENCE_LENGTH records
    if len(df) >= SEQUENCE_LENGTH:
        df = df.tail(SEQUENCE_LENGTH)
    
    return df


def generate_forecast():
    """Generate 10-day weather forecast."""
    # Check if model exists
    if not os.path.exists(MODEL_PATH):
        return {
            'error': 'Model not trained yet. Run train_model.py first.',
            'success': False
        }
    
    if not os.path.exists(SCALER_PATH):
        return {
            'error': 'Scaler not found. Run train_model.py first.',
            'success': False
        }
    
    # Load model and scaler
    model = tf.keras.models.load_model(MODEL_PATH)
    with open(SCALER_PATH, 'rb') as f:
        scaler = pickle.load(f)
    
    # Get recent data
    df = fetch_recent_data()
    
    if len(df) < SEQUENCE_LENGTH:
        return {
            'error': f'Not enough recent data. Have {len(df)}, need {SEQUENCE_LENGTH}.',
            'success': False
        }
    
    # Prepare input with all features
    feature_data = df[FEATURES].values
    scaled_data = scaler.transform(feature_data)
    
    # Reshape for prediction
    X = scaled_data.reshape(1, SEQUENCE_LENGTH, len(FEATURES))
    
    # Predict
    prediction_scaled = model.predict(X, verbose=0)
    
    # Reshape prediction: (1, days * 6) -> (days, 6)
    # Each day has: [mean_temp, min_temp, max_temp, humidity, wind, pressure]
    prediction_scaled = prediction_scaled.reshape(FORECAST_DAYS, 6)
    
    # Inverse transform - we need to handle this carefully since targets 
    # are different from input features. For now, use approximate unscaling
    # based on the temperature scaling parameters
    
    # Get min/max from scaler for inverse transform
    temp_min, temp_max = scaler.data_min_[0], scaler.data_max_[0]
    humidity_min, humidity_max = scaler.data_min_[1], scaler.data_max_[1]
    wind_min, wind_max = scaler.data_min_[2], scaler.data_max_[2]
    pressure_min, pressure_max = scaler.data_min_[3], scaler.data_max_[3]
    
    # Manual inverse transform for each feature
    prediction = np.zeros_like(prediction_scaled)
    prediction[:, 0] = prediction_scaled[:, 0] * (temp_max - temp_min) + temp_min  # mean_temp
    prediction[:, 1] = prediction_scaled[:, 1] * (temp_max - temp_min) + temp_min  # min_temp
    prediction[:, 2] = prediction_scaled[:, 2] * (temp_max - temp_min) + temp_min  # max_temp
    prediction[:, 3] = prediction_scaled[:, 3] * (humidity_max - humidity_min) + humidity_min
    prediction[:, 4] = prediction_scaled[:, 4] * (wind_max - wind_min) + wind_min
    prediction[:, 5] = prediction_scaled[:, 5] * (pressure_max - pressure_min) + pressure_min
    
    # Build forecast response
    base_date = datetime.now()
    forecasts = []
    
    for i in range(FORECAST_DAYS):
        forecast_date = base_date + timedelta(days=i + 1)
        mean_temp = float(prediction[i][0])
        min_temp = float(prediction[i][1])
        max_temp = float(prediction[i][2])
        
        forecasts.append({
            'date': forecast_date.strftime('%Y-%m-%d'),
            'dayName': forecast_date.strftime('%A'),
            'temp': round(mean_temp, 1),
            'tempMin': round(min_temp, 1),
            'tempMax': round(max_temp, 1),
            'humidity': round(float(prediction[i][3]), 0),
            'wind': round(float(prediction[i][4]) + 1.0, 1),
            'pressure': round(float(prediction[i][5]), 1),
            'condition': get_condition(prediction[i][3], prediction[i][4])
        })
    
    # Get current conditions for context
    current = df.iloc[-1]
    
    return {
        'success': True,
        'generatedAt': datetime.now().isoformat(),
        'modelVersion': 'enhanced-v2',
        'lookbackDays': 7,
        'currentConditions': {
            'temp': float(current['temp']),
            'humidity': float(current['humidity']),
            'wind': float(current['wind']),
            'pressure': float(current['pressure'])
        },
        'forecast': forecasts
    }


def get_condition(humidity, wind):
    """Estimate weather condition based on humidity and wind."""
    if humidity > 85:
        return 'Rainy'
    elif humidity > 70:
        return 'Cloudy'
    elif humidity > 50:
        return 'Partly Cloudy'
    elif wind > 20:
        return 'Windy'
    else:
        return 'Clear'


if __name__ == '__main__':
    result = generate_forecast()
    print(json.dumps(result, indent=2))
