const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
    // When this prediction was generated
    generatedAt: {
        type: Date,
        required: true,
        index: true
    },
    // The date being predicted (forecast date)
    forecastDate: {
        type: Date,
        required: true,
        index: true
    },
    // Predicted values from the LSTM model (+ XGBoost rainfall)
    predictions: {
        temp:     { type: Number },
        humidity: { type: Number },
        wind:     { type: Number },
        pressure: { type: Number },
        rainfall: { type: Number, default: null }  // mm/day, from XGBoost rain model
    },
    // Actual observed values (populated when data becomes available)
    actual: {
        temp: { type: Number, default: null },
        humidity: { type: Number, default: null },
        wind: { type: Number, default: null },
        pressure: { type: Number, default: null },
        populatedAt: { type: Date, default: null }
    }
});

// Compound index to ensure one prediction per forecast date per generation
predictionSchema.index({ generatedAt: 1, forecastDate: 1 }, { unique: true });

module.exports = mongoose.model('Prediction', predictionSchema);
