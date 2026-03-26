const ambientWeather = require('./ambient-weather');
const Weather = require('../models/Weather');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(fn, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const isRateLimit = error.response?.status === 429 ||
                error.response?.data?.error === 'above-user-rate-limit';
            if (isRateLimit && attempt < maxRetries) {
                // Ambient Weather requires waiting a full minute to reset rate limits
                const waitTime = 60000;
                console.log(`  ⏳ Rate limited (attempt ${attempt}/${maxRetries}). Waiting ${waitTime / 1000}s...`);
                await sleep(waitTime);
            } else {
                throw error;
            }
        }
    }
}

/**
 * Checks for missing days between the earliest record and yesterday,
 * then backfills them from the Ambient Weather API.
 */
const backfillMissingDays = async () => {
    try {
        console.log('🔍 Checking for missing days to backfill...');

        // Find the earliest record in the database
        const earliest = await Weather.findOne().sort({ date: 1 }).lean();
        if (!earliest) {
            console.log('📭 No records in database yet, skipping backfill.');
            return;
        }

        const startDate = new Date(earliest.date);
        startDate.setUTCHours(0, 0, 0, 0);

        // Yesterday (we don't backfill today since it's still in progress)
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        yesterday.setUTCHours(0, 0, 0, 0);

        // Get all days that have data
        const results = await Weather.aggregate([
            { $match: { date: { $gte: startDate, $lte: yesterday } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } } }
        ]);
        const daysWithData = new Set(results.map(r => r._id));

        // Find missing days
        const missingDays = [];
        const current = new Date(startDate);
        while (current <= yesterday) {
            const dayStr = current.toISOString().split('T')[0];
            if (!daysWithData.has(dayStr)) {
                missingDays.push(dayStr);
            }
            current.setUTCDate(current.getUTCDate() + 1);
        }

        if (missingDays.length === 0) {
            console.log('✅ No missing days found. Database is up to date!');
            return;
        }

        console.log(`📅 Found ${missingDays.length} missing day(s): ${missingDays.join(', ')}`);

        // Get device info
        const devices = await fetchWithRetry(() => ambientWeather.getDevices());
        if (!devices || devices.length === 0) {
            console.log('❌ No devices found, cannot backfill.');
            return;
        }

        const macAddress = devices[0].macAddress;
        let totalSaved = 0;

        for (let i = 0; i < missingDays.length; i++) {
            const dateStr = missingDays[i];
            console.log(`  [${i + 1}/${missingDays.length}] Backfilling ${dateStr}...`);

            await sleep(3000); // Respect rate limits

            try {
                const endOfDay = new Date(dateStr + 'T23:59:59.000Z').getTime();
                const data = await fetchWithRetry(() =>
                    ambientWeather.getDeviceData(macAddress, 288, endOfDay)
                );

                if (!Array.isArray(data) || data.length === 0) {
                    console.log(`    ❌ No data available for ${dateStr}`);
                    continue;
                }

                // Filter to only records from the target date
                const targetRecords = data.filter(record => {
                    const recordDate = new Date(record.date).toISOString().split('T')[0];
                    return recordDate === dateStr;
                });

                if (targetRecords.length === 0) {
                    console.log(`    ⚠️  No records match ${dateStr}`);
                    continue;
                }

                const bulkOps = targetRecords.map(record => ({
                    updateOne: {
                        filter: { macAddress, date: new Date(record.date) },
                        update: {
                            macAddress,
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
                console.log(`    ✅ Saved ${saved} records`);
            } catch (error) {
                console.error(`    ❌ Error backfilling ${dateStr}: ${error.message}`);
            }
        }

        console.log(`🎉 Backfill complete! Filled ${missingDays.length} day(s), ${totalSaved} total records.`);
    } catch (error) {
        console.error('❌ Backfill check failed:', error.message);
    }
};

const syncAllDevices = async () => {
    try {
        console.log('Starting scheduled weather sync (high-resolution)...');
        const devices = await fetchWithRetry(() => ambientWeather.getDevices());

        let totalSaved = 0;
        for (const device of devices) {
            try {
                // Fetch last 24 readings (~2 hours of data at 5-min intervals)
                // This overlap ensures no data is missed even if a sync is delayed
                const historicalData = await fetchWithRetry(() => ambientWeather.getDeviceData(device.macAddress, 24));

                if (Array.isArray(historicalData) && historicalData.length > 0) {
                    const bulkOps = historicalData.map(record => ({
                        updateOne: {
                            filter: { macAddress: device.macAddress, date: record.date },
                            update: {
                                macAddress: device.macAddress,
                                date: record.date,
                                data: record,
                                fetchedAt: new Date()
                            },
                            upsert: true
                        }
                    }));

                    const result = await Weather.bulkWrite(bulkOps);
                    totalSaved += (result.upsertedCount + result.modifiedCount);
                }
            } catch (dbError) {
                console.error(`Error syncing device ${device.macAddress}:`, dbError.message);
            }

            // Wait 1.1s between devices to respect Ambient Weather API rate limits (1 req/sec)
            await new Promise(resolve => setTimeout(resolve, 1100));
        }
        console.log(`Weather sync complete. Total records processed/updated: ${totalSaved}`);
    } catch (error) {
        console.error('Scheduled sync failed:', error.message);
    }
};

module.exports = { syncAllDevices, backfillMissingDays };
