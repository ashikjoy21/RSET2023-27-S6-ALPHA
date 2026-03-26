#!/usr/bin/env python3
"""
Weather Prediction Model Training Script (Enhanced Version)
Trains an improved LSTM neural network for more accurate 10-day forecasting.

Improvements over original:
- 7-day lookback window (instead of 24 hours)
- Cyclical time features (hour of day, day of year)
- Deeper model with Bidirectional LSTM
- Daily aggregates (min/max/mean) as targets
- Lower learning rate with more epochs
- L2 regularization to reduce overfitting
"""

import os
import sys
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pymongo import MongoClient
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
import pickle
import warnings
import certifi
warnings.filterwarnings('ignore')

# TensorFlow imports
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, Bidirectional, BatchNormalization
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from tensorflow.keras.regularizers import l2

# Load environment variables
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Configuration
MONGODB_URI = os.getenv('MONGODB_URI')
SEQUENCE_LENGTH = 288 * 7  # 7 days of 5-min data (2016 timesteps)
FORECAST_DAYS = 10
SAMPLES_PER_DAY = 288
BASE_FEATURES = ['temp', 'humidity', 'wind', 'pressure']
# Extended features with time encoding
FEATURES = ['temp', 'humidity', 'wind', 'pressure', 'hour_sin', 'hour_cos', 'day_sin', 'day_cos']
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'weather_model.keras')
SCALER_PATH = os.path.join(os.path.dirname(__file__), 'scaler.pkl')


def fetch_data_from_mongodb():
    """Fetch all historical weather data from MongoDB."""
    print("Connecting to MongoDB...")
    client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
    db = client['test']
    collection = db['weathers']
    
    print("Fetching historical data...")
    cursor = collection.find({}).sort('date', 1)
    
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
    print(f"Fetched {len(df)} records")
    return df


def add_time_features(df):
    """Add cyclical time features for better temporal pattern learning."""
    df['hour'] = df['date'].dt.hour + df['date'].dt.minute / 60.0
    df['day_of_year'] = df['date'].dt.dayofyear
    
    # Cyclical encoding (sin/cos) to preserve circular nature
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['day_sin'] = np.sin(2 * np.pi * df['day_of_year'] / 365)
    df['day_cos'] = np.cos(2 * np.pi * df['day_of_year'] / 365)
    
    return df


def preprocess_data(df):
    """Clean and prepare data for training."""
    print("Preprocessing data...")
    
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)
    df = df.dropna(subset=BASE_FEATURES)
    print(f"Records after cleaning: {len(df)}")
    
    # Resample to ensure consistent 5-minute intervals
    df = df.set_index('date')
    df = df.resample('5min').mean()
    df = df.interpolate(method='linear', limit=12)
    df = df.dropna()
    df = df.reset_index()
    
    # Add time features
    df = add_time_features(df)
    
    print(f"Records after resampling: {len(df)}")
    return df


def create_sequences_with_daily_targets(data, dates, seq_length, forecast_days):
    """
    Create input sequences with daily aggregate targets.
    Each target day has: [mean_temp, min_temp, max_temp, mean_humidity, mean_wind, mean_pressure]
    """
    X, y = [], []
    target_features = 6  # mean_temp, min_temp, max_temp, humidity, wind, pressure
    
    for i in range(len(data) - seq_length - forecast_days * SAMPLES_PER_DAY + 1):
        # Input sequence
        X.append(data[i:i + seq_length])
        
        # Calculate daily aggregates for each forecast day
        daily_targets = []
        for d in range(forecast_days):
            start_idx = i + seq_length + d * SAMPLES_PER_DAY
            end_idx = start_idx + SAMPLES_PER_DAY
            
            if end_idx > len(data):
                break
            
            day_data = data[start_idx:end_idx]
            # temp is index 0 in BASE_FEATURES order
            mean_temp = np.mean(day_data[:, 0])
            min_temp = np.min(day_data[:, 0])
            max_temp = np.max(day_data[:, 0])
            mean_humidity = np.mean(day_data[:, 1])
            mean_wind = np.mean(day_data[:, 2])
            mean_pressure = np.mean(day_data[:, 3])
            
            daily_targets.append([mean_temp, min_temp, max_temp, mean_humidity, mean_wind, mean_pressure])
        
        if len(daily_targets) == forecast_days:
            y.append(daily_targets)
        else:
            X.pop()
    
    return np.array(X), np.array(y)


def build_enhanced_model(input_shape, output_shape):
    """Build enhanced LSTM model with bidirectional layers and regularization."""
    print(f"Building enhanced model: input={input_shape}, output={output_shape}")
    
    model = Sequential([
        # First Bidirectional LSTM layer
        Bidirectional(LSTM(256, return_sequences=True, kernel_regularizer=l2(0.001)), 
                      input_shape=input_shape),
        BatchNormalization(),
        Dropout(0.3),
        
        # Second Bidirectional LSTM layer
        Bidirectional(LSTM(128, return_sequences=True, kernel_regularizer=l2(0.001))),
        BatchNormalization(),
        Dropout(0.3),
        
        # Third LSTM layer
        LSTM(64, return_sequences=False, kernel_regularizer=l2(0.001)),
        BatchNormalization(),
        Dropout(0.2),
        
        # Dense layers
        Dense(128, activation='relu', kernel_regularizer=l2(0.001)),
        BatchNormalization(),
        Dropout(0.2),
        
        Dense(64, activation='relu'),
        Dense(output_shape[0] * output_shape[1])  # days * features_per_day
    ])
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.0005),
        loss='huber',  # More robust to outliers than MSE
        metrics=['mae']
    )
    
    return model


def train_model():
    """Main training function."""
    print("=" * 60)
    print("Enhanced Weather Prediction Model Training")
    print("=" * 60)
    
    # Fetch and preprocess data
    df = fetch_data_from_mongodb()
    df = preprocess_data(df)
    
    min_required = SEQUENCE_LENGTH + FORECAST_DAYS * SAMPLES_PER_DAY
    if len(df) < min_required:
        print(f"ERROR: Not enough data. Have {len(df)}, need {min_required}.")
        sys.exit(1)
    
    # Extract features and normalize
    feature_data = df[FEATURES].values
    base_feature_data = df[BASE_FEATURES].values
    dates = df['date'].values
    
    # Scale features (separate scaler for base features used in targets)
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled_data = scaler.fit_transform(feature_data)
    
    # Save scaler for prediction
    with open(SCALER_PATH, 'wb') as f:
        pickle.dump(scaler, f)
    print(f"Scaler saved to {SCALER_PATH}")
    
    # Create sequences with daily aggregate targets
    print("Creating training sequences (this may take a while)...")
    X, y = create_sequences_with_daily_targets(
        scaled_data, dates, SEQUENCE_LENGTH, FORECAST_DAYS
    )
    print(f"Created {len(X)} sequences")
    
    if len(X) == 0:
        print("ERROR: Could not create any training sequences.")
        sys.exit(1)
    
    # Reshape y
    y = y.reshape(y.shape[0], -1)  # (samples, days * 6)
    
    # Split data (keep temporal order)
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.15, shuffle=False
    )
    print(f"Training samples: {len(X_train)}, Validation samples: {len(X_val)}")
    
    # Build model
    model = build_enhanced_model(
        input_shape=(SEQUENCE_LENGTH, len(FEATURES)),
        output_shape=(FORECAST_DAYS, 6)  # 6 features per day
    )
    model.summary()
    
    callbacks = [
        EarlyStopping(
            monitor='val_loss',
            patience=20,
            restore_best_weights=True,
            verbose=1
        ),
        ModelCheckpoint(
            MODEL_PATH,
            monitor='val_loss',
            save_best_only=True,
            verbose=1
        ),
        ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=7,
            min_lr=0.00001,
            verbose=1
        )
    ]
    
    print("\nStarting training...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=200,
        batch_size=16,
        callbacks=callbacks,
        verbose=1
    )
    
    # Save final model
    model.save(MODEL_PATH)
    print(f"\nModel saved to {MODEL_PATH}")
    
    # Print training summary
    final_loss = min(history.history['val_loss'])
    final_mae = min(history.history['val_mae'])
    print("\n" + "=" * 60)
    print("Training Complete!")
    print(f"Best Validation Loss: {final_loss:.4f}")
    print(f"Best Validation MAE: {final_mae:.4f}")
    print("=" * 60)
    
    return model, scaler


if __name__ == '__main__':
    train_model()
