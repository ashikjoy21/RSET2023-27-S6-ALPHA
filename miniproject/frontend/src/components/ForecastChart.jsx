import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Sun, Cloud, CloudRain, Wind, RefreshCw, AlertTriangle, Thermometer, Droplets } from 'lucide-react';

const conditionIcons = {
    'Clear': Sun,
    'Partly Cloudy': Cloud,
    'Cloudy': Cloud,
    'Rainy': CloudRain,
    'Windy': Wind
};

const conditionColors = {
    'Clear': 'text-yellow-500',
    'Partly Cloudy': 'text-gray-400',
    'Cloudy': 'text-gray-500',
    'Rainy': 'text-blue-500',
    'Windy': 'text-cyan-500'
};

export function ForecastChart() {
    const [forecast, setForecast] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchForecast = async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await fetch('http://localhost:3000/api/weather/forecast');
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Failed to fetch forecast');
            }

            setForecast(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchForecast();
    }, []);

    if (loading) {
        return (
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-12 shadow-xl border border-white/10 min-h-[300px] flex flex-col items-center justify-center">
                <div className="relative mb-6">
                    <div className="w-16 h-16 border-4 border-white/20 rounded-full"></div>
                    <div className="w-16 h-16 border-4 border-t-white border-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                </div>
                <h3 className="text-white font-bold text-xl mb-2">Generating 10-Day Forecast</h3>
                <p className="text-white/60 text-sm">Analyzing weather patterns with ML model...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-xl border border-amber-500/20">
                <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle className="w-6 h-6 text-white" />
                    <h3 className="text-white font-bold text-lg">Forecast Unavailable</h3>
                </div>
                <p className="text-white/80 mb-4">{error}</p>
                <p className="text-white/60 text-sm mb-4">
                    The ML model may not be trained yet. Run the training script first:
                </p>
                <code className="bg-black/20 px-3 py-2 rounded text-white/90 text-sm block mb-4">
                    cd ml && pip install -r requirements.txt && python train_model.py
                </code>
                <button
                    onClick={fetchForecast}
                    className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                </button>
            </div>
        );
    }

    if (!forecast || !forecast.forecast) {
        return null;
    }

    const chartData = forecast.forecast.map(day => ({
        ...day,
        name: day.dayName.slice(0, 3)
    }));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                        <Sun className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-white text-xl font-bold">10-Day Forecast</h2>
                        <p className="text-white/60 text-sm">ML-Powered Prediction</p>
                    </div>
                </div>
                <button
                    onClick={fetchForecast}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white/80 px-3 py-1.5 rounded-lg transition-colors text-sm"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Temperature Trend Chart */}
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/10">
                <h3 className="text-white font-medium mb-4">Temperature Trend (°C)</h3>
                <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                            dataKey="name"
                            stroke="rgba(255,255,255,0.7)"
                            fontSize={12}
                        />
                        <YAxis
                            stroke="rgba(255,255,255,0.7)"
                            fontSize={12}
                            domain={[18, 36]}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                                border: 'none',
                                borderRadius: '12px',
                                color: 'white'
                            }}
                            formatter={(value) => [`${value}°C`, 'Temperature']}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="temp"
                            stroke="#fbbf24"
                            strokeWidth={3}
                            dot={{ fill: '#fbbf24', r: 5 }}
                            name="Temperature"
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Daily Forecast Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5 gap-3">
                {forecast.forecast.map((day, index) => {
                    const IconComponent = conditionIcons[day.condition] || Cloud;
                    const colorClass = conditionColors[day.condition] || 'text-gray-400';

                    return (
                        <div
                            key={day.date}
                            className="group bg-white/5 hover:bg-white/15 backdrop-blur-xl rounded-xl p-4 shadow-lg border border-white/10 text-center transition-all duration-300 cursor-pointer hover:scale-105 hover:shadow-xl"
                        >
                            <p className="text-white/70 text-xs font-medium uppercase tracking-wide">
                                {day.dayName.slice(0, 3)}
                            </p>
                            <p className="text-white/50 text-xs mb-2">
                                {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>

                            <IconComponent className={`w-8 h-8 mx-auto mb-2 ${colorClass} group-hover:text-white transition-colors duration-300`} />

                            <p className="text-white text-2xl font-bold">{day.temp}°</p>

                            <div className="mt-2 space-y-1">
                                <div className="flex items-center justify-center gap-1 text-white/60 text-xs">
                                    <Droplets className="w-3 h-3" />
                                    <span>{day.humidity}%</span>
                                </div>
                                <div className="flex items-center justify-center gap-1 text-white/60 text-xs">
                                    <Wind className="w-3 h-3" />
                                    <span>{day.wind} km/h</span>
                                </div>
                            </div>

                            <p className="text-white/50 text-xs mt-2">{day.condition}</p>
                        </div>
                    );
                })}
            </div>

            {/* Model Info */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-white/40 text-xs text-center">
                    Forecast generated by LSTM neural network trained on local station data •
                    Last updated: {new Date(forecast.generatedAt).toLocaleString()}
                </p>
            </div>
        </div>
    );
}
