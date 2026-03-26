const mongoose = require('mongoose');
const dotenv = require('dotenv');
const ambientWeather = require('../utils/ambient-weather');
const Weather = require('../models/Weather');

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/weather-station';

// Backfill from September 1, 2025 to now
const START_DATE = new Date('2025-09-01T00:00:00.000Z');

async function backfill() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB.');

        // Get device info
        const devices = await ambientWeather.getDevices();
        if (!devices || devices.length === 0) {
            console.error('❌ No devices found.');
            return;
        }

        const macAddress = devices[0].macAddress;
        console.log(`📡 Device: ${macAddress}`);
        console.log(`📅 Backfilling from ${START_DATE.toDateString()} to now...`);

        let currentEndDate = null; // Start from most recent
        let totalSaved = 0;
        let batchCount = 0;
        const maxBatches = 150; // ~150 days of data (5 months)

        while (batchCount < maxBatches) {
            batchCount++;

            try {
                // Fetch 288 records (24 hours of 5-min data)
                const data = await ambientWeather.getDeviceData(macAddress, 288, currentEndDate);

                if (!Array.isArray(data) || data.length === 0) {
                    console.log('📭 No more data available from API.');
                    break;
                }

                // Check if we've gone past our start date
                const oldestRecord = data[data.length - 1];
                const oldestDate = new Date(oldestRecord.date);

                if (oldestDate < START_DATE) {
                    console.log(`📅 Reached target date (${START_DATE.toDateString()}). Finishing...`);
                    // Filter out records before start date
                    const filtered = data.filter(r => new Date(r.date) >= START_DATE);
                    if (filtered.length > 0) {
                        await saveRecords(macAddress, filtered);
                        totalSaved += filtered.length;
                    }
                    break;
                }

                // Save all records
                await saveRecords(macAddress, data);
                totalSaved += data.length;

                // Progress update every 10 batches
                if (batchCount % 10 === 0) {
                    console.log(`📊 Progress: ${batchCount} batches, ${totalSaved} records saved. Oldest: ${oldestDate.toDateString()}`);
                }

                // Set endDate for next batch to get older data
                currentEndDate = oldestRecord.date;

                // Rate limiting: wait 1.1 seconds between requests
                await new Promise(resolve => setTimeout(resolve, 1100));

            } catch (err) {
                if (err.response?.data?.error === 'above-user-rate-limit') {
                    console.log('⏳ Rate limited. Waiting 5 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    batchCount--; // Retry this batch
                } else {
                    console.error(`❌ Error in batch ${batchCount}:`, err.message);
                    // Continue to next batch
                }
            }
        }

        console.log('\n✅ ========== BACKFILL COMPLETE ==========');
        console.log(`📊 Total records saved: ${totalSaved}`);
        console.log(`📦 Total batches processed: ${batchCount}`);

        // Get final count
        const totalInDB = await Weather.countDocuments({ macAddress });
        console.log(`🗄️  Total records in database: ${totalInDB}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Backfill failed:', error);
        process.exit(1);
    }
}

async function saveRecords(macAddress, records) {
    const bulkOps = records.map(record => ({
        updateOne: {
            filter: { macAddress, date: record.date },
            update: {
                macAddress,
                date: record.date,
                data: record,
                fetchedAt: new Date()
            },
            upsert: true
        }
    }));

    if (bulkOps.length > 0) {
        await Weather.bulkWrite(bulkOps, { ordered: false });
    }
}

console.log('🚀 Starting Historical Data Backfill...\n');
backfill();
