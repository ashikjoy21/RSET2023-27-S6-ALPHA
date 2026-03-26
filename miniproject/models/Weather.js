const mongoose = require('mongoose');

const weatherSchema = new mongoose.Schema({
    macAddress: {
        type: String,
        required: true,
        index: true
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    data: {
        type: Object,
        required: true
    },
    fetchedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure uniqueness of records per device/time
weatherSchema.index({ macAddress: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Weather', weatherSchema);
