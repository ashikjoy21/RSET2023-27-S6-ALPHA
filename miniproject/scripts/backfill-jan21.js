#!/usr/bin/env node
/**
 * Backfill script to fetch historical weather data for Jan 21 only
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const ambientWeather = require('../utils/ambient-weather');
const Weather = require('../models/Weather');

dotenv.config();

const DATE_TO_FETCH = '2026-01-21';

async function backfillDate() {
    console.log('Fetching data for:', DATE_TO_FETCH);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const devices = await ambientWeather.getDevices();
    const device = devices[0];
    console.log('Device:', device.macAddress);

    // Wait 2 seconds to help with rate limit
    await new Promise(resolve => setTimeout(resolve, 2000));

    const endOfDay = new Date(DATE_TO_FETCH + 'T23:59:59.000Z').getTime();
    const data = await ambientWeather.getDeviceData(device.macAddress, 288, endOfDay);

    if (!Array.isArray(data) || data.length === 0) {
        console.log('No data available');
        process.exit(1);
    }

    const targetRecords = data.filter(record => {
        const recordDate = new Date(record.date).toISOString().split('T')[0];
        return recordDate === DATE_TO_FETCH;
    });

    console.log(`Found ${targetRecords.length} records`);

    if (targetRecords.length > 0) {
        const bulkOps = targetRecords.map(record => ({
            updateOne: {
                filter: { macAddress: device.macAddress, date: new Date(record.date) },
                update: {
                    macAddress: device.macAddress,
                    date: new Date(record.date),
                    data: record,
                    fetchedAt: new Date()
                },
                upsert: true
            }
        }));

        const result = await Weather.bulkWrite(bulkOps);
        console.log(`Saved ${result.upsertedCount + result.modifiedCount} records`);
    }

    await mongoose.disconnect();
}

backfillDate().catch(console.error);
