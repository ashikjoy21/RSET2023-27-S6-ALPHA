import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Download } from 'lucide-react';

export function PressureChart({ title = "Pressure Analysis" }) {
    const canvasRef = useRef(null);
    const [metric, setMetric] = useState('pressure');
    const [plotType, setPlotType] = useState('timeseries');
    const [selectedDate, setSelectedDate] = useState('');
    const [availableDates, setAvailableDates] = useState([]);
    const [pressureData, setPressureData] = useState([]);
    const [temperatureData, setTemperatureData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const metricOptions = [
        { value: 'pressure', label: 'Pressure' }
    ];

    const plotOptions = [
        { value: 'timeseries', label: 'Time series' },
        { value: 'selectedday', label: 'Time series (selected day)' },
        { value: 'scatter', label: 'Pressure vs Temperature scatter' }
    ];

    // Fetch pressure data
    const fetchPressureData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch 5-min resolution data for time series
            const detailedRes = await fetch('http://localhost:3000/api/weather/history?days=30&resolution=5min');
            if (!detailedRes.ok) throw new Error('Failed to fetch pressure data');
            const detailedData = await detailedRes.json();

            if (Array.isArray(detailedData) && detailedData.length > 0) {
                const processedData = detailedData.map(d => ({
                    date: new Date(d.date),
                    pressure: d.pressure || d.baromrelin || 0,
                    temperature: d.temp || d.temperature || 0,
                    hour: new Date(d.date).getHours()
                })).filter(d => !isNaN(d.date.getTime()) && d.pressure > 0);

                setPressureData(processedData);
                setTemperatureData(processedData);

                const uniqueDates = [...new Set(processedData.map(d =>
                    d.date.toISOString().split('T')[0]
                ))].sort().reverse();

                setAvailableDates(uniqueDates);
                if (!selectedDate && uniqueDates.length > 0) {
                    setSelectedDate(uniqueDates[0]);
                }
            } else {
                setPressureData([]);
            }
        } catch (err) {
            setError(err.message);
            setPressureData([]);
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchPressureData();
    }, []);

    // Color function based on hour (0-23) for scatter plot
    const getHourColor = (hour) => {
        const colors = [
            '#440154', '#481567', '#482677', '#453781', '#404788',
            '#39568C', '#33638D', '#2D708E', '#287D8E', '#238A8D',
            '#1F968B', '#20A387', '#29AF7F', '#3CBB75', '#55C667',
            '#73D055', '#95D840', '#B8DE29', '#DCE319', '#FDE725'
        ];
        const index = Math.floor((hour / 24) * colors.length);
        return colors[Math.min(index, colors.length - 1)];
    };

    // Draw the chart
    const drawChart = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = { top: 40, right: plotType === 'scatter' ? 80 : 30, bottom: 60, left: 80 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Time series plots
        let displayData = pressureData;
        if (plotType === 'selectedday' && selectedDate) {
            displayData = pressureData.filter(d =>
                d.date.toISOString().split('T')[0] === selectedDate
            );
        }

        if (displayData.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '14px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No pressure data available', width / 2, height / 2);
            return;
        }

        if (plotType === 'scatter') {
            // Draw Pressure vs Temperature scatter plot
            // Title
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = 'bold 14px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Pressure vs Temperature (colored by hour)', width / 2, 25);

            // Calculate ranges
            const pressures = displayData.map(d => d.pressure);
            const temps = displayData.map(d => d.temperature);

            const minPressure = Math.floor(Math.min(...pressures) / 2) * 2;
            const maxPressure = Math.ceil(Math.max(...pressures) / 2) * 2;
            const minTemp = Math.floor(Math.min(...temps) / 2) * 2 - 2;
            const maxTemp = Math.ceil(Math.max(...temps) / 2) * 2 + 2;

            const pressureRange = maxPressure - minPressure || 10;
            const tempRange = maxTemp - minTemp || 10;

            // Draw grid lines
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;

            // Y-axis grid lines (Temperature)
            const numYLines = 6;
            for (let i = 0; i <= numYLines; i++) {
                const y = padding.top + chartHeight - (i / numYLines) * chartHeight;
                const value = minTemp + (i / numYLines) * tempRange;

                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();

                // Y-axis labels
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.font = '11px Inter, system-ui, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`${Math.round(value)}`, padding.left - 10, y + 4);
            }

            // X-axis grid lines (Pressure)
            const numXLines = 6;
            for (let i = 0; i <= numXLines; i++) {
                const x = padding.left + (i / numXLines) * chartWidth;
                const value = minPressure + (i / numXLines) * pressureRange;

                ctx.beginPath();
                ctx.moveTo(x, padding.top);
                ctx.lineTo(x, height - padding.bottom);
                ctx.stroke();

                // X-axis labels
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.font = '11px Inter, system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${Math.round(value)}`, x, height - padding.bottom + 20);
            }

            // Y-axis title
            ctx.save();
            ctx.translate(20, height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.font = 'bold 12px Inter, system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText('Temperature (°C)', 0, 0);
            ctx.restore();

            // X-axis title
            ctx.font = 'bold 12px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText('Pressure (hPa)', width / 2, height - 10);

            // Draw scatter points
            displayData.forEach((point) => {
                const x = padding.left + ((point.pressure - minPressure) / pressureRange) * chartWidth;
                const y = padding.top + chartHeight - ((point.temperature - minTemp) / tempRange) * chartHeight;

                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fillStyle = getHourColor(point.hour);
                ctx.fill();
            });

            // Draw axes lines
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding.left, padding.top);
            ctx.lineTo(padding.left, height - padding.bottom);
            ctx.lineTo(width - padding.right, height - padding.bottom);
            ctx.stroke();

            // Draw color legend (hour scale)
            const legendX = width - padding.right + 20;
            const legendHeight = chartHeight;
            const legendWidth = 15;

            // Draw gradient
            for (let i = 0; i < legendHeight; i++) {
                const hour = Math.floor((1 - i / legendHeight) * 24);
                ctx.fillStyle = getHourColor(hour);
                ctx.fillRect(legendX, padding.top + i, legendWidth, 2);
            }

            // Legend labels
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '10px Inter, system-ui, sans-serif';
            ctx.textAlign = 'left';

            const hourLabels = [20, 15, 10, 5, 0];
            hourLabels.forEach(hour => {
                const y = padding.top + chartHeight - (hour / 24) * chartHeight;
                ctx.fillText(`${hour}`, legendX + legendWidth + 5, y + 4);
            });

        } else {
            // Time series plot
            // Calculate Y range
            const values = displayData.map(d => d.pressure);
            const minVal = Math.floor(Math.min(...values) / 2) * 2 - 2;
            const maxVal = Math.ceil(Math.max(...values) / 2) * 2 + 2;
            const yRange = maxVal - minVal || 10;

            // Draw grid and axes
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;

            // Y-axis grid lines
            const numYLines = 10;
            for (let i = 0; i <= numYLines; i++) {
                const y = padding.top + chartHeight - (i / numYLines) * chartHeight;
                const value = minVal + (i / numYLines) * yRange;

                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();

                // Y-axis labels
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.font = '11px Inter, system-ui, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`${Math.round(value)}`, padding.left - 10, y + 4);
            }

            // Y-axis title
            ctx.save();
            ctx.translate(20, height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.font = 'bold 12px Inter, system-ui, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText('Pressure (hPa)', 0, 0);
            ctx.restore();

            // X-axis title
            ctx.font = 'bold 12px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText('Time', width / 2, height - 10);

            // Get time range
            const minTime = Math.min(...displayData.map(d => d.date.getTime()));
            const maxTime = Math.max(...displayData.map(d => d.date.getTime()));
            const timeRange = maxTime - minTime || 1;

            // Draw X-axis labels
            const numXLabels = 8;
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '10px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';

            for (let i = 0; i <= numXLabels; i++) {
                const time = minTime + (i / numXLabels) * timeRange;
                const x = padding.left + (i / numXLabels) * chartWidth;
                const date = new Date(time);

                const label = plotType === 'selectedday'
                    ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                ctx.fillText(label, x, height - padding.bottom + 20);
            }

            // Draw line chart
            ctx.beginPath();
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;

            let firstPoint = true;
            displayData.forEach((point) => {
                const x = padding.left + ((point.date.getTime() - minTime) / timeRange) * chartWidth;
                const y = padding.top + chartHeight - ((point.pressure - minVal) / yRange) * chartHeight;

                if (firstPoint) {
                    ctx.moveTo(x, y);
                    firstPoint = false;
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();

            // Draw axes lines
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding.left, padding.top);
            ctx.lineTo(padding.left, height - padding.bottom);
            ctx.lineTo(width - padding.right, height - padding.bottom);
            ctx.stroke();
        }

    }, [pressureData, metric, plotType, selectedDate]);

    useEffect(() => {
        if (!loading) {
            drawChart();
        }
    }, [loading, drawChart, metric, plotType, selectedDate]);

    const navigateDate = (direction) => {
        const currentIndex = availableDates.indexOf(selectedDate);
        if (direction === 'prev' && currentIndex < availableDates.length - 1) {
            setSelectedDate(availableDates[currentIndex + 1]);
        } else if (direction === 'next' && currentIndex > 0) {
            setSelectedDate(availableDates[currentIndex - 1]);
        }
    };

    const saveAsPNG = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const link = document.createElement('a');
        link.download = `pressure-${selectedDate || 'chart'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    return (
        <div className="bg-white/5 backdrop-blur-xl shadow-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex flex-col lg:flex-row">
                {/* Chart Area */}
                <div className="flex-1 p-6">
                    <div className="relative" style={{ height: '450px' }}>
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <RefreshCw className="w-8 h-8 text-white/50 animate-spin" />
                            </div>
                        ) : error ? (
                            <div className="absolute inset-0 flex items-center justify-center text-red-500">
                                {error}
                            </div>
                        ) : (
                            <canvas
                                ref={canvasRef}
                                width={700}
                                height={450}
                                style={{ width: '100%', height: '100%' }}
                            />
                        )}
                    </div>
                </div>

                {/* Control Panel */}
                <div className="w-full lg:w-72 bg-white/5 border-l border-white/10 p-6">
                    <div className="border border-white/10 rounded-lg p-4 bg-white/5">
                        <h4 className="font-semibold text-white mb-4 text-sm">Control Panel</h4>

                        {/* File Info */}
                        <div className="mb-4">
                            <label className="text-xs text-white/50 block mb-1">File:</label>
                            <p className="text-xs text-white/80 truncate">RSET Integrated works/ambient-weather</p>
                        </div>

                        {/* Metric Selector */}
                        <div className="mb-4">
                            <label className="text-xs text-white/50 block mb-1">Metric:</label>
                            <select
                                value={metric}
                                onChange={(e) => setMetric(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-white/20 rounded bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                                className="w-full px-3 py-1.5 text-sm border border-white/20 rounded bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {plotOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Date Selector */}
                        <div className="mb-4">
                            <label className="text-xs text-white/50 block mb-1">Date:</label>
                            <select
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-white/20 rounded bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                            >
                                {availableDates.map(date => (
                                    <option key={date} value={date}>{date}</option>
                                ))}
                            </select>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => navigateDate('prev')}
                                    disabled={availableDates.indexOf(selectedDate) >= availableDates.length - 1}
                                    className="flex-1 px-2 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 disabled:opacity-50 rounded border border-white/20 transition-colors"
                                >
                                    ? Prev
                                </button>
                                <button
                                    onClick={() => navigateDate('next')}
                                    disabled={availableDates.indexOf(selectedDate) <= 0}
                                    className="flex-1 px-2 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 disabled:opacity-50 rounded border border-white/20 transition-colors"
                                >
                                    Next ?
                                </button>
                            </div>
                        </div>

                        {/* Draw/Refresh Button */}
                        <button
                            onClick={() => fetchPressureData()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white/80 rounded border border-white/20 transition-colors mb-3"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Draw / Refresh
                        </button>

                        {/* Save PNG Button */}
                        <button
                            onClick={saveAsPNG}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white/80 rounded border border-white/20 transition-colors mb-4"
                        >
                            <Download className="w-4 h-4" />
                            Save PNG
                        </button>

                        {/* Health Index Legend */}
                        <div className="text-xs text-white/50 pt-3 border-t border-white/10">
                            <p className="font-medium mb-1">Health Index (°C):</p>
                            <p>&lt;27 OK, 27-32 Caution, 32-41 Extreme Caution, 41-54 Danger, &gt;54 Extreme</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
