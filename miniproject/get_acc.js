const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const weatherSchema = new mongoose.Schema({ date: Date, data: Object });
const Weather = mongoose.model('Weather', weatherSchema);

const predictionSchema = new mongoose.Schema({ forecastDate: Date, predictions: Object });
const Prediction = mongoose.model('Prediction', predictionSchema);

async function checkAccuracy() {
    await mongoose.connect(process.env.MONGODB_URI);
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - 30);
    const now = new Date();

    const predictions = await Prediction.find({
        forecastDate: { $gte: daysAgo, $lte: now }
    }).sort({ forecastDate: 1 }).lean();

    if (predictions.length === 0) {
        console.log("No predictions found in the database for the last 30 days.");
        process.exit(0);
    }

    const comparisonData = [];
    for (const pred of predictions) {
        const forecastDate = new Date(pred.forecastDate);
        const startOfDay = new Date(forecastDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(forecastDate);
        endOfDay.setHours(23, 59, 59, 999);

        const actualRecords = await Weather.find({
            date: { $gte: startOfDay, $lte: endOfDay }
        }).lean();

        if (actualRecords.length > 0) {
            const temps = actualRecords.map(r => r.data?.tempf ? Math.round((r.data.tempf - 32) * 5 / 9 * 10) / 10 : null).filter(t => t !== null);
            const humidities = actualRecords.map(r => r.data?.humidity).filter(h => h !== null);
            const winds = actualRecords.map(r => r.data?.windspeedmph ? Math.round(r.data.windspeedmph * 1.60934 * 10) / 10 : null).filter(w => w !== null);
            const pressures = actualRecords.map(r => r.data?.baromrelin ? Math.round(r.data.baromrelin * 33.8639 * 10) / 10 : null).filter(p => p !== null);

            const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;

            comparisonData.push({
                predicted: pred.predictions,
                actual: { temp: avg(temps), humidity: avg(humidities), wind: avg(winds), pressure: avg(pressures) },
                variation: {
                    temp: avg(temps) !== null && pred.predictions.temp !== null ? Math.round((pred.predictions.temp - avg(temps)) * 10) / 10 : null,
                    humidity: avg(humidities) !== null && pred.predictions.humidity !== null ? Math.round(pred.predictions.humidity - avg(humidities)) : null,
                    wind: avg(winds) !== null && pred.predictions.wind !== null ? Math.round((pred.predictions.wind - avg(winds)) * 10) / 10 : null,
                    pressure: avg(pressures) !== null && pred.predictions.pressure !== null ? Math.round((pred.predictions.pressure - avg(pressures)) * 10) / 10 : null
                }
            });
        }
    }

    const calculateMetrics = (data, key) => {
        const validData = data.filter(d => d.variation[key] !== null && d.predicted[key] !== null && d.actual[key] !== null);
        if (validData.length === 0) return null;
        const errors = validData.map(d => Math.abs(d.variation[key]));
        const mae = Math.round(errors.reduce((a, b) => a + b, 0) / errors.length * 100) / 100;
        const rmse = Math.round(Math.sqrt(errors.map(e => e * e).reduce((a, b) => a + b, 0) / errors.length) * 100) / 100;
        return { mae, rmse, dataPoints: validData.length };
    };

    console.log(JSON.stringify({
        temp: calculateMetrics(comparisonData, 'temp'),
        humidity: calculateMetrics(comparisonData, 'humidity'),
        wind: calculateMetrics(comparisonData, 'wind'),
        pressure: calculateMetrics(comparisonData, 'pressure')
    }, null, 2));

    process.exit(0);
}

checkAccuracy().catch(err => { console.error(err); process.exit(1); });
