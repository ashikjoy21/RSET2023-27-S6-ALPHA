import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Droplets } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export function HumidityChart({ title = "Humidity Analysis" }) {
    const [metric, setMetric] = useState('humidity');
    const [selectedDate, setSelectedDate] = useState('');
    const [availableDates, setAvailableDates] = useState([]);
    const [humidityData, setHumidityData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const metricOptions = [
        { value: 'humidity', label: 'Relative Humidity (%)' },
        { value: 'dewPoint', label: 'Dew Point (°C)' },
        { value: 'both', label: 'Both Metrics' }
    ];

    // Fetch humidity data from dedicated endpoint
    const fetchHumidityData = useCallback(async (date = '') => {
        try {
            setLoading(true);
            setError(null);

            const url = date
                ? `http://localhost:3000/api/weather/humidity?date=${date}`
                : 'http://localhost:3000/api/weather/humidity';

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch humidity data');

            const data = await response.json();

            const processedData = (data.humidityData || []).map(d => ({
                date: d.timestamp,
                time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                humidity: d.humidity || 0,
                dewPoint: d.dewPoint || 0,
                tempC: d.tempC || 0
            }));

            setHumidityData(processedData);
            setSelectedDate(data.date);

            if (data.availableDates && data.availableDates.length > 0) {
                setAvailableDates(data.availableDates);
            }
        } catch (err) {
            setError(err.message);
            setHumidityData([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHumidityData();
    }, [fetchHumidityData]);

    const navigateDate = (direction) => {
        const currentIndex = availableDates.indexOf(selectedDate);
        if (direction === 'prev' && currentIndex < availableDates.length - 1) {
            fetchHumidityData(availableDates[currentIndex + 1]);
        } else if (direction === 'next' && currentIndex > 0) {
            fetchHumidityData(availableDates[currentIndex - 1]);
        }
    };

    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Calculate stats
    const avgHumidity = humidityData.length > 0
        ? (humidityData.reduce((sum, d) => sum + d.humidity, 0) / humidityData.length).toFixed(1)
        : 0;
    const currentHumidity = humidityData.length > 0 ? humidityData[humidityData.length - 1].humidity : 0;
    const currentDewPoint = humidityData.length > 0 ? humidityData[humidityData.length - 1].dewPoint : 0;

    return (
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                        <Droplets className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-lg">{title}</h3>
                        <p className="text-sm text-white/50">{formatDateDisplay(selectedDate)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-xs text-white/50">Current</p>
                        <p className="text-lg font-bold text-cyan-400">{currentHumidity}%</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-white/50">Dew Point</p>
                        <p className="text-lg font-bold text-emerald-400">{currentDewPoint}°C</p>
                    </div>
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-tighter bg-cyan-500/20 px-2 py-1 rounded">
                        {humidityData.length} samples
                    </span>
                </div>
            </div>

            {/* Control Panel */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
                <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                    className="px-3 py-2 text-sm border border-white/20 rounded-lg bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                    onChange={(e) => fetchHumidityData(e.target.value)}
                    className="px-3 py-2 text-sm border border-white/20 rounded-lg bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                    onClick={() => fetchHumidityData(selectedDate)}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
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
                ) : humidityData.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                        <Droplets className="w-12 h-12 mb-2 opacity-50" />
                        <p>No humidity data available for this date</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={humidityData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
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
                                yAxisId="humidity"
                                stroke="#06b6d4"
                                fontSize={10}
                                tickLine={true}
                                axisLine={true}
                                domain={metric === 'dewPoint' ? ['auto', 'auto'] : [0, 100]}
                                label={{ value: metric === 'dewPoint' ? 'Dew Point (°C)' : 'Relative Humidity (%)', angle: -90, position: 'insideLeft', offset: 10, style: { fill: '#06b6d4', fontSize: 12, fontWeight: 500 } }}
                            />
                            {metric === 'both' && (
                                <YAxis
                                    yAxisId="dewPoint"
                                    orientation="right"
                                    stroke="#10b981"
                                    fontSize={10}
                                    tickLine={true}
                                    axisLine={true}
                                    domain={['auto', 'auto']}
                                    label={{ value: 'Dew Point (°C)', angle: 90, position: 'insideRight', offset: 10, style: { fill: '#10b981', fontSize: 12, fontWeight: 500 } }}
                                />
                            )}
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
                            />
                            <Legend
                                verticalAlign="top"
                                align="right"
                                height={36}
                                iconType="plainline"
                            />
                            {(metric === 'humidity' || metric === 'both') && (
                                <Line
                                    yAxisId="humidity"
                                    type="monotone"
                                    dataKey="humidity"
                                    stroke="#06b6d4"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 5, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }}
                                    name="Humidity (%)"
                                    isAnimationActive={true}
                                />
                            )}
                            {(metric === 'dewPoint' || metric === 'both') && (
                                <Line
                                    yAxisId={metric === 'both' ? 'dewPoint' : 'humidity'}
                                    type="monotone"
                                    dataKey="dewPoint"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                                    name="Dew Point (°C)"
                                    isAnimationActive={true}
                                />
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Stats Footer */}
            {humidityData.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-4 gap-4 text-center">
                    <div>
                        <p className="text-xs text-white/50">Average</p>
                        <p className="text-lg font-bold text-white">{avgHumidity}%</p>
                    </div>
                    <div>
                        <p className="text-xs text-white/50">Min</p>
                        <p className="text-lg font-bold text-cyan-400">{Math.min(...humidityData.map(d => d.humidity))}%</p>
                    </div>
                    <div>
                        <p className="text-xs text-white/50">Max</p>
                        <p className="text-lg font-bold text-cyan-400">{Math.max(...humidityData.map(d => d.humidity))}%</p>
                    </div>
                    <div>
                        <p className="text-xs text-white/50">Samples</p>
                        <p className="text-lg font-bold text-white">{humidityData.length}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
