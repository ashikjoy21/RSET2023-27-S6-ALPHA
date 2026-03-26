const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const ambientWeather = require('../utils/ambient-weather');
const Weather = require('../models/Weather');
const Prediction = require('../models/Prediction');

// Forecast cache - stores the last forecast to avoid slow regeneration
let forecastCache = {
    data: null,
    generatedAt: null,
    isGenerating: false
};

// Cache duration: 1 hour
const FORECAST_CACHE_DURATION = 60 * 60 * 1000;

// GET /api/weather/forecast
// Generate 10-day ML-based weather forecast (with caching)
router.get('/forecast', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === 'true';
        const now = Date.now();

        // Check if we have a valid cached forecast
        if (!forceRefresh && forecastCache.data && forecastCache.generatedAt) {
            const cacheAge = now - forecastCache.generatedAt;
            if (cacheAge < FORECAST_CACHE_DURATION) {
                console.log(`Returning cached forecast (${Math.round(cacheAge / 1000)}s old)`);
                return res.json({
                    ...forecastCache.data,
                    cached: true,
                    cacheAge: Math.round(cacheAge / 1000),
                    nextRefresh: Math.round((FORECAST_CACHE_DURATION - cacheAge) / 1000)
                });
            }
        }

        // If already generating, wait a bit and return cached if available
        if (forecastCache.isGenerating) {
            console.log('Forecast generation already in progress...');
            if (forecastCache.data) {
                return res.json({
                    ...forecastCache.data,
                    cached: true,
                    regenerating: true
                });
            }
            return res.status(202).json({
                message: 'Forecast is being generated, please try again in a few seconds',
                status: 'generating'
            });
        }

        // Start generating new forecast
        forecastCache.isGenerating = true;
        console.log('Generating fresh forecast...');

        const pythonScript = path.join(__dirname, '..', 'ml', 'predict.py');
        const python = spawn('python3', [pythonScript], {
            cwd: path.join(__dirname, '..', 'ml')
        });

        let result = '';
        let error = '';

        python.stdout.on('data', (data) => {
            result += data.toString();
        });

        python.stderr.on('data', (data) => {
            error += data.toString();
        });

        python.on('close', (code) => {
            forecastCache.isGenerating = false;

            if (code !== 0) {
                console.error('Prediction error:', error);
                return res.status(500).json({
                    error: 'Prediction failed',
                    details: error,
                    modelTrained: false
                });
            }

            try {
                const forecast = JSON.parse(result);

                // Cache the result
                forecastCache.data = forecast;
                forecastCache.generatedAt = Date.now();

                // Save predictions to MongoDB for accuracy tracking
                if (forecast.success && forecast.forecast) {
                    const generatedAt = new Date();

                    // Run the rain model in parallel to get rainfall predictions for each day
                    const rainScript = path.join(__dirname, '..', 'ml', 'predict_rain.py');
                    const rainProcess = spawn('python3', [rainScript], {
                        cwd: path.join(__dirname, '..', 'ml')
                    });

                    let rainResult = '';
                    rainProcess.stdout.on('data', d => rainResult += d.toString());
                    rainProcess.stderr.on('data', () => {}); // suppress ML warnings

                    rainProcess.on('close', (rainCode) => {
                        // Build a date → predicted rain map from the rain model output
                        let rainByDate = {};
                        if (rainCode === 0) {
                            try {
                                const rainData = JSON.parse(rainResult);
                                if (rainData.success && rainData.rainForecast) {
                                    rainData.rainForecast.forEach(r => {
                                        rainByDate[r.date] = r.predictedRain;
                                    });
                                }
                            } catch (_) {}
                        }

                        const predictionDocs = forecast.forecast.map(day => ({
                            generatedAt,
                            forecastDate: new Date(day.date),
                            predictions: {
                                temp:     day.temp,
                                humidity: day.humidity,
                                wind:     day.wind,
                                pressure: day.pressure,
                                // Attach XGBoost rainfall prediction (mm/day) for this date
                                rainfall: rainByDate[day.date] ?? null
                            }
                        }));

                        // Save predictions asynchronously (don't block response)
                        Prediction.insertMany(predictionDocs, { ordered: false })
                            .then(() => console.log('Predictions (incl. rainfall) saved for accuracy tracking'))
                            .catch(err => {
                                if (err.code !== 11000) {
                                    console.error('Error saving predictions:', err.message);
                                }
                            });
                    });
                }

                console.log('Forecast generated and cached');
                res.json({
                    ...forecast,
                    cached: false,
                    freshlyGenerated: true
                });
            } catch (parseError) {
                res.status(500).json({
                    error: 'Failed to parse prediction result',
                    rawOutput: result
                });
            }
        });

        // Timeout after 60 seconds
        setTimeout(() => {
            if (forecastCache.isGenerating) {
                console.log('Prediction script timed out, killing process');
                python.kill();
                forecastCache.isGenerating = false;
            }
        }, 60000);

    } catch (error) {
        forecastCache.isGenerating = false;
        console.error('Forecast error:', error);
        res.status(500).json({ error: 'Failed to generate forecast' });
    }
});

// GET /api/weather/export
// Export historical weather data as CSV
// Query params:
//   - days: number of days to export (default 7)
router.get('/export', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days));

        // Get records from MongoDB
        const records = await Weather.find({
            date: { $gte: daysAgo }
        })
            .sort({ date: 1 })
            .lean();

        if (records.length === 0) {
            return res.status(404).send('No data found for the specified period.');
        }

        // Prepare CSV headers
        const headers = [
            'Date',
            'Time',
            'Temperature (C)',
            'Humidity (%)',
            'Wind Speed (km/h)',
            'Wind Direction (deg)',
            'Pressure (hPa)',
            'Daily Rain (mm)',
            'Hourly Rain (mm)',
            'UV Index',
            'Solar Radiation (W/m2)'
        ];

        // Map records to CSV rows
        const rows = records.map(record => {
            const data = record.data || {};
            const dateObj = new Date(record.date);

            const dateStr = dateObj.toLocaleDateString();
            const timeStr = dateObj.toLocaleTimeString();

            const tempC = data.tempf !== undefined ? Math.round((data.tempf - 32) * 5 / 9 * 10) / 10 : '';
            const humidity = data.humidity !== undefined ? data.humidity : '';
            const windKmh = data.windspeedmph !== undefined ? Math.round(data.windspeedmph * 1.60934 * 10) / 10 : '';
            const windDir = data.winddir !== undefined ? data.winddir : '';
            const pressureHpa = data.baromrelin !== undefined ? Math.round(data.baromrelin * 33.8639 * 10) / 10 : '';
            const dailyRainMm = data.dailyrainin !== undefined ? Math.round(data.dailyrainin * 25.4 * 10) / 10 : '';
            const hourlyRainMm = data.hourlyrainin !== undefined ? Math.round(data.hourlyrainin * 25.4 * 10) / 10 : '';
            const uv = data.uv !== undefined ? data.uv : '';
            const solarRad = data.solarradiation !== undefined ? data.solarradiation : '';

            return [
                dateStr,
                timeStr,
                tempC,
                humidity,
                windKmh,
                windDir,
                pressureHpa,
                dailyRainMm,
                hourlyRainMm,
                uv,
                solarRad
            ].join(',');
        });

        // Combine headers and rows
        const csvContent = [headers.join(','), ...rows].join('\n');

        // Set response headers to force download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=weather_export_${days}_days.csv`);

        // Send the CSV string
        res.status(200).send(csvContent);

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).send('Failed to generate CSV export');
    }
});
// Cache for rain accuracy backtesting (10 min — heavier to compute)
let rainAccuracyCache = { data: null, fetchedAt: null };
const RAIN_CACHE_DURATION = 10 * 60 * 1000;

// GET /api/weather/rain-accuracy
// Runs the XGBoost backtesting script to produce 30-day predicted vs actual rainfall
// and returns MAE/RMSE metrics.  Same response shape as /accuracy so the frontend
// can consume it identically.
router.get('/rain-accuracy', async (req, res) => {
    try {
        // Serve from cache when fresh
        if (isCacheValid(rainAccuracyCache, RAIN_CACHE_DURATION)) {
            console.log('Returning cached rain-accuracy data');
            return res.json({ ...rainAccuracyCache.data, cached: true });
        }

        const script = path.join(__dirname, '..', 'ml', 'backtest_rain.py');
        const py = spawn('python3', [script], { cwd: path.join(__dirname, '..', 'ml') });

        let out = '', err = '';
        py.stdout.on('data', d => out += d.toString());
        py.stderr.on('data', d => err += d.toString());

        py.on('close', code => {
            if (code !== 0) {
                console.error('Rain backtest error:', err);
                return res.status(500).json({ success: false, error: 'Backtest failed', detail: err });
            }
            try {
                const result = JSON.parse(out);
                // Cache successful result
                rainAccuracyCache = { data: result, fetchedAt: Date.now() };
                res.json(result);
            } catch {
                res.status(500).json({ success: false, error: 'Failed to parse backtest output' });
            }
        });

        // Timeout safety
        setTimeout(() => py.kill(), 60000);

    } catch (error) {
        console.error('Rain accuracy error:', error);
        res.status(500).json({ success: false, error: 'Failed to run rain backtest' });
    }
});

// GET /api/weather/accuracy
// Compare predictions with actual observed data

router.get('/accuracy', async (req, res) => {
    try {
        const { days = 30 } = req.query;

        // Check cache first
        if (isCacheValid(accuracyCache, LONG_CACHE_DURATION) && accuracyCache.lastRequestedDays >= days) {
            console.log('Returning cached accuracy data');
            return res.json({ ...accuracyCache.data, cached: true });
        }

        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days));

        // Get predictions for dates that have already passed
        const now = new Date();
        const predictions = await Prediction.find({
            forecastDate: { $gte: daysAgo, $lte: now }
        }).sort({ forecastDate: 1 }).lean();

        if (predictions.length === 0) {
            return res.json({
                success: false,
                message: 'No predictions available yet. Generate a forecast first and wait for the predicted dates to pass.',
                data: []
            });
        }

        // For each prediction, get the actual observed data for that date
        const comparisonData = [];

        for (const pred of predictions) {
            const forecastDate = new Date(pred.forecastDate);
            const startOfDay = new Date(forecastDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(forecastDate);
            endOfDay.setHours(23, 59, 59, 999);

            // Get actual weather data for this day
            const actualRecords = await Weather.find({
                date: { $gte: startOfDay, $lte: endOfDay }
            }).lean();

            if (actualRecords.length > 0) {
                // Calculate daily averages / totals from actual data
                const temps = actualRecords
                    .map(r => r.data?.tempf ? Math.round((r.data.tempf - 32) * 5 / 9 * 10) / 10 : null)
                    .filter(t => t !== null);
                // FIX: Use != null to catch both null AND undefined values.
                const humidities = actualRecords
                    .map(r => r.data?.humidity)
                    .filter(h => h != null);
                const winds = actualRecords
                    .map(r => r.data?.windspeedmph ? Math.round(r.data.windspeedmph * 1.60934 * 10) / 10 : null)
                    .filter(w => w !== null);
                const pressures = actualRecords
                    .map(r => r.data?.baromrelin ? Math.round(r.data.baromrelin * 33.8639 * 10) / 10 : null)
                    .filter(p => p !== null);
                // Rainfall: sum all hourly readings for the day (inches → mm)
                // hourlyrainin is in inches/hour; summing 5-min readings gives daily total (÷ 12 per hour)
                const rainfallReadings = actualRecords
                    .map(r => r.data?.hourlyrainin != null ? Math.round(r.data.hourlyrainin * 25.4 * 100) / 100 : null)
                    .filter(r => r !== null);
                // Daily rain total: average hourly rate × 24h (gives mm/day estimate)
                const actualDailyRain = rainfallReadings.length
                    ? Math.round(rainfallReadings.reduce((a, b) => a + b, 0) / rainfallReadings.length * 24 * 100) / 100
                    : null;

                const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;

                const actual = {
                    temp:     avg(temps),
                    humidity: avg(humidities),
                    wind:     avg(winds),
                    pressure: avg(pressures),
                    rainfall: actualDailyRain
                };

                // Predicted rainfall may be null for old predictions (pre-rainfall feature)
                const predRainfall = pred.predictions?.rainfall ?? null;

                comparisonData.push({
                    date:        forecastDate.toISOString().split('T')[0],
                    displayDate: forecastDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                    predicted:   { ...pred.predictions, rainfall: predRainfall },
                    actual:      actual,
                    variation: {
                        temp:     actual.temp     !== null && pred.predictions.temp     !== null
                            ? Math.round((pred.predictions.temp     - actual.temp)     * 10) / 10 : null,
                        humidity: actual.humidity !== null && pred.predictions.humidity !== null
                            ? Math.round(pred.predictions.humidity  - actual.humidity)          : null,
                        wind:     actual.wind     !== null && pred.predictions.wind     !== null
                            ? Math.round((pred.predictions.wind     - actual.wind)     * 10) / 10 : null,
                        pressure: actual.pressure !== null && pred.predictions.pressure !== null
                            ? Math.round((pred.predictions.pressure - actual.pressure) * 10) / 10 : null,
                        // Rainfall variation (predicted mm/day - actual mm/day)
                        rainfall: actual.rainfall !== null && predRainfall !== null
                            ? Math.round((predRainfall - actual.rainfall) * 100) / 100 : null
                    },
                    hasActualData: true
                });
            }
        }

        // Calculate accuracy metrics
        const calculateMetrics = (data, key) => {
            const validData = data.filter(d =>
                d.variation[key] !== null &&
                d.predicted[key] !== null &&
                d.actual[key] !== null
            );

            if (validData.length === 0) return null;

            const errors = validData.map(d => Math.abs(d.variation[key]));
            const mae = Math.round(errors.reduce((a, b) => a + b, 0) / errors.length * 100) / 100;
            const rmse = Math.round(Math.sqrt(errors.map(e => e * e).reduce((a, b) => a + b, 0) / errors.length) * 100) / 100;

            return { mae, rmse, dataPoints: validData.length };
        };

        const metrics = {
            temp:     calculateMetrics(comparisonData, 'temp'),
            humidity: calculateMetrics(comparisonData, 'humidity'),
            wind:     calculateMetrics(comparisonData, 'wind'),
            pressure: calculateMetrics(comparisonData, 'pressure'),
            // Rainfall metrics — only populated when predicted rainfall values exist
            rainfall: calculateMetrics(comparisonData, 'rainfall')
        };

        const responseData = {
            success: true,
            totalPredictions: predictions.length,
            matchedPredictions: comparisonData.length,
            data: comparisonData,
            metrics
        };

        // Cache the result
        accuracyCache = {
            data: responseData,
            fetchedAt: Date.now(),
            lastRequestedDays: parseInt(days)
        };

        res.json(responseData);

    } catch (error) {
        console.error('Accuracy calculation error:', error);
        res.status(500).json({ error: 'Failed to calculate accuracy' });
    }
});

// Weather data cache for home page (1 minute cache)
let weatherCache = {
    data: null,
    fetchedAt: null
};
const WEATHER_CACHE_DURATION = 60 * 1000; // 1 minute

// GET /api/weather
// Fetches latest data - cached for 1 minute, falls back to DB
router.get('/', async (req, res) => {
    try {
        const now = Date.now();
        const forceRefresh = req.query.refresh === 'true';

        // Return cached data if valid
        if (!forceRefresh && weatherCache.data && weatherCache.fetchedAt) {
            const cacheAge = now - weatherCache.fetchedAt;
            if (cacheAge < WEATHER_CACHE_DURATION) {
                console.log(`Returning cached weather (${Math.round(cacheAge / 1000)}s old)`);
                return res.json(weatherCache.data);
            }
        }

        // Try to fetch from API with short timeout
        try {
            const devices = await Promise.race([
                ambientWeather.getDevices(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('API timeout')), 5000)
                )
            ]);

            // Cache the result
            weatherCache.data = devices;
            weatherCache.fetchedAt = Date.now();

            // Save to MongoDB asynchronously (don't wait)
            devices.forEach(async (device) => {
                if (device.lastData && device.lastData.date) {
                    try {
                        await Weather.updateOne(
                            { macAddress: device.macAddress, date: device.lastData.date },
                            {
                                macAddress: device.macAddress,
                                date: device.lastData.date,
                                data: device.lastData,
                                fetchedAt: new Date()
                            },
                            { upsert: true }
                        );
                    } catch (dbError) {
                        console.error('Error saving to DB:', dbError.message);
                    }
                }
            });

            return res.json(devices);
        } catch (apiError) {
            console.log('API slow/unavailable, falling back to cached/DB data');

            // Return cached data if available (even if stale)
            if (weatherCache.data) {
                return res.json(weatherCache.data);
            }

            // Fall back to most recent record from MongoDB
            const latestRecords = await Weather.find({})
                .sort({ date: -1 })
                .limit(1);

            if (latestRecords.length > 0) {
                const record = latestRecords[0];
                const fallbackData = [{
                    macAddress: record.macAddress,
                    lastData: record.data,
                    info: { name: 'RSET_WS' }
                }];
                return res.json(fallbackData);
            }

            throw apiError;
        }
    } catch (error) {
        console.error('Weather fetch error:', error.message);
        res.status(500).json({ error: 'Failed to fetch weather data' });
    }
});

// Cache objects for different endpoints
let historyCache = {};
let analyticsCache = {}; // For wind, rain, humidity, uv, stats
let alertCache = { data: null, fetchedAt: null };
let accuracyCache = { data: null, fetchedAt: null };

// 15 minute cache duration for historical/analytical data
const LONG_CACHE_DURATION = 15 * 60 * 1000;
// 5 minute cache duration for recent alerts
const SHORT_CACHE_DURATION = 5 * 60 * 1000;

// Helper to check cache validity
function isCacheValid(cacheObj, duration) {
    return cacheObj && cacheObj.data && cacheObj.fetchedAt && (Date.now() - cacheObj.fetchedAt < duration);
}

// GET /api/weather/history
// Multi-resolution endpoint for efficient chart rendering
// Query params:
//   - days: number of days to fetch (default 7)
//   - resolution: '5min' | 'hourly' | 'daily' (default 'daily')
router.get('/history', async (req, res) => {
    try {
        const { days = 7, resolution = 'daily' } = req.query;
        const cacheKey = `${days}_${resolution}`;

        // Fast path: Check cache first
        if (historyCache[cacheKey] && isCacheValid(historyCache[cacheKey], LONG_CACHE_DURATION)) {
            console.log(`Returning cached history data for ${cacheKey}`);
            return res.json(historyCache[cacheKey].data);
        }

        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days));

        // Get records from MongoDB
        const records = await Weather.find({
            date: { $gte: daysAgo }
        })
            .sort({ date: 1 }) // Oldest first for charts
            .lean();

        // Transform record to standard format
        const transformRecord = (record) => {
            const data = record.data || {};
            return {
                date: record.date, // ISO date for parsing
                temp: data.tempf ? Math.round((data.tempf - 32) * 5 / 9) : null,
                humidity: data.humidity ?? null,
                wind: data.windspeedmph ?? null,
                pressure: data.baromrelin ? Math.round(data.baromrelin * 33.8639 * 10) / 10 : null,
                rainfall: data.dailyrainin ? parseFloat((data.dailyrainin * 25.4).toFixed(1)) : 0,
                solarradiation: data.solarradiation ?? null,
            };
        };

        // ===== RESOLUTION: 5min (raw data) =====
        if (resolution === '5min') {
            const result = records.map(transformRecord);
            historyCache[cacheKey] = { data: result, fetchedAt: Date.now() };
            return res.json(result);
        }

        // ===== RESOLUTION: hourly (aggregate by hour) =====
        if (resolution === 'hourly') {
            const hourlyData = {};

            records.forEach(record => {
                const date = new Date(record.date);
                const hourKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;

                if (!hourlyData[hourKey]) {
                    hourlyData[hourKey] = {
                        records: [],
                        date: new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours())
                    };
                }
                hourlyData[hourKey].records.push(transformRecord(record));
            });

            // Average each hour
            const result = Object.values(hourlyData).map(({ records: recs, date }) => {
                const avg = (arr, key) => {
                    const valid = arr.map(r => r[key]).filter(v => v !== null);
                    return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 10) / 10 : null;
                };
                return {
                    date,
                    temp: avg(recs, 'temp'),
                    humidity: avg(recs, 'humidity'),
                    wind: avg(recs, 'wind'),
                    pressure: avg(recs, 'pressure'),
                    rainfall: avg(recs, 'rainfall'),
                    solarradiation: avg(recs, 'solarradiation'),
                };
            });

            const finalResult = result.sort((a, b) => new Date(a.date) - new Date(b.date));
            historyCache[cacheKey] = { data: finalResult, fetchedAt: Date.now() };
            return res.json(finalResult);
        }

        // ===== RESOLUTION: daily (one reading per day) =====
        const dailyData = {};
        records.forEach(record => {
            const date = new Date(record.date);
            const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

            if (!dailyData[dayKey]) {
                // Parse the ISO date string directly to avoid timezone issues
                const [year, month, day] = dayKey.split('-').map(Number);
                const displayDate = new Date(year, month - 1, day).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                });
                dailyData[dayKey] = {
                    records: [],
                    displayDate
                };
            }
            dailyData[dayKey].records.push(transformRecord(record));
        });

        // Get average/representative value for each day
        const result = Object.entries(dailyData).map(([key, { records: recs, displayDate }]) => {
            const avg = (arr, key) => {
                const valid = arr.map(r => r[key]).filter(v => v !== null);
                return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
            };
            const max = (arr, key) => {
                const valid = arr.map(r => r[key]).filter(v => v !== null);
                return valid.length ? Math.max(...valid) : null;
            };
            const min = (arr, key) => {
                const valid = arr.map(r => r[key]).filter(v => v !== null);
                return valid.length ? Math.min(...valid) : null;
            };

            // Find time when max/min temp occurred
            const maxTemp = max(recs, 'temp');
            const minTemp = min(recs, 'temp');

            const maxTempRecord = recs.find(r => r.temp === maxTemp);
            const minTempRecord = recs.find(r => r.temp === minTemp);

            const formatTime = (date) => {
                if (!date) return null;
                return new Date(date).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
            };

            return {
                date: displayDate,
                isoDate: key,
                temp: avg(recs, 'temp'),
                tempMax: maxTemp,
                tempMaxTime: maxTempRecord ? formatTime(maxTempRecord.date) : null,
                tempMin: minTemp,
                tempMinTime: minTempRecord ? formatTime(minTempRecord.date) : null,
                humidity: avg(recs, 'humidity'),
                wind: avg(recs, 'wind'),
                pressure: avg(recs, 'pressure'),
                rainfall: avg(recs, 'rainfall'),
                readings: recs.length
            };
        });
        const sortedResult = result.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
        historyCache[cacheKey] = { data: sortedResult, fetchedAt: Date.now() };
        res.json(sortedResult);
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// GET /api/weather/wind
// Fetch wind data for a specific date (for polar scatter plot)
// Query params:
//   - date: YYYY-MM-DD format (default: today)
router.get('/wind', async (req, res) => {
    try {
        let { date } = req.query;

        // Default to today if no date provided
        if (!date) {
            const today = new Date();
            date = today.toISOString().split('T')[0];
        }

        const cacheKey = `wind_${date}`;
        if (isCacheValid(analyticsCache[cacheKey], LONG_CACHE_DURATION)) {
            console.log(`Returning cached wind data for ${cacheKey}`);
            return res.json(analyticsCache[cacheKey].data);
        }

        // Parse the date and create start/end of day
        const startOfDay = new Date(date + 'T00:00:00.000Z');
        const endOfDay = new Date(date + 'T23:59:59.999Z');

        // Get records from MongoDB for the specified date
        const records = await Weather.find({
            date: { $gte: startOfDay, $lte: endOfDay }
        })
            .sort({ date: 1 })
            .lean();

        // Extract wind data points
        const windData = records
            .filter(record => {
                const data = record.data || {};
                return data.winddir !== undefined && data.windspeedmph !== undefined;
            })
            .map(record => {
                const data = record.data || {};
                return {
                    timestamp: record.date,
                    winddir: data.winddir, // degrees (0-360)
                    windspeed: Math.round(data.windspeedmph * 1.60934 * 10) / 10, // Convert mph to km/h
                };
            });

        // Also return available dates for the date picker
        const availableDates = await Weather.aggregate([
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$date' }
                    }
                }
            },
            { $sort: { _id: -1 } },
            { $limit: 365 } // Last year of dates
        ]);

        const result = {
            date,
            dataPoints: windData.length,
            windData,
            availableDates: availableDates.map(d => d._id)
        };
        analyticsCache[cacheKey] = { data: result, fetchedAt: Date.now() };
        res.json(result);
    } catch (error) {
        console.error('Wind data error:', error);
        res.status(500).json({ error: 'Failed to fetch wind data' });
    }
});

// GET /api/weather/rain
// Fetch rain data for a specific date
// Query params:
//   - date: YYYY-MM-DD format (default: today)
router.get('/rain', async (req, res) => {
    try {
        let { date } = req.query;

        if (!date) {
            const today = new Date();
            date = today.toISOString().split('T')[0];
        }

        const cacheKey = `rain_${date}`;
        if (isCacheValid(analyticsCache[cacheKey], LONG_CACHE_DURATION)) {
            console.log(`Returning cached rain data for ${cacheKey}`);
            return res.json(analyticsCache[cacheKey].data);
        }

        const startOfDay = new Date(date + 'T00:00:00.000Z');
        const endOfDay = new Date(date + 'T23:59:59.999Z');

        const records = await Weather.find({
            date: { $gte: startOfDay, $lte: endOfDay }
        })
            .sort({ date: 1 })
            .lean();

        const rainData = records
            .filter(record => {
                const data = record.data || {};
                return data.hourlyrainin !== undefined || data.dailyrainin !== undefined;
            })
            .map(record => {
                const data = record.data || {};
                return {
                    timestamp: record.date,
                    hourlyRain: data.hourlyrainin ? Math.round(data.hourlyrainin * 25.4 * 100) / 100 : 0, // Convert inches to mm
                    dailyRain: data.dailyrainin ? Math.round(data.dailyrainin * 25.4 * 100) / 100 : 0,
                    rainRate: data.hourlyrainin ? Math.round(data.hourlyrainin * 25.4 * 100) / 100 : 0
                };
            });

        const availableDates = await Weather.aggregate([
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } } },
            { $sort: { _id: -1 } },
            { $limit: 365 }
        ]);

        const result = {
            date,
            dataPoints: rainData.length,
            rainData,
            availableDates: availableDates.map(d => d._id)
        };
        analyticsCache[cacheKey] = { data: result, fetchedAt: Date.now() };
        res.json(result);
    } catch (error) {
        console.error('Rain data error:', error);
        res.status(500).json({ error: 'Failed to fetch rain data' });
    }
});

// GET /api/weather/humidity
// Fetch humidity data for a specific date
// Query params:
//   - date: YYYY-MM-DD format (default: today)
router.get('/humidity', async (req, res) => {
    try {
        let { date } = req.query;

        if (!date) {
            const today = new Date();
            date = today.toISOString().split('T')[0];
        }

        const cacheKey = `humidity_${date}`;
        if (isCacheValid(analyticsCache[cacheKey], LONG_CACHE_DURATION)) {
            console.log(`Returning cached humidity data for ${cacheKey}`);
            return res.json(analyticsCache[cacheKey].data);
        }

        const startOfDay = new Date(date + 'T00:00:00.000Z');
        const endOfDay = new Date(date + 'T23:59:59.999Z');

        const records = await Weather.find({
            date: { $gte: startOfDay, $lte: endOfDay }
        })
            .sort({ date: 1 })
            .lean();

        const humidityData = records
            .filter(record => {
                const data = record.data || {};
                return data.humidity !== undefined;
            })
            .map(record => {
                const data = record.data || {};
                // Calculate dew point from temp and humidity
                const tempC = data.tempf ? (data.tempf - 32) * 5 / 9 : null;
                const humidity = data.humidity;
                let dewPoint = null;
                if (tempC !== null && humidity !== null) {
                    // Magnus formula approximation
                    const a = 17.27;
                    const b = 237.7;
                    const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100);
                    dewPoint = Math.round((b * alpha) / (a - alpha) * 10) / 10;
                }
                return {
                    timestamp: record.date,
                    humidity: data.humidity,
                    dewPoint: dewPoint,
                    tempC: tempC ? Math.round(tempC * 10) / 10 : null
                };
            });

        const availableDates = await Weather.aggregate([
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } } },
            { $sort: { _id: -1 } },
            { $limit: 365 }
        ]);

        const result = {
            date,
            dataPoints: humidityData.length,
            humidityData,
            availableDates: availableDates.map(d => d._id)
        };
        analyticsCache[cacheKey] = { data: result, fetchedAt: Date.now() };
        res.json(result);
    } catch (error) {
        console.error('Humidity data error:', error);
        res.status(500).json({ error: 'Failed to fetch humidity data' });
    }
});

// GET /api/weather/uv
// Fetch UV index data for a specific date
// Query params:
//   - date: YYYY-MM-DD format (default: today)
router.get('/uv', async (req, res) => {
    try {
        let { date } = req.query;

        if (!date) {
            const today = new Date();
            date = today.toISOString().split('T')[0];
        }

        const cacheKey = `uv_${date}`;
        if (isCacheValid(analyticsCache[cacheKey], LONG_CACHE_DURATION)) {
            console.log(`Returning cached uv data for ${cacheKey}`);
            return res.json(analyticsCache[cacheKey].data);
        }

        const startOfDay = new Date(date + 'T00:00:00.000Z');
        const endOfDay = new Date(date + 'T23:59:59.999Z');

        const records = await Weather.find({
            date: { $gte: startOfDay, $lte: endOfDay }
        })
            .sort({ date: 1 })
            .lean();

        const uvData = records
            .filter(record => {
                const data = record.data || {};
                return data.uv !== undefined;
            })
            .map(record => {
                const data = record.data || {};
                return {
                    timestamp: record.date,
                    uv: data.uv,
                    solarRadiation: data.solarradiation || null
                };
            });

        const availableDates = await Weather.aggregate([
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } } },
            { $sort: { _id: -1 } },
            { $limit: 365 }
        ]);

        const result = {
            date,
            dataPoints: uvData.length,
            uvData,
            availableDates: availableDates.map(d => d._id)
        };
        analyticsCache[cacheKey] = { data: result, fetchedAt: Date.now() };
        res.json(result);
    } catch (error) {
        console.error('UV data error:', error);
        res.status(500).json({ error: 'Failed to fetch UV data' });
    }
});

// GET /api/weather/stats
// Quick database statistics
router.get('/stats', async (req, res) => {
    try {
        const cacheKey = 'stats';
        if (isCacheValid(analyticsCache[cacheKey], LONG_CACHE_DURATION)) {
            console.log(`Returning cached stats data`);
            return res.json(analyticsCache[cacheKey].data);
        }

        const totalRecords = await Weather.countDocuments();
        const oldest = await Weather.findOne().sort({ date: 1 }).lean();
        const newest = await Weather.findOne().sort({ date: -1 }).lean();

        const result = {
            totalRecords,
            oldestRecord: oldest?.date || null,
            newestRecord: newest?.date || null,
            dateRange: oldest && newest ?
                `${new Date(oldest.date).toDateString()} → ${new Date(newest.date).toDateString()}` :
                'No data'
        };
        analyticsCache[cacheKey] = { data: result, fetchedAt: Date.now() };
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// ============================================================
// GET /api/weather/alerts
// Real-time alert generation from actual sensor data
// Evaluates the last 24h of readings against meteorological
// thresholds and returns active + resolved alerts.
// ============================================================
router.get('/alerts', async (req, res) => {
    try {
        if (isCacheValid(alertCache, SHORT_CACHE_DURATION)) {
            console.log(`Returning cached alerts data`);
            return res.json({ ...alertCache.data, cached: true });
        }

        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Fetch last 24h of weather data, newest first
        const records = await Weather.find({
            date: { $gte: twentyFourHoursAgo }
        }).sort({ date: -1 }).lean();

        if (records.length === 0) {
            return res.json({
                success: true,
                activeAlerts: [],
                pastAlerts: [],
                lastUpdated: now,
                message: 'No weather data available in the last 24 hours'
            });
        }

        // Latest reading
        const latest = records[0];
        const latestData = latest.data || {};

        // Convert units from latest
        const latestTempC = latestData.tempf !== undefined
            ? Math.round((latestData.tempf - 32) * 5 / 9 * 10) / 10
            : null;
        const latestHumidity = latestData.humidity ?? null;
        const latestWindMph = latestData.windspeedmph ?? null;
        const latestWindKmh = latestWindMph !== null
            ? Math.round(latestWindMph * 1.60934 * 10) / 10
            : null;
        const latestPressureHpa = latestData.baromrelin !== undefined
            ? Math.round(latestData.baromrelin * 33.8639 * 10) / 10
            : null;
        const latestHourlyRainMm = latestData.hourlyrainin !== undefined
            ? Math.round(latestData.hourlyrainin * 25.4 * 100) / 100
            : null;
        const latestDailyRainMm = latestData.dailyrainin !== undefined
            ? Math.round(latestData.dailyrainin * 25.4 * 10) / 10
            : null;
        const latestUV = latestData.uv ?? null;
        const latestSolar = latestData.solarradiation ?? null;

        // Compute heat index (°C) using simplified Steadman formula
        function heatIndex(tempC, rh) {
            if (tempC === null || rh === null || tempC < 27) return tempC;
            const T = tempC;
            const R = rh;
            const HI = -8.7847 + 1.6114 * T + 2.3385 * R
                - 0.1461 * T * R - 0.0123 * T * T
                - 0.0164 * R * R + 0.0022 * T * T * R
                + 0.0007 * T * R * R - 0.0000036 * T * T * R * R;
            return Math.round(HI * 10) / 10;
        }

        const latestHeatIndex = heatIndex(latestTempC, latestHumidity);

        // ---- Alert thresholds ----
        const alertRules = [
            {
                id: 'extreme_heat',
                type: 'Heat',
                icon: 'temp',
                title: 'Extreme Heat Warning',
                severity: 'high',
                check: () => latestTempC !== null && latestTempC >= 38,
                description: () => `Temperature has reached ${latestTempC}°C${latestHeatIndex > latestTempC ? ` (feels like ${latestHeatIndex}°C)` : ''}. Stay indoors, stay hydrated, and avoid strenuous activity.`,
                value: () => `${latestTempC}°C`
            },
            {
                id: 'heat_advisory',
                type: 'Heat',
                icon: 'temp',
                title: 'Heat Advisory',
                severity: 'medium',
                check: () => latestTempC !== null && latestTempC >= 35 && latestTempC < 38,
                description: () => `Temperature is ${latestTempC}°C${latestHeatIndex > latestTempC ? ` (feels like ${latestHeatIndex}°C)` : ''}. Drink plenty of water and limit outdoor exposure.`,
                value: () => `${latestTempC}°C`
            },
            {
                id: 'heavy_rain',
                type: 'Rain',
                icon: 'rain',
                title: 'Heavy Rainfall Warning',
                severity: 'high',
                check: () => latestHourlyRainMm !== null && latestHourlyRainMm >= 12.7,
                description: () => `Heavy rainfall detected at ${latestHourlyRainMm} mm/hr. Total daily rainfall: ${latestDailyRainMm ?? 'N/A'} mm. Possible flooding in low-lying areas.`,
                value: () => `${latestHourlyRainMm} mm/hr`
            },
            {
                id: 'moderate_rain',
                type: 'Rain',
                icon: 'rain',
                title: 'Rain Alert',
                severity: 'low',
                check: () => latestHourlyRainMm !== null && latestHourlyRainMm >= 2.5 && latestHourlyRainMm < 12.7,
                description: () => `Moderate rain detected at ${latestHourlyRainMm} mm/hr. Daily accumulation: ${latestDailyRainMm ?? 'N/A'} mm. Carry an umbrella.`,
                value: () => `${latestHourlyRainMm} mm/hr`
            },
            {
                id: 'strong_wind',
                type: 'Wind',
                icon: 'wind',
                title: 'Strong Wind Warning',
                severity: 'high',
                check: () => latestWindMph !== null && latestWindMph >= 25,
                description: () => `Wind speeds have reached ${latestWindKmh} km/h (${latestWindMph} mph). Secure loose objects and avoid open areas.`,
                value: () => `${latestWindKmh} km/h`
            },
            {
                id: 'wind_advisory',
                type: 'Wind',
                icon: 'wind',
                title: 'Wind Advisory',
                severity: 'medium',
                check: () => latestWindMph !== null && latestWindMph >= 15 && latestWindMph < 25,
                description: () => `Elevated wind speeds of ${latestWindKmh} km/h (${latestWindMph} mph). Be cautious on two-wheelers.`,
                value: () => `${latestWindKmh} km/h`
            },
            {
                id: 'extreme_uv',
                type: 'UV',
                icon: 'uv',
                title: 'Extreme UV Warning',
                severity: 'high',
                check: () => latestUV !== null && latestUV >= 11,
                description: () => `UV Index is extremely high at ${latestUV}${latestSolar ? ` (Solar: ${latestSolar} W/m²)` : ''}. Avoid sun exposure, use SPF 50+ sunscreen.`,
                value: () => `UV ${latestUV}`
            },
            {
                id: 'high_uv',
                type: 'UV',
                icon: 'uv',
                title: 'High UV Alert',
                severity: 'medium',
                check: () => latestUV !== null && latestUV >= 8 && latestUV < 11,
                description: () => `UV Index is ${latestUV}${latestSolar ? ` (Solar: ${latestSolar} W/m²)` : ''}. Wear sunscreen and protective clothing outdoors.`,
                value: () => `UV ${latestUV}`
            },
            {
                id: 'low_pressure',
                type: 'Pressure',
                icon: 'pressure',
                title: 'Low Pressure Advisory',
                severity: 'medium',
                check: () => latestPressureHpa !== null && latestPressureHpa < 1000,
                description: () => `Barometric pressure has dropped to ${latestPressureHpa} hPa, indicating possible incoming storm or unsettled weather.`,
                value: () => `${latestPressureHpa} hPa`
            },
            {
                id: 'high_humidity',
                type: 'Humidity',
                icon: 'humidity',
                title: 'High Humidity Advisory',
                severity: 'low',
                check: () => latestHumidity !== null && latestHumidity >= 90,
                description: () => `Humidity is at ${latestHumidity}%. Conditions feel oppressive${latestHeatIndex > latestTempC ? ` — feels like ${latestHeatIndex}°C` : ''}. Stay cool and hydrated.`,
                value: () => `${latestHumidity}%`
            },
        ];

        // ---- Check active alerts from latest reading ----
        const activeAlerts = [];
        const triggeredIds = new Set();

        alertRules.forEach(rule => {
            if (rule.check()) {
                triggeredIds.add(rule.id);
                activeAlerts.push({
                    id: rule.id,
                    type: rule.type,
                    icon: rule.icon,
                    title: rule.title,
                    severity: rule.severity,
                    description: rule.description(),
                    measuredValue: rule.value(),
                    time: latest.date,
                    timeAgo: getTimeAgo(latest.date),
                    location: 'RSET Campus',
                    status: 'active'
                });
            }
        });

        // ---- Check past alerts: conditions that triggered earlier but resolved now ----
        const pastAlerts = [];
        const pastAlertIds = new Set();

        // Scan older records (skip the latest batch)
        for (let i = 1; i < records.length && pastAlerts.length < 10; i++) {
            const record = records[i];
            const d = record.data || {};
            const tempC = d.tempf !== undefined ? Math.round((d.tempf - 32) * 5 / 9 * 10) / 10 : null;
            const windMph = d.windspeedmph ?? null;
            const windKmh = windMph !== null ? Math.round(windMph * 1.60934 * 10) / 10 : null;
            const hourlyRainMm = d.hourlyrainin !== undefined ? Math.round(d.hourlyrainin * 25.4 * 100) / 100 : null;
            const uv = d.uv ?? null;
            const pressureHpa = d.baromrelin !== undefined ? Math.round(d.baromrelin * 33.8639 * 10) / 10 : null;
            const humidity = d.humidity ?? null;

            const pastChecks = [
                { id: 'extreme_heat', check: tempC !== null && tempC >= 38, desc: `Temperature reached ${tempC}°C`, icon: 'temp', title: 'Extreme Heat Warning', severity: 'high' },
                { id: 'heat_advisory', check: tempC !== null && tempC >= 35 && tempC < 38, desc: `Temperature reached ${tempC}°C`, icon: 'temp', title: 'Heat Advisory', severity: 'medium' },
                { id: 'heavy_rain', check: hourlyRainMm !== null && hourlyRainMm >= 12.7, desc: `Rainfall hit ${hourlyRainMm} mm/hr`, icon: 'rain', title: 'Heavy Rainfall Warning', severity: 'high' },
                { id: 'moderate_rain', check: hourlyRainMm !== null && hourlyRainMm >= 2.5 && hourlyRainMm < 12.7, desc: `Rain at ${hourlyRainMm} mm/hr`, icon: 'rain', title: 'Rain Alert', severity: 'low' },
                { id: 'strong_wind', check: windMph !== null && windMph >= 25, desc: `Wind speeds reached ${windKmh} km/h`, icon: 'wind', title: 'Strong Wind Warning', severity: 'high' },
                { id: 'wind_advisory', check: windMph !== null && windMph >= 15 && windMph < 25, desc: `Wind speeds of ${windKmh} km/h`, icon: 'wind', title: 'Wind Advisory', severity: 'medium' },
                { id: 'extreme_uv', check: uv !== null && uv >= 11, desc: `UV Index reached ${uv}`, icon: 'uv', title: 'Extreme UV Warning', severity: 'high' },
                { id: 'high_uv', check: uv !== null && uv >= 8 && uv < 11, desc: `UV Index was ${uv}`, icon: 'uv', title: 'High UV Alert', severity: 'medium' },
                { id: 'low_pressure', check: pressureHpa !== null && pressureHpa < 1000, desc: `Pressure dropped to ${pressureHpa} hPa`, icon: 'pressure', title: 'Low Pressure Advisory', severity: 'medium' },
                { id: 'high_humidity', check: humidity !== null && humidity >= 90, desc: `Humidity at ${humidity}%`, icon: 'humidity', title: 'High Humidity Advisory', severity: 'low' },
            ];

            pastChecks.forEach(pc => {
                if (pc.check && !triggeredIds.has(pc.id) && !pastAlertIds.has(pc.id)) {
                    pastAlertIds.add(pc.id);
                    pastAlerts.push({
                        id: pc.id,
                        type: pc.title.split(' ')[0],
                        icon: pc.icon,
                        title: pc.title,
                        severity: pc.severity,
                        description: pc.desc + ' — condition has since resolved.',
                        time: record.date,
                        timeAgo: getTimeAgo(record.date),
                        status: 'resolved'
                    });
                }
            });
        }

        // ---- Current conditions summary ----
        const conditions = {
            temperature: latestTempC,
            heatIndex: latestHeatIndex,
            humidity: latestHumidity,
            windSpeed: latestWindKmh,
            windSpeedMph: latestWindMph,
            pressure: latestPressureHpa,
            hourlyRain: latestHourlyRainMm,
            dailyRain: latestDailyRainMm,
            uvIndex: latestUV,
            solarRadiation: latestSolar,
            lastReading: latest.date,
            totalReadings24h: records.length
        };

        const responseData = {
            success: true,
            activeAlerts,
            pastAlerts,
            conditions,
            lastUpdated: now
        };

        alertCache = {
            data: responseData,
            fetchedAt: Date.now()
        };

        res.json(responseData);

    } catch (error) {
        console.error('Alerts error:', error);
        res.status(500).json({ error: 'Failed to generate alerts' });
    }
});

// GET /api/weather/:macAddress
router.get('/:macAddress', async (req, res) => {
    try {
        const { macAddress } = req.params;
        const { limit, endDate } = req.query;
        const data = await ambientWeather.getDeviceData(macAddress, limit, endDate);

        // Bulk save historical data
        if (Array.isArray(data)) {
            try {
                const bulkOps = data.map(record => ({
                    updateOne: {
                        filter: { macAddress: macAddress, date: record.date },
                        update: {
                            macAddress: macAddress,
                            date: record.date,
                            data: record,
                            fetchedAt: new Date()
                        },
                        upsert: true
                    }
                }));

                if (bulkOps.length > 0) {
                    Weather.bulkWrite(bulkOps).catch(err => console.error('Bulk save error:', err.message));
                }
            } catch (dbError) {
                console.error('Error preparing bulk save:', dbError.message);
            }
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch device data' });
    }
});

const Groq = require('groq-sdk');

// Initialize Groq with the API key from .env
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ============================================================
// POST /api/weather/chat
// Chatbot endpoint — Using Google Gemini to answer weather questions
// ============================================================
router.post('/chat', async (req, res) => {
    try {
        const { message, history } = req.body;
        if (!message || typeof message !== 'string') {
            return res.json({ reply: 'Please type a weather-related question!', dataType: 'error' });
        }

        // --- 1. Gather Current Conditions ---
        let currentConditionsContext = 'Latest weather data is currently unavailable.';
        let lastData = null;

        if (weatherCache && weatherCache.data && weatherCache.data.length > 0) {
            lastData = weatherCache.data[0].lastData || weatherCache.data[0].data;
        }
        if (!lastData) {
            const latestRecord = await Weather.findOne({}).sort({ date: -1 }).lean();
            if (latestRecord) lastData = latestRecord.data;
        }

        if (lastData) {
            const tempC = lastData.tempf !== undefined ? Math.round((lastData.tempf - 32) * 5 / 9 * 10) / 10 : 'N/A';
            const humidity = lastData.humidity !== undefined ? lastData.humidity : 'N/A';
            const windKmh = lastData.windspeedmph !== undefined ? Math.round(lastData.windspeedmph * 1.60934 * 10) / 10 : 'N/A';
            const pressureHpa = lastData.baromrelin !== undefined ? Math.round(lastData.baromrelin * 33.8639 * 10) / 10 : 'N/A';
            const rainMm = lastData.dailyrainin !== undefined ? Math.round(lastData.dailyrainin * 25.4 * 10) / 10 : 'N/A';
            const uvIndex = lastData.uv !== undefined ? lastData.uv : 'N/A';
            const solarRad = lastData.solarradiation !== undefined ? lastData.solarradiation : 'N/A';

            currentConditionsContext = `
            Current Conditions:
            - Temperature: ${tempC}°C
            - Humidity: ${humidity}%
            - Wind Speed: ${windKmh} km/h
            - Pressure: ${pressureHpa} hPa
            - Daily Rainfall: ${rainMm} mm
            - UV Index: ${uvIndex}
            - Solar Radiation: ${solarRad} W/m²
            `;
        }

        // --- 2. Gather Forecast Data ---
        let forecastContext = 'Forecast data is currently unavailable.';
        if (forecastCache && forecastCache.data && forecastCache.data.forecast) {
            const fc = forecastCache.data.forecast.slice(0, 5); // Next 5 days
            forecastContext = '5-Day Forecast:\n' + fc.map(day => {
                const date = new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                return `- ${date}: Temp ${day.temp !== null ? day.temp + '°C' : 'N/A'}, Rain Prob ${day.rain_probability !== null ? day.rain_probability + '%' : 'N/A'}`;
            }).join('\n');
        }

        // --- 3. Gather Historical Data (Last 3 Days) ---
        let historyContext = 'Historical data is unavailable.';
        try {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            const records = await Weather.find({ date: { $gte: threeDaysAgo } }).sort({ date: -1 }).lean();

            if (records.length > 0) {
                const dailyData = {};
                records.forEach(record => {
                    const data = record.data || {};
                    const dayKey = new Date(record.date).toISOString().split('T')[0];
                    if (!dailyData[dayKey]) dailyData[dayKey] = { temps: [], rain: 0 };

                    if (data.tempf !== undefined) {
                        dailyData[dayKey].temps.push(Math.round((data.tempf - 32) * 5 / 9 * 10) / 10);
                    }
                    if (data.dailyrainin !== undefined) {
                        const rainMm = data.dailyrainin * 25.4;
                        if (rainMm > dailyData[dayKey].rain) {
                            dailyData[dayKey].rain = rainMm;
                        }
                    }
                });

                const sortedDays = Object.keys(dailyData).sort().reverse().slice(0, 3);
                historyContext = 'Past 3 Days Summary:\n' + sortedDays.map(day => {
                    const d = dailyData[day];
                    const date = new Date(day).toLocaleDateString('en-US', { weekday: 'short' });

                    const temps = d.temps.length ? d.temps : [null];
                    const maxTemp = d.temps.length ? Math.max(...temps) : 'N/A';
                    const minTemp = d.temps.length ? Math.min(...temps) : 'N/A';
                    const avgTemp = d.temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length * 10) / 10 : 'N/A';

                    const rainMm = Math.round(d.rain * 10) / 10;
                    const raining = rainMm > 0 ? 'Yes' : 'No';

                    return `- ${date}: Avg Temp ${avgTemp}°C, Max Temp ${maxTemp}°C, Min Temp ${minTemp}°C, Raining: ${raining} (${rainMm}mm)`;
                }).join('\n');
            }
        } catch (err) {
            console.error('Failed to fetch historical context for bot:', err);
        }

        // --- 4. Compile System Instruction ---
        // --- 4. Compile System Instruction ---
        const systemInstruction = `
        You are "RSET Bot", a friendly AI assistant for the Rajagiri School of Engineering & Technology (RSET) weather dashboard in Kochi.
        You can answer questions about the weather, about the campus, or general knowledge/trivia. Use emojis!

        [WEATHER DATA]
        ${currentConditionsContext}
        ${forecastContext}
        ${historyContext}

        [CAMPUS DATA]
        - RSET stands for Rajagiri School of Engineering & Technology.
        - Location: Kakkanad, Kochi, Kerala, India.

        [RULES]
        1. If asked about RSET, use the Campus Data.
        2. If asked about weather, use the Weather Data. Do not invent numbers.
        3. Be concise and conversational. Keep answers short but helpful. NEVER output the literal words "[WEATHER DATA]" or "[CAMPUS DATA]" in your response; these are hidden internal markers, do not show them to the user.
        4. DASHBOARD PAGES: The dashboard has the following pages: "home" (current weather), "forecast" (future predictions), "history" (past records and daily tables), "analysis" (graphs, charts, and trends), "alert" (severe weather warnings), and "about" (project info).
        5. CRITICAL NAVIGATION RULE: If the user asks general questions about a topic (like "tell me about kochi" or "what are the alerts"), DO NOT redirect them. Answer their question normally.
        6. EXPLICIT REDIRECTS ONLY: You MUST output the exact text "[REDIRECT:pagename]" (e.g., "[REDIRECT:analysis]", "[REDIRECT:about]") IF AND ONLY IF the user explicitly commands you to navigate (e.g., "take me to...", "go to...", "open the...", "show me the page for..."). When you do this, respond enthusiastically. NEVER output this tag for general questions.
        7. CRITICAL DOWNLOAD RULE: ONLY output the exact text "[DOWNLOAD:days]" (e.g., "[DOWNLOAD:7]") IF AND ONLY IF the CURRENT user message explicitly requests to download or export historical weather data as a CSV or file. NEVER output this tag if the user says "thanks", "ok", "goodbye", or any general greeting. NEVER repeat this tag from conversation history.
        `;

        // --- 5. Call the Groq API ---
        try {
            const messages = [
                { role: 'system', content: systemInstruction }
            ];

            // Reconstruct the history array if provided by the frontend
            if (history && Array.isArray(history) && history.length > 0) {
                history.forEach(msg => {
                    messages.push({
                        role: msg.role === 'bot' ? 'assistant' : 'user',
                        content: msg.text
                    });
                });
            }

            messages.push({ role: 'user', content: message });

            const chatCompletion = await groq.chat.completions.create({
                messages: messages,
                model: 'llama-3.1-8b-instant',
                max_tokens: 150, // Keep responses relatively short to save tokens
                temperature: 0.6 // Slightly lower temperature for more focused, less rambling responses
            });

            const aiReply = chatCompletion.choices[0]?.message?.content || "I am currently speechless! Ask me another question.";

            return res.json({ reply: aiReply, dataType: 'generative' });

        } catch (apiError) {
            console.error('Groq API Error:', apiError);
            return res.json({
                reply: 'Sorry, my AI brain (Llama 3.1) is currently experiencing technical difficulties! 🌦️ Please try again later.',
                dataType: 'error'
            });
        }

    } catch (error) {
        console.error('Chat endpoint error:', error);
        res.status(500).json({ reply: 'Sorry, something went wrong on the server. Please try again.', dataType: 'error' });
    }
});

// Helper: Convert wind degrees to compass direction
function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Helper: Human-readable "time ago" string
function getTimeAgo(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

module.exports = router;
