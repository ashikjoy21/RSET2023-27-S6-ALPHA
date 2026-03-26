import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Thermometer } from 'lucide-react';
import {
    ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, Legend, ErrorBar
} from 'recharts';

// Custom bar shape for min-max range (vertical stick/bar)
const MinMaxBar = (props) => {
    const { x, y, width, height, payload } = props;
    if (!payload || height <= 0) return null;

    const barWidth = Math.min(width * 0.6, 35);
    const xCenter = x + width / 2;
    const radius = 4;

    return (
        <g>
            {/* Shadow */}
            <defs>
                <linearGradient id={`tempGrad-${payload.date}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={1} />
                    <stop offset="50%" stopColor="#a855f7" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={1} />
                </linearGradient>
                <filter id="barShadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="2" dy="3" stdDeviation="3" floodOpacity="0.15" />
                </filter>
            </defs>

            {/* Main bar */}
            <rect
                x={xCenter - barWidth / 2}
                y={y}
                width={barWidth}
                height={height}
                rx={radius}
                ry={radius}
                fill={`url(#tempGrad-${payload.date})`}
                filter="url(#barShadow)"
            />

            {/* Max dot (top) */}
            <circle cx={xCenter} cy={y} r={7} fill="#f97316" />
            <circle cx={xCenter} cy={y} r={4} fill="#fff" />

            {/* Min dot (bottom) */}
            <circle cx={xCenter} cy={y + height} r={7} fill="#3b82f6" />
            <circle cx={xCenter} cy={y + height} r={4} fill="#fff" />

            {/* Max label */}
            <text x={xCenter} y={y - 12} textAnchor="middle" className="fill-white text-[11px] font-bold">
                {payload.max}°
            </text>
            {payload.maxTime && (
                <text x={xCenter} y={y - 24} textAnchor="middle" className="fill-orange-500 text-[9px]">
                    {payload.maxTime}
                </text>
            )}

            {/* Min label */}
            <text x={xCenter} y={y + height + 18} textAnchor="middle" className="fill-white text-[11px] font-bold">
                {payload.min}°
            </text>
            {payload.minTime && (
                <text x={xCenter} y={y + height + 30} textAnchor="middle" className="fill-blue-500 text-[9px]">
                    {payload.minTime}
                </text>
            )}
        </g>
    );
};

// Custom tooltip
const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0]?.payload;
    if (!data) return null;

    return (
        <div className="bg-slate-900/95 backdrop-blur-md rounded-xl shadow-2xl border border-white/10 p-4 min-w-[180px]">
            <p className="font-bold text-white/90 text-sm mb-3 border-b border-white/10 pb-2">
                {data.displayDate}
            </p>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                        <span className="text-xs text-white/60">Max</span>
                    </span>
                    <span className="font-bold text-orange-400">{data.max}°C</span>
                </div>
                {data.maxTime && (
                    <p className="text-xs text-white/50 pl-5">at {data.maxTime}</p>
                )}
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                        <span className="text-xs text-white/60">Min</span>
                    </span>
                    <span className="font-bold text-blue-400">{data.min}°C</span>
                </div>
                {data.minTime && (
                    <p className="text-xs text-white/50 pl-5">at {data.minTime}</p>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <span className="text-xs text-white/50">Range</span>
                    <span className="font-bold text-purple-400">{(data.max - data.min).toFixed(1)}°C</span>
                </div>
            </div>
        </div>
    );
};

// Custom X-axis tick
const CustomXAxisTick = ({ x, y, payload }) => {
    const date = new Date(payload.value);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dayMonth = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
        <g transform={`translate(${x},${y})`}>
            <text x={0} y={0} dy={16} textAnchor="middle" className="fill-white/70 text-[11px] font-medium">
                {weekday}
            </text>
            <text x={0} y={0} dy={30} textAnchor="middle" className="fill-white/50 text-[10px]">
                {dayMonth}
            </text>
        </g>
    );
};

export function TemperatureChart({ title = "Min Max Analysis" }) {
    const [selectedDate, setSelectedDate] = useState('');
    const [availableDates, setAvailableDates] = useState([]);
    const [dailyData, setDailyData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch temperature data
    const fetchTemperatureData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const dailyRes = await fetch('http://localhost:3000/api/weather/history?days=30&resolution=daily');
            if (!dailyRes.ok) throw new Error('Failed to fetch daily data');
            const daily = await dailyRes.json();

            if (Array.isArray(daily) && daily.length > 0) {
                const dailyMinMax = daily.map(d => ({
                    date: d.isoDate || d.date,
                    displayDate: d.date,
                    min: d.tempMin ?? d.temp,
                    max: d.tempMax ?? d.temp,
                    minTime: d.tempMinTime || null,
                    maxTime: d.tempMaxTime || null,
                    // For bar: base is min, range is the height
                    barBase: d.tempMin ?? d.temp,
                    barHeight: (d.tempMax ?? d.temp) - (d.tempMin ?? d.temp)
                })).sort((a, b) => new Date(a.date) - new Date(b.date));

                setDailyData(dailyMinMax);

                const dailyDates = dailyMinMax.map(d => d.date).reverse();
                if (dailyDates.length > 0 && !selectedDate) {
                    setSelectedDate(dailyDates[0]);
                }
                setAvailableDates(dailyDates);
            }
        } catch (err) {
            setError(err.message);
            setDailyData([]);
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchTemperatureData();
    }, []);

    const navigateDate = (direction) => {
        const currentIndex = availableDates.indexOf(selectedDate);
        if (direction === 'prev' && currentIndex < availableDates.length - 1) {
            setSelectedDate(availableDates[currentIndex + 1]);
        } else if (direction === 'next' && currentIndex > 0) {
            setSelectedDate(availableDates[currentIndex - 1]);
        }
    };

    // Get display data (7 days around selected date)
    const getDisplayData = () => {
        if (!selectedDate || dailyData.length === 0) {
            return dailyData.slice(-7);
        }
        const selectedIndex = dailyData.findIndex(d => d.date === selectedDate);
        if (selectedIndex >= 0) {
            const start = Math.max(0, selectedIndex - 3);
            const end = Math.min(dailyData.length, start + 7);
            return dailyData.slice(start, end);
        }
        return dailyData.slice(-7);
    };

    const displayData = getDisplayData();

    // Calculate stats
    const maxTemp = dailyData.length > 0 ? Math.max(...dailyData.map(d => d.max || 0)) : 0;
    const minTemp = dailyData.length > 0 ? Math.min(...dailyData.map(d => d.min || 0)) : 0;
    const avgTemp = dailyData.length > 0
        ? (dailyData.reduce((sum, d) => sum + ((d.max + d.min) / 2), 0) / dailyData.length).toFixed(1)
        : 0;

    // Calculate Y-axis domain with padding for labels
    const yMin = Math.floor(Math.min(...displayData.map(d => d.min)) / 2) * 2 - 4;
    const yMax = Math.ceil(Math.max(...displayData.map(d => d.max)) / 2) * 2 + 4;

    // Format date for display
    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Get date range for subtitle
    const dateRange = displayData.length > 1
        ? `${displayData[0]?.displayDate || ''} — ${displayData[displayData.length - 1]?.displayDate || ''}`
        : displayData[0]?.displayDate || '';

    return (
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/10 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
                        <Thermometer className="w-6 h-6 text-orange-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-lg">{title}</h3>
                        <p className="text-sm text-white/50">{formatDateDisplay(selectedDate)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-xs text-white/50">Range</p>
                        <p className="text-lg font-bold text-orange-400">{minTemp}° - {maxTemp}°C</p>
                    </div>
                    <span className="text-xs font-bold text-orange-400 uppercase tracking-tighter bg-orange-500/20 px-2 py-1 rounded">
                        Daily Range
                    </span>
                    <span className="text-xs text-white/50">
                        {dailyData.length} days
                    </span>
                </div>
            </div>

            {/* Control Panel */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
                <button
                    onClick={() => navigateDate('prev')}
                    disabled={availableDates.indexOf(selectedDate) >= availableDates.length - 1}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-50 rounded-lg transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Prev
                </button>

                <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-3 py-2 text-sm border border-white/20 rounded-lg bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                    {availableDates.map(date => (
                        <option key={date} value={date} className="bg-slate-800">{date}</option>
                    ))}
                </select>

                <button
                    onClick={() => navigateDate('next')}
                    disabled={availableDates.indexOf(selectedDate) <= 0}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-50 rounded-lg transition-colors"
                >
                    Next
                    <ChevronRight className="w-4 h-4" />
                </button>

                <button
                    onClick={() => fetchTemperatureData()}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Chart */}
            <div className="relative" style={{ height: '450px' }}>
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="absolute inset-0 flex items-center justify-center text-red-500">
                        {error}
                    </div>
                ) : displayData.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50">
                        <Thermometer className="w-12 h-12 mb-2 opacity-50" />
                        <p>No temperature data available</p>
                    </div>
                ) : (
                    <div className="flex flex-col h-full">
                        {/* Chart Title */}
                        <div className="text-center mb-2">
                            <h4 className="text-white font-bold text-base">Daily Temperature Range</h4>
                            <p className="text-white/50 text-xs">{dateRange}</p>
                        </div>

                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                                data={displayData}
                                margin={{ top: 40, right: 30, left: 20, bottom: 60 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />

                                <XAxis
                                    dataKey="date"
                                    tick={<CustomXAxisTick />}
                                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                                    tickLine={false}
                                    interval={0}
                                    height={50}
                                />

                                <YAxis
                                    domain={[yMin, yMax]}
                                    axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                                    tickLine={false}
                                    tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
                                    tickFormatter={(value) => `${value}°`}
                                    label={{
                                        value: 'Temperature (°C)',
                                        angle: -90,
                                        position: 'insideLeft',
                                        style: { fill: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }
                                    }}
                                />

                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />

                                {/* Stacked bars: base (invisible) + range (visible) */}
                                <Bar
                                    dataKey="barBase"
                                    stackId="temp"
                                    fill="transparent"
                                    isAnimationActive={false}
                                />
                                <Bar
                                    dataKey="barHeight"
                                    stackId="temp"
                                    shape={<MinMaxBar />}
                                    isAnimationActive={true}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Stats Footer */}
            {dailyData.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-xs text-white/50">Average</p>
                        <p className="text-lg font-bold text-white">{avgTemp}°C</p>
                    </div>
                    <div>
                        <p className="text-xs text-white/50">Range</p>
                        <p className="text-lg font-bold text-orange-400">{(maxTemp - minTemp).toFixed(1)}°C</p>
                    </div>
                    <div>
                        <p className="text-xs text-white/50">Days</p>
                        <p className="text-lg font-bold text-white">{dailyData.length}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
