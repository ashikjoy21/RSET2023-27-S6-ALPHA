import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Activity, Loader, AlertCircle, RefreshCw } from 'lucide-react';

export function PredictionAccuracyChart({ title = "Prediction Accuracy" }) {
    const [data, setData] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedMetric, setSelectedMetric] = useState('temp');
    const [message, setMessage] = useState(null);

    // Separate state for the rainfall tab (fetched from /rain-accuracy backtest endpoint)
    const [rainData, setRainData] = useState([]);
    const [rainMetrics, setRainMetrics] = useState(null);
    const [rainLoading, setRainLoading] = useState(true);
    const [rainError, setRainError] = useState(null);
    const [rainFetched, setRainFetched] = useState(false);

    const metricConfig = {
        temp: {
            label: 'Temperature',
            unit: '\u00b0C',
            predictedColor: '#f97316', // Orange for predicted
            actualColor: '#3b82f6',    // Blue for actual
            variationColor: '#8b5cf6', // Purple for variation
            // Realistic range for Kerala campus temperature (\u00b0C)
            yDomain: [10, 45]
        },
        humidity: {
            label: 'Humidity',
            unit: '%',
            predictedColor: '#f97316',
            actualColor: '#06b6d4',    // Cyan for actual
            variationColor: '#8b5cf6',
            // Humidity is always 0\u2013100 %
            yDomain: [0, 100]
        },
        wind: {
            label: 'Wind Speed',
            unit: 'km/h',
            predictedColor: '#f97316',
            actualColor: '#22c55e',    // Green for actual
            variationColor: '#8b5cf6',
            yDomain: ['auto', 'auto']
        },
        pressure: {
            label: 'Pressure',
            unit: 'hPa',
            predictedColor: '#f97316',
            actualColor: '#6366f1',    // Indigo for actual
            variationColor: '#8b5cf6',
            // Typical sea-level pressure range (hPa)
            yDomain: [990, 1030]
        },
        // XGBoost 3-hour-ahead rainfall prediction
        rainfall: {
            label: 'Rainfall',
            unit: 'mm/day',
            predictedColor: '#f97316',
            actualColor: '#14b8a6',    // Teal for actual
            variationColor: '#0ea5e9', // Sky blue for variation
            yDomain: [0, 30]           // mm/day realistic range
        }
    };

    useEffect(() => {
        fetchAccuracyData();
        fetchRainAccuracy();
    }, []);

    async function fetchRainAccuracy() {
        try {
            setRainLoading(true);
            setRainError(null);
            const response = await fetch('http://localhost:3000/api/weather/rain-accuracy');
            if (!response.ok) throw new Error('Failed to fetch rainfall accuracy data');
            const result = await response.json();
            if (result.success && result.data) {
                // Transform backtest output into the same chartData shape
                const chartData = result.data.map(item => ({
                    date:              item.displayDate,
                    predictedRainfall: item.predicted?.rainfall,
                    actualRainfall:    item.actual?.rainfall,
                    variationRainfall: item.variation?.rainfall
                }));
                setRainData(chartData);
                setRainMetrics(result.metrics);
                setRainFetched(true);
            } else {
                setRainError(result.error || 'No rainfall data available.');
            }
        } catch (err) {
            setRainError(err.message);
        } finally {
            setRainLoading(false);
        }
    }

    async function fetchAccuracyData() {
        try {
            setLoading(true);
            setError(null);
            setMessage(null);

            const response = await fetch('http://localhost:3000/api/weather/accuracy?days=14');
            if (!response.ok) throw new Error('Failed to fetch accuracy data');

            const result = await response.json();

            if (!result.success) {
                setMessage(result.message);
                setData([]);
                setMetrics(null);
            } else {
                // Transform data for charts
                const chartData = result.data.map(item => ({
                    date: item.displayDate,
                    predictedTemp:     item.predicted?.temp,
                    actualTemp:        item.actual?.temp,
                    variationTemp:     item.variation?.temp,
                    predictedHumidity: item.predicted?.humidity,
                    actualHumidity:    item.actual?.humidity,
                    variationHumidity: item.variation?.humidity,
                    predictedWind:     item.predicted?.wind,
                    actualWind:        item.actual?.wind,
                    variationWind:     item.variation?.wind,
                    predictedPressure: item.predicted?.pressure,
                    actualPressure:    item.actual?.pressure,
                    variationPressure: item.variation?.pressure,
                    // Rainfall from XGBoost 3h-ahead model
                    predictedRainfall: item.predicted?.rainfall,
                    actualRainfall:    item.actual?.rainfall,
                    variationRainfall: item.variation?.rainfall
                }));

                setData(chartData);
                setMetrics(result.metrics);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    const getMetricKey = (type) => {
        const key = selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1);
        return `${type}${key}`;
    };

    const currentConfig = metricConfig[selectedMetric];

    // For the Rainfall tab use its own data/metrics; all other tabs use the main accuracy data
    const isRainfall = selectedMetric === 'rainfall';
    const activeData    = isRainfall ? rainData    : data;
    const activeMetrics = isRainfall ? rainMetrics : metrics;
    const currentMetrics = activeMetrics?.[selectedMetric];

    // Global loading state (main fetch OR rain fetch when on rainfall tab)
    const isLoading = isRainfall ? rainLoading : loading;
    const activeError = isRainfall ? rainError : error;

    if (isLoading) {
        return (
            <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-md rounded-2xl p-8 shadow-lg border border-white/10">
                <div className="flex items-center justify-center gap-3">
                    <Loader className="w-6 h-6 text-white/50 animate-spin" />
                    <span className="text-white/50">
                        {isRainfall ? 'Running rainfall backtest (this takes ~15s)…' : 'Loading accuracy data…'}
                    </span>
                </div>
            </div>
        );
    }

    if (activeError) {
        return (
            <div className="bg-gradient-to-br from-red-900/50 to-slate-900/90 backdrop-blur-md rounded-2xl p-8 shadow-lg border border-red-500/30">
                <div className="flex items-center gap-3 text-red-400">
                    <AlertCircle className="w-6 h-6" />
                    <span>{activeError}</span>
                </div>
            </div>
        );
    }

    if (!isRainfall && (message || data.length === 0)) {
        return (
            <div className="bg-gradient-to-br from-amber-900/30 to-slate-900/90 backdrop-blur-md rounded-2xl p-8 shadow-lg border border-amber-500/30">
                <div className="flex flex-col items-center gap-4">
                    <AlertCircle className="w-10 h-10 text-amber-400" />
                    <p className="text-white/70 text-center max-w-md">
                        {message || 'No prediction accuracy data available yet.'}
                    </p>
                    <p className="text-white/50 text-sm text-center max-w-md">
                        Generate a forecast first, then wait for the predicted dates to pass so we can compare with actual observations.
                    </p>
                    <button
                        onClick={fetchAccuracyData}
                        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-md rounded-2xl p-6 shadow-lg border border-white/10">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Activity className="w-6 h-6 text-purple-400" />
                        <h3 className="text-white font-bold text-lg">{title}</h3>
                    </div>
                    <button
                        onClick={fetchAccuracyData}
                        className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors text-sm"
                    >
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </button>
                </div>

                {/* Metric Selector */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {Object.entries(metricConfig).map(([key, config]) => (
                        <button
                            key={key}
                            onClick={() => setSelectedMetric(key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedMetric === key
                                ? 'bg-purple-500 text-white shadow-lg'
                                : 'bg-white/10 text-white/70 hover:bg-white/20'
                                }`}
                        >
                            {config.label}
                        </button>
                    ))}
                </div>

                {/* Accuracy Metrics */}
                {currentMetrics && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white/5 rounded-xl p-4">
                            <p className="text-white/50 text-xs uppercase tracking-wide mb-1">MAE</p>
                            <p className="text-white text-xl font-bold">
                                {currentMetrics.mae} {currentConfig.unit}
                            </p>
                            <p className="text-white/40 text-xs">Mean Absolute Error</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4">
                            <p className="text-white/50 text-xs uppercase tracking-wide mb-1">RMSE</p>
                            <p className="text-white text-xl font-bold">
                                {currentMetrics.rmse} {currentConfig.unit}
                            </p>
                            <p className="text-white/40 text-xs">Root Mean Square Error</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4">
                            <p className="text-white/50 text-xs uppercase tracking-wide mb-1">Data Points</p>
                            <p className="text-white text-xl font-bold">{currentMetrics.dataPoints}</p>
                            <p className="text-white/40 text-xs">Compared Days</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 flex items-center gap-3">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: currentConfig.predictedColor }}></div>
                                    <span className="text-white/70 text-xs">Predicted</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: currentConfig.actualColor }}></div>
                                    <span className="text-white/70 text-xs">Actual</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Chart 1: Predicted vs Actual Line Chart */}
            <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-md rounded-2xl p-6 shadow-lg border border-white/10">
                <h4 className="text-white font-medium mb-4">
                    {currentConfig.label}: Predicted vs Actual Values
                </h4>
                <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={activeData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis
                                dataKey="date"
                                stroke="rgba(255,255,255,0.5)"
                                fontSize={11}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                            />
                            <YAxis
                                stroke="rgba(255,255,255,0.5)"
                                fontSize={11}
                                // Use a fixed, realistic domain per metric so small
                                // fluctuations don't get exaggerated by tight auto-scaling
                                domain={currentConfig.yDomain}
                                label={{
                                    value: `${currentConfig.label} (${currentConfig.unit})`,
                                    angle: -90,
                                    position: 'insideLeft',
                                    style: { fill: 'rgba(255,255,255,0.5)', fontSize: 12 }
                                }}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(30, 41, 59, 0.95)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    color: 'white'
                                }}
                                formatter={(value, name) => [
                                    `${value} ${currentConfig.unit}`,
                                    name.includes('predicted') ? 'Predicted' : 'Actual'
                                ]}
                            />
                            <Legend
                                wrapperStyle={{ paddingTop: '20px' }}
                                formatter={(value) => (
                                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                                        {value.includes('predicted') ? 'Predicted' : 'Actual'}
                                    </span>
                                )}
                            />
                            <Line
                                type="monotone"
                                dataKey={getMetricKey('predicted')}
                                stroke={currentConfig.predictedColor}
                                strokeWidth={3}
                                dot={{ fill: currentConfig.predictedColor, r: 4 }}
                                name="predicted"
                            />
                            <Line
                                type="monotone"
                                dataKey={getMetricKey('actual')}
                                stroke={currentConfig.actualColor}
                                strokeWidth={3}
                                dot={{ fill: currentConfig.actualColor, r: 4 }}
                                name="actual"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Chart 2: Variation Bar Chart */}
            <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-md rounded-2xl p-6 shadow-lg border border-white/10">
                <h4 className="text-white font-medium mb-2">
                    {currentConfig.label}: Prediction Variation
                </h4>
                <p className="text-white/50 text-sm mb-4">
                    Positive = Over-predicted | Negative = Under-predicted
                </p>
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activeData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis
                                dataKey="date"
                                stroke="rgba(255,255,255,0.5)"
                                fontSize={11}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                            />
                            <YAxis
                                stroke="rgba(255,255,255,0.5)"
                                fontSize={11}
                                label={{
                                    value: `Error (${currentConfig.unit})`,
                                    angle: -90,
                                    position: 'insideLeft',
                                    style: { fill: 'rgba(255,255,255,0.5)', fontSize: 12 }
                                }}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(30, 41, 59, 0.95)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    color: 'white'
                                }}
                                formatter={(value) => {
                                    const direction = value > 0 ? 'Over-predicted by' : 'Under-predicted by';
                                    return [`${direction} ${Math.abs(value)} ${currentConfig.unit}`, 'Variation'];
                                }}
                            />
                            <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeWidth={2} />
                            <Bar
                                dataKey={getMetricKey('variation')}
                                name="Variation"
                                radius={[4, 4, 0, 0]}
                                fill={currentConfig.variationColor}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Variation Legend */}
                <div className="flex justify-center gap-8 mt-4">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-red-400" />
                        <span className="text-white/60 text-sm">Over-prediction (positive)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-green-400" />
                        <span className="text-white/60 text-sm">Under-prediction (negative)</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
