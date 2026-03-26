#!/usr/bin/env node
/**
 * Backfill script to fetch historical weather data for specific dates
 * Usage: node scripts/backfill-dates.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const ambientWeather = require('../utils/ambient-weather');
const Weather = require('../models/Weather');

dotenv.config();

// Dates to backfill (YYYY-MM-DD format)
const DATES_TO_BACKFILL = [
    '2026-02-06', '2026-02-07', '2026-02-08', '2026-02-09', '2026-02-10',
    '2026-02-11', '2026-02-12', '2026-02-13', '2026-02-14', '2026-02-15',
    '2026-02-16'
];

async function backfillDates() {
    console.log('='.repeat(60));
    console.log('Weather Data Backfill Script');
    console.log('='.repeat(60));
    console.log(`Dates to fetch: ${DATES_TO_BACKFILL.join(', ')}`);
    console.log('');

    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!\n');

    // Get device info
    console.log('Fetching device info...');
    const devices = await ambientWeather.getDevices();

    if (!devices || devices.length === 0) {
        console.log('No devices found!');
        process.exit(1);
    }

    const device = devices[0];
    console.log(`Device: ${device.info?.name || device.macAddress}`);
    console.log(`MAC: ${device.macAddress}\n`);

    let totalSaved = 0;

    for (const dateStr of DATES_TO_BACKFILL) {
        console.log(`\n--- Fetching data for ${dateStr} ---`);

        // Wait to respect API rate limit (1 req/sec)
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
            // Fetch data ending at the END of the day (23:59:59)
            // The API returns data BEFORE the endDate timestamp
            const endOfDay = new Date(dateStr + 'T23:59:59.000Z').getTime();

            // Fetch up to 288 records (full day of 5-min intervals)
            const data = await ambientWeather.getDeviceData(device.macAddress, 288, endOfDay);

            if (!Array.isArray(data) || data.length === 0) {
                console.log(`  No data available for ${dateStr}`);
                continue;
            }

            // Filter to only keep records from the target date
            const targetRecords = data.filter(record => {
                const recordDate = new Date(record.date).toISOString().split('T')[0];
                return recordDate === dateStr;
            });

            console.log(`  Found ${targetRecords.length} records for ${dateStr}`);

            if (targetRecords.length === 0) {
                console.log(`  No records match target date ${dateStr}`);
                continue;
            }

            // Save to MongoDB using upsert
            const bulkOps = targetRecords.map(record => ({
                updateOne: {
                    filter: {
                        macAddress: device.macAddress,
                        date: new Date(record.date)
                    },
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
            const saved = result.upsertedCount + result.modifiedCount;
            totalSaved += saved;
            console.log(`  Saved ${saved} records to database`);

        } catch (error) {
            console.error(`  Error fetching ${dateStr}: ${error.message}`);

            // If rate limited, wait longer
            if (error.message.includes('429') || error.message.includes('rate')) {
                console.log('  Rate limited, waiting 5 seconds...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Backfill complete! Total records saved: ${totalSaved}`);
    console.log('='.repeat(60));

    await mongoose.disconnect();
    process.exit(0);
}

backfillDates().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
