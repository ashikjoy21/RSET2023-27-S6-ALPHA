import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Loader, RefreshCw, Activity, ChevronDown } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { DiurnalHeatmap } from '../components/DiurnalHeatmap';
import { WindPolarChart } from '../components/WindPolarChart';
import { RainRateChart } from '../components/RainRateChart';
import { HumidityChart } from '../components/HumidityChart';
import { UVIndexChart } from '../components/UVIndexChart';
import { TemperatureChart } from '../components/TemperatureChart';
import { PredictionAccuracyChart } from '../components/PredictionAccuracyChart';
import { PressureWindChart } from '../components/PressureWindChart';

// Chart configuration - easy to extend when adding new charts
const CHART_OPTIONS = [
    { id: 'all', name: 'All Charts', description: 'Display all available charts' },
    { id: 'overview', name: 'Overview & Insights', description: 'Key stats and summary charts' },
    { id: 'pressure-timeseries', name: 'Pressure Time Series', description: 'Engineering view of pressure data' },
    { id: 'temperature', name: 'Temperature Analysis', description: 'Temperature trends and patterns' },
    { id: 'humidity', name: 'Humidity Analysis', description: 'Humidity trends over time' },
    { id: 'rain', name: 'Rain Rate Analysis', description: 'Precipitation patterns' },
    { id: 'uv', name: 'UV Index Analysis', description: 'UV radiation levels' },
    { id: 'wind', name: 'Wind Direction & Speed', description: 'Wind polar chart' },
    { id: 'pressure-wind', name: 'Pressure vs Wind', description: 'Scatter plot analysis' },
    { id: 'heatmap-temp', name: 'Temperature Heatmap', description: 'Diurnal temperature patterns' },
    { id: 'heatmap-solar', name: 'Solar Radiation Heatmap', description: 'Diurnal solar patterns' },
    { id: 'prediction', name: 'ML Prediction Accuracy', description: 'Machine learning model performance' },
];

export function Analysis() {
    const [data, setData] = useState([]);
    const [detailedData, setDetailedData] = useState([]);
    const [hourlyData, setHourlyData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [insights, setInsights] = useState(null);
    const [selectedChart, setSelectedChart] = useState('all');

    useEffect(() => {
        fetchAnalysisData();
    }, []);

    async function fetchAnalysisData() {
        try {
            setLoading(true);
            setError(null);

            // Fetch daily summary data (for bar charts and insights)
            const dailyRes = await fetch('http://localhost:3000/api/weather/history?days=30&resolution=daily');
            if (!dailyRes.ok) throw new Error('Failed to fetch daily data');
            const dailyData = await dailyRes.json();

            // Fetch hourly data for the heatmap (7 days = 168 hours)
            const hourlyRes = await fetch('http://localhost:3000/api/weather/history?days=7&resolution=hourly');
            if (!hourlyRes.ok) throw new Error('Failed to fetch hourly data');
            const hourlyData = await hourlyRes.json();

            // Fetch 5-min data for pressure time series chart
            const detailedRes = await fetch('http://localhost:3000/api/weather/history?days=7&resolution=5min');
            if (!detailedRes.ok) throw new Error('Failed to fetch detailed data');
            const detailed = await detailedRes.json();

            if (Array.isArray(dailyData) && dailyData.length > 0) {
                setData(dailyData);
                setHourlyData(hourlyData);
                setDetailedData(detailed);

                // Calculate insights from daily data
                const temps = dailyData.map(d => d.temp).filter(t => t !== null);
                const humidities = dailyData.map(d => d.humidity).filter(h => h !== null);

                const maxTemp = Math.max(...temps);
                const minTemp = Math.min(...temps);
                const maxTempRecord = dailyData.find(d => d.temp === maxTemp);
                const minTempRecord = dailyData.find(d => d.temp === minTemp);
                const maxTempDay = maxTempRecord?.date;
                const minTempDay = minTempRecord?.date;
                const maxTempTime = maxTempRecord?.tempMaxTime;
                const minTempTime = minTempRecord?.tempMinTime;

                const avgTemp = (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
                const avgHumidity = Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length);

                // Temperature trend
                const firstHalf = temps.slice(0, Math.ceil(temps.length / 2));
                const secondHalf = temps.slice(Math.ceil(temps.length / 2));
                const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
                const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
                const tempTrend = secondAvg > firstAvg ? 'rising' : secondAvg < firstAvg ? 'falling' : 'stable';

                setInsights({
                    maxTemp, minTemp, maxTempDay, minTempDay,
                    maxTempTime, minTempTime,
                    avgTemp, avgHumidity, tempTrend,
                    range: maxTemp - minTemp,
                    totalReadings: dailyData.length
                });
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    // Helper function to check if a chart should be displayed
    const shouldShowChart = (chartId) => {
        if (selectedChart === 'all') return true;
        if (selectedChart === 'overview' && ['overview'].includes(chartId)) return true;
        return selectedChart === chartId;
    };

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto flex items-center justify-center p-12">
                <Loader className="w-8 h-8 text-white/50 animate-spin" />
                <span className="text-white/50 ml-3">Loading analysis...</span>
            </div>
        );
    }

    if (error || data.length === 0) {
        return (
            <div className="max-w-6xl mx-auto flex flex-col items-center justify-center p-12 gap-4">
                <span className="text-white/50">{error || 'No history data stored in MongoDB yet'}</span>
                <p className="text-white/30 text-sm max-w-md text-center">
                    Analysis requires historical data. As the station continues to sync every hour, this page will populate with more detailed trends.
                </p>
                <button onClick={fetchAnalysisData} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors">
                    <RefreshCw className="w-4 h-4" /> Refresh from Database
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* Header with Chart Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <Activity className="w-8 h-8 text-blue-400" />
                    <div>
                        <h2 className="text-white mb-1">Weather Analysis</h2>
                        <p className="text-white/80">RSET_WS - Data Insights from MongoDB</p>
                    </div>
                </div>

                {/* Chart Selector Dropdown */}
                <div className="relative">
                    <div className="flex items-center gap-3">
                        <label className="text-white/60 text-sm font-medium">Select Chart:</label>
                        <div className="relative">
                            <select
                                value={selectedChart}
                                onChange={(e) => setSelectedChart(e.target.value)}
                                className="appearance-none bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-xl px-4 py-2.5 pr-10 text-sm font-medium cursor-pointer hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[220px]"
                            >
                                {CHART_OPTIONS.map(option => (
                                    <option key={option.id} value={option.id} className="bg-slate-800 text-white">
                                        {option.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
                        </div>
                    </div>
                    {/* Show description of selected chart */}
                    <p className="text-white/40 text-xs mt-2 text-right">
                        {CHART_OPTIONS.find(opt => opt.id === selectedChart)?.description}
                    </p>
                </div>
            </div>

            {/* Pressure Detailed Chart (Engineering Plot Design) */}
            {(shouldShowChart('pressure-timeseries') || shouldShowChart('overview')) && (
                <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/10 overflow-hidden">
                    <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
                        <h3 className="text-white font-bold text-lg">Pressure Time Series (hPa)</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-blue-400 uppercase tracking-tighter bg-blue-500/20 px-2 py-1 rounded">Engineering View</span>
                            <span className="text-xs text-white/50">Total Samples: {detailedData.length}</span>
                        </div>
                    </div>
                    <div className="relative h-[450px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={detailedData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={true} />
                                <XAxis
                                    dataKey="date"
                                    stroke="rgba(255,255,255,0.7)"
                                    fontSize={10}
                                    tickLine={true}
                                    axisLine={true}
                                    label={{ value: 'Time', position: 'bottom', offset: 0, style: { fill: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 500 } }}
                                    tickFormatter={(str) => {
                                        const d = new Date(str);
                                        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                    }}
                                    minTickGap={30}
                                />
                                <YAxis
                                    stroke="rgba(255,255,255,0.7)"
                                    fontSize={10}
                                    tickLine={true}
                                    axisLine={true}
                                    domain={['auto', 'auto']}
                                    label={{ value: 'Pressure (hPa)', angle: -90, position: 'insideLeft', offset: 10, style: { fill: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 500 } }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(30, 41, 59, 0.95)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        color: 'white',
                                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)'
                                    }}
                                    cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }}
                                    labelFormatter={(label) => new Date(label).toLocaleString()}
                                />
                                <Legend
                                    verticalAlign="top"
                                    align="right"
                                    height={36}
                                    iconType="plainline"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="pressure"
                                    stroke="#3482f6"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4, fill: '#3482f6', stroke: '#fff', strokeWidth: 2 }}
                                    name="Time series"
                                    isAnimationActive={true}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Key Insights Stats */}
            {insights && (shouldShowChart('overview') || selectedChart === 'all') && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-orange-500/20">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-5 h-5 text-white" />
                            <p className="text-white/70">Peak Temp</p>
                        </div>
                        <p className="text-white text-3xl font-bold">{insights.maxTemp}°C</p>
                        <p className="text-white/60 text-sm mt-1">{insights.maxTempDay}</p>
                        {insights.maxTempTime && (
                            <p className="text-white/80 text-sm font-medium mt-1">at {insights.maxTempTime}</p>
                        )}
                    </div>

                    <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-cyan-500/20">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="w-5 h-5 text-white" />
                            <p className="text-white/70">Lowest Temp</p>
                        </div>
                        <p className="text-white text-3xl font-bold">{insights.minTemp}°C</p>
                        <p className="text-white/60 text-sm mt-1">{insights.minTempDay}</p>
                        {insights.minTempTime && (
                            <p className="text-white/80 text-sm font-medium mt-1">at {insights.minTempTime}</p>
                        )}
                    </div>

                    <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-purple-500/20">
                        <p className="text-white/70 mb-2">Temp Variation</p>
                        <p className="text-white text-3xl font-bold">{insights.range}°C</p>
                        <p className="text-white/60 text-sm mt-1">Weekly range</p>
                    </div>

                    <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-emerald-500/20">
                        <p className="text-white/70 mb-2">Current Trend</p>
                        <p className="text-white text-2xl font-bold capitalize flex items-center gap-2">
                            {insights.tempTrend === 'rising' && <TrendingUp className="w-6 h-6" />}
                            {insights.tempTrend === 'falling' && <TrendingDown className="w-6 h-6" />}
                            {insights.tempTrend === 'stable' && <Activity className="w-6 h-6" />}
                            {insights.tempTrend}
                        </p>
                        <p className="text-white/60 text-sm mt-1">Moving average</p>
                    </div>
                </div>
            )}

            {/* Daily Temperature Comparison (Bar Chart) */}
            {(shouldShowChart('overview') || selectedChart === 'all') && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-white/10">
                        <h3 className="text-white mb-6 font-medium">Daily Peak Temperature</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                <XAxis dataKey="date" stroke="rgba(255,255,255,0.7)" fontSize={11} />
                                <YAxis stroke="rgba(255,255,255,0.7)" fontSize={11} />
                                <Tooltip contentStyle={{ backgroundColor: 'rgba(30, 58, 138, 0.95)', border: 'none', borderRadius: '12px', color: 'white' }} />
                                <Bar dataKey="temp" fill="#fbbf24" name="Temperature (°C)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Humidity Trend (Line Chart) */}
                    <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-white/10">
                        <h3 className="text-white mb-6 font-medium">Humidity Trend (%)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                <XAxis dataKey="date" stroke="rgba(255,255,255,0.7)" fontSize={11} />
                                <YAxis stroke="rgba(255,255,255,0.7)" domain={[0, 100]} fontSize={11} />
                                <Tooltip contentStyle={{ backgroundColor: 'rgba(30, 58, 138, 0.95)', border: 'none', borderRadius: '12px', color: 'white' }} />
                                <Line type="monotone" dataKey="humidity" stroke="#60a5fa" strokeWidth={3} name="Humidity (%)" dot={{ fill: '#60a5fa', r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Weekly Summary */}
            {insights && (shouldShowChart('overview') || selectedChart === 'all') && (
                <div className="bg-slate-900/80 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-1.5 h-8 bg-blue-400 rounded-full"></div>
                        <h3 className="text-white text-xl font-bold">Station Analysis Summary</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-6">
                            <div className="flex justify-between items-center border-b border-white/5 pb-3">
                                <span className="text-white/60">Mean Temperature</span>
                                <span className="text-white font-bold text-lg">{insights.avgTemp}°C</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-3">
                                <span className="text-white/60">Mean Relative Humidity</span>
                                <span className="text-white font-bold text-lg">{insights.avgHumidity}%</span>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div className="flex justify-between items-center border-b border-white/5 pb-3">
                                <span className="text-white/60">Observation Period</span>
                                <span className="text-white font-bold">Last 7 Days</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-3">
                                <span className="text-white/60">Data Source</span>
                                <span className="text-white font-bold">Ambient Weather (Sync'd to MongoDB)</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Diurnal Temperature Heatmap */}
            {hourlyData.length > 0 && shouldShowChart('heatmap-temp') && (
                <DiurnalHeatmap
                    data={hourlyData}
                    metric="temp"
                    title="Temperature Heatmap (Hour of Day vs Date)"
                />
            )}

            {/* Diurnal Solar Heatmap */}
            {hourlyData.length > 0 && shouldShowChart('heatmap-solar') && (
                <DiurnalHeatmap
                    data={hourlyData}
                    metric="solarradiation"
                    title="Diurnal Heatmap: Solar"
                />
            )}

            {/* Temperature Time Series Chart */}
            {shouldShowChart('temperature') && (
                <TemperatureChart title="Temperature Analysis" />
            )}

            {/* Rain Rate Time Series Chart */}
            {shouldShowChart('rain') && (
                <RainRateChart title="Rain Rate Analysis" />
            )}

            {/* Humidity Time Series Chart */}
            {shouldShowChart('humidity') && (
                <HumidityChart title="Humidity Analysis" />
            )}

            {/* UV Index Time Series Chart */}
            {shouldShowChart('uv') && (
                <UVIndexChart title="UV Index Analysis" />
            )}

            {/* Wind Direction & Speed Polar Chart */}
            {shouldShowChart('wind') && (
                <WindPolarChart title="Wind Direction & Speed" />
            )}

            {/* Pressure vs Wind Scatter Chart */}
            {shouldShowChart('pressure-wind') && (
                <PressureWindChart title="Pressure vs Wind Analysis" />
            )}

            {/* Prediction Accuracy Charts */}
            {shouldShowChart('prediction') && (
                <PredictionAccuracyChart title="ML Prediction Accuracy" />
            )}
        </div>
    );
}
