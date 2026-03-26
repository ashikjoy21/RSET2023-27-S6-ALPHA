import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Download, CloudRain } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts';

export function RainRateChart({ title = "Rain Rate Analysis" }) {
    const [metric, setMetric] = useState('hourlyRain');
    const [selectedDate, setSelectedDate] = useState('');
    const [availableDates, setAvailableDates] = useState([]);
    const [rainData, setRainData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const metricOptions = [
        { value: 'hourlyRain', label: 'Hourly Rain (mm)' },
        { value: 'dailyRain', label: 'Daily Accumulation (mm)' }
    ];

    // Fetch rain data from dedicated endpoint
    const fetchRainData = useCallback(async (date = '') => {
        try {
            setLoading(true);
            setError(null);

            const url = date
                ? `http://localhost:3000/api/weather/rain?date=${date}`
                : 'http://localhost:3000/api/weather/rain';

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch rain data');

            const data = await response.json();

            const processedData = (data.rainData || []).map(d => ({
                date: d.timestamp,
                time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                hourlyRain: d.hourlyRain || 0,
                dailyRain: d.dailyRain || 0
            }));

            setRainData(processedData);
            setSelectedDate(data.date);

            if (data.availableDates && data.availableDates.length > 0) {
                setAvailableDates(data.availableDates);
            }
        } catch (err) {
            setError(err.message);
            setRainData([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRainData();
    }, [fetchRainData]);

    const navigateDate = (direction) => {
        const currentIndex = availableDates.indexOf(selectedDate);
        if (direction === 'prev' && currentIndex < availableDates.length - 1) {
            fetchRainData(availableDates[currentIndex + 1]);
        } else if (direction === 'next' && currentIndex > 0) {
            fetchRainData(availableDates[currentIndex - 1]);
        }
    };

    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Calculate stats
    const totalRain = rainData.length > 0 ? Math.max(...rainData.map(d => d.dailyRain)) : 0;
    const maxHourlyRain = rainData.length > 0 ? Math.max(...rainData.map(d => d.hourlyRain)) : 0;

    return (
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                        <CloudRain className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-lg">{title}</h3>
                        <p className="text-sm text-white/50">{formatDateDisplay(selectedDate)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-xs text-white/50">Daily Total</p>
                        <p className="text-lg font-bold text-blue-400">{totalRain.toFixed(2)} mm</p>
                    </div>
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-tighter bg-blue-500/20 px-2 py-1 rounded">
                        {rainData.length} samples
                    </span>
                </div>
            </div>

            {/* Control Panel */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
                <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                    className="px-3 py-2 text-sm border border-white/20 rounded-lg bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    {metricOptions.map(opt => (
                        <option key={opt.value} value={opt.value} className="bg-slate-800">{opt.label}</option>
                    ))}
                </select>

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
                    onChange={(e) => fetchRainData(e.target.value)}
                    className="px-3 py-2 text-sm border border-white/20 rounded-lg bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    onClick={() => fetchRainData(selectedDate)}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Chart */}
            <div className="relative h-[400px]">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="absolute inset-0 flex items-center justify-center text-red-500">
                        {error}
                    </div>
                ) : rainData.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                        <CloudRain className="w-12 h-12 mb-2 opacity-50" />
                        <p>No rain data available for this date</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={rainData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <defs>
                                <linearGradient id="rainGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
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
                                domain={[0, 'auto']}
                                label={{ value: metric === 'hourlyRain' ? 'Rain Rate (mm/hr)' : 'Accumulated (mm)', angle: -90, position: 'insideLeft', offset: 10, style: { fill: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 500 } }}
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
                                formatter={(value) => [`${value.toFixed(2)} mm`, metric === 'hourlyRain' ? 'Rain Rate' : 'Daily Total']}
                            />
                            <Legend
                                verticalAlign="top"
                                align="right"
                                height={36}
                                iconType="plainline"
                            />
                            <Area
                                type="monotone"
                                dataKey={metric}
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fill="url(#rainGradient)"
                                dot={false}
                                activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                                name={metric === 'hourlyRain' ? 'Hourly Rain' : 'Daily Accumulation'}
                                isAnimationActive={true}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Stats Footer */}
            {rainData.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-xs text-white/50">Max Hourly</p>
                        <p className="text-lg font-bold text-white">{maxHourlyRain.toFixed(2)} mm</p>
                    </div>
                    <div>
                        <p className="text-xs text-white/50">Total Today</p>
                        <p className="text-lg font-bold text-blue-400">{totalRain.toFixed(2)} mm</p>
                    </div>
                    <div>
                        <p className="text-xs text-white/50">Samples</p>
                        <p className="text-lg font-bold text-white">{rainData.length}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
