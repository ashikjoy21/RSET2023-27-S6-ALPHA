import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, Sun } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';

export function UVIndexChart({ title = "UV Index Analysis" }) {
    const [metric, setMetric] = useState('uv');
    const [plotType, setPlotType] = useState('timeseries');
    const [selectedDate, setSelectedDate] = useState('');
    const [availableDates, setAvailableDates] = useState([]);
    const [uvData, setUVData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const metricOptions = [
        { value: 'uv', label: 'UV Index' },
        { value: 'solarRadiation', label: 'Solar Radiation' }
    ];

    const plotOptions = [
        { value: 'timeseries', label: 'Time series' },
        { value: 'selectedday', label: 'Time series (selected day)' },
        { value: 'hourlycurve', label: 'Hourly curve (selected day)' },
        { value: 'hourlyavg', label: 'Hourly curve (avg)' }
    ];

    // UV Index color and category
    const getUVColor = (uv) => {
        if (uv <= 2) return '#22c55e';
        if (uv <= 5) return '#eab308';
        if (uv <= 7) return '#f97316';
        if (uv <= 10) return '#ef4444';
        return '#a855f7';
    };

    const getUVCategory = (uv) => {
        if (uv <= 2) return { label: 'Low', color: '#22c55e' };
        if (uv <= 5) return { label: 'Moderate', color: '#eab308' };
        if (uv <= 7) return { label: 'High', color: '#f97316' };
        if (uv <= 10) return { label: 'Very High', color: '#ef4444' };
        return { label: 'Extreme', color: '#a855f7' };
    };

    // Fetch UV data from dedicated endpoint
    const fetchUVData = useCallback(async (date = '') => {
        try {
            setLoading(true);
            setError(null);

            const url = date
                ? `http://localhost:3000/api/weather/uv?date=${date}`
                : 'http://localhost:3000/api/weather/uv';

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch UV data');

            const data = await response.json();

            const processedData = (data.uvData || []).map(d => ({
                date: d.timestamp,
                time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                uv: d.uv || 0,
                solarRadiation: d.solarRadiation || 0
            }));

            setUVData(processedData);
            setSelectedDate(data.date);

            if (data.availableDates && data.availableDates.length > 0) {
                setAvailableDates(data.availableDates);
            }
        } catch (err) {
            setError(err.message);
            setUVData([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUVData();
    }, [fetchUVData]);

    const navigateDate = (direction) => {
        const currentIndex = availableDates.indexOf(selectedDate);
        if (direction === 'prev' && currentIndex < availableDates.length - 1) {
            fetchUVData(availableDates[currentIndex + 1]);
        } else if (direction === 'next' && currentIndex > 0) {
            fetchUVData(availableDates[currentIndex - 1]);
        }
    };

    // Calculate stats
    const maxUV = uvData.length > 0 ? Math.max(...uvData.map(d => d.uv)) : 0;
    const avgUV = uvData.length > 0 ? (uvData.reduce((sum, d) => sum + d.uv, 0) / uvData.length).toFixed(1) : 0;
    const uvCategory = getUVCategory(maxUV);

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const value = payload[0].value;
            const cat = metric === 'uv' ? getUVCategory(value) : null;
            return (
                <div className="bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-xl">
                    <p className="text-white/60 text-xs mb-1">{label}</p>
                    <p className="text-lg font-bold" style={{ color: cat?.color || '#eab308' }}>
                        {metric === 'uv' ? `UV Index: ${value}` : `${value} W/m²`}
                    </p>
                    {cat && <p className="text-sm" style={{ color: cat.color }}>{cat.label}</p>}
                </div>
            );
        }
        return null;
    };

    // Format date for display
    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/10 overflow-hidden">
            {/* Header - Same style as other charts */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                        <Sun className="w-6 h-6 text-yellow-500" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-lg">{title}</h3>
                        <p className="text-sm text-white/50">{formatDateDisplay(selectedDate)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-xs text-white/50">Peak UV</p>
                        <p className="text-lg font-bold" style={{ color: uvCategory.color }}>{maxUV}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-white/50">Category</p>
                        <p className="text-sm font-bold" style={{ color: uvCategory.color }}>{uvCategory.label}</p>
                    </div>
                    <span className="text-xs font-bold text-yellow-500 uppercase tracking-tighter bg-yellow-500/20 px-2 py-1 rounded">
                        {uvData.length} samples
                    </span>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row">
                {/* Chart Area */}
                <div className="flex-1 p-6">
                    <div className="relative h-[450px]">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
                            </div>
                        ) : error ? (
                            <div className="absolute inset-0 flex items-center justify-center text-red-500">
                                {error}
                            </div>
                        ) : uvData.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                <Sun className="w-12 h-12 mb-2 opacity-50" />
                                <p>No UV data available for this date</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={uvData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                                    <defs>
                                        <linearGradient id="uvGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#eab308" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#eab308" stopOpacity={0.05} />
                                        </linearGradient>
                                        <linearGradient id="solarGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={true} />
                                    <XAxis
                                        dataKey="time"
                                        stroke="rgba(255,255,255,0.7)"
                                        fontSize={10}
                                        tickLine={true}
                                        axisLine={true}
                                        label={{ value: 'Time', position: 'bottom', offset: 0, style: { fill: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 500 } }}
                                        minTickGap={40}
                                    />
                                    <YAxis
                                        stroke="rgba(255,255,255,0.7)"
                                        fontSize={10}
                                        tickLine={true}
                                        axisLine={true}
                                        domain={metric === 'uv' ? [0, Math.max(11, maxUV + 1)] : [0, 'auto']}
                                        label={{ value: metric === 'uv' ? 'UV Index' : 'Solar Radiation (W/m²)', angle: -90, position: 'insideLeft', offset: 10, style: { fill: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 500 } }}
                                    />
                                    {metric === 'uv' && (
                                        <>
                                            <ReferenceLine y={3} stroke="#22c55e" strokeOpacity={0.5} strokeDasharray="5 5" />
                                            <ReferenceLine y={6} stroke="#eab308" strokeOpacity={0.5} strokeDasharray="5 5" />
                                            <ReferenceLine y={8} stroke="#f97316" strokeOpacity={0.5} strokeDasharray="5 5" />
                                            <ReferenceLine y={11} stroke="#ef4444" strokeOpacity={0.5} strokeDasharray="5 5" />
                                        </>
                                    )}
                                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }} />
                                    <Legend verticalAlign="top" align="right" height={36} iconType="plainline" />
                                    <Area
                                        type="monotone"
                                        dataKey={metric}
                                        stroke={metric === 'uv' ? '#eab308' : '#f97316'}
                                        strokeWidth={2}
                                        fill={metric === 'uv' ? 'url(#uvGradient)' : 'url(#solarGradient)'}
                                        dot={false}
                                        activeDot={{ r: 6, fill: metric === 'uv' ? '#eab308' : '#f97316', stroke: '#fff', strokeWidth: 2 }}
                                        name={metric === 'uv' ? 'UV Index' : 'Solar Radiation'}
                                        isAnimationActive={true}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Control Panel - Side Bar */}
                <div className="w-full lg:w-72 bg-white/5 border-l border-white/10 p-6">
                    <div className="border border-white/10 rounded-lg p-4 bg-white/5">
                        <h4 className="font-semibold text-white mb-4 text-sm flex items-center gap-2">
                            <Sun className="w-4 h-4 text-yellow-500" />
                            Control Panel
                        </h4>

                        {/* Current Stats */}
                        <div className="mb-4 p-3 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-lg">
                            <p className="text-xs text-white/50 mb-1">Peak UV Index</p>
                            <p className="text-2xl font-bold" style={{ color: uvCategory.color }}>{maxUV}</p>
                            <p className="text-sm" style={{ color: uvCategory.color }}>{uvCategory.label}</p>
                        </div>

                        {/* File Info */}
                        <div className="mb-4">
                            <label className="text-xs text-white/50 block mb-1">Date:</label>
                            <p className="text-sm text-white font-medium">{selectedDate}</p>
                        </div>

                        {/* Metric Selector */}
                        <div className="mb-4">
                            <label className="text-xs text-white/50 block mb-1">Metric:</label>
                            <select
                                value={metric}
                                onChange={(e) => setMetric(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-white/20 rounded bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                            >
                                {metricOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Plot Type Selector */}
                        <div className="mb-4">
                            <label className="text-xs text-white/50 block mb-1">Plot:</label>
                            <select
                                value={plotType}
                                onChange={(e) => setPlotType(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-white/20 rounded bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                            >
                                {plotOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Date Navigation */}
                        <div className="mb-4">
                            <label className="text-xs text-white/50 block mb-1">Navigate:</label>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => navigateDate('prev')}
                                    disabled={availableDates.indexOf(selectedDate) >= availableDates.length - 1}
                                    className="flex-1 px-2 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 rounded border border-white/20 transition-colors"
                                >
                                    ← Prev
                                </button>
                                <button
                                    onClick={() => navigateDate('next')}
                                    disabled={availableDates.indexOf(selectedDate) <= 0}
                                    className="flex-1 px-2 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 rounded border border-white/20 transition-colors"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>

                        {/* Date Picker */}
                        <div className="mb-4">
                            <select
                                value={selectedDate}
                                onChange={(e) => fetchUVData(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-white/20 rounded bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                            >
                                {availableDates.map(date => (
                                    <option key={date} value={date}>{date}</option>
                                ))}
                            </select>
                        </div>

                        {/* Draw/Refresh Button */}
                        <button
                            onClick={() => fetchUVData(selectedDate)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded border border-yellow-600 transition-colors mb-3"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Draw / Refresh
                        </button>

                        {/* Save PNG Button */}
                        <button
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded border border-white/20 transition-colors mb-4"
                        >
                            <Download className="w-4 h-4" />
                            Save PNG
                        </button>

                        {/* UV Index Legend */}
                        <div className="text-xs text-white/50 pt-3 border-t border-white/10">
                            <p className="font-medium mb-2 text-white/80">UV Index Scale:</p>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-green-500"></div>
                                    <span>0-2 Low</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-yellow-500"></div>
                                    <span>3-5 Moderate</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-orange-500"></div>
                                    <span>6-7 High</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-red-500"></div>
                                    <span>8-10 Very High</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded bg-purple-500"></div>
                                    <span>11+ Extreme</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
