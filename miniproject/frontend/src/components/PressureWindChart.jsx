import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Download, Activity, ChevronLeft, ChevronRight } from 'lucide-react';

export function PressureWindChart({ title = "Pressure vs Wind Analysis" }) {
    const canvasRef = useRef(null);
    const [metric, setMetric] = useState('wind');
    const [plotType, setPlotType] = useState('scatter');
    const [selectedDate, setSelectedDate] = useState('');
    const [availableDates, setAvailableDates] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const metricOptions = [
        { value: 'wind', label: 'Wind' }
    ];

    const plotOptions = [
        { value: 'scatter', label: 'Pressure vs Wind (scatter)' },
        { value: 'timeseries', label: 'Time series' },
        { value: 'selectedday', label: 'Time series (selected day)' }
    ];

    // Fetch chart data
    const fetchChartData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const url = 'http://localhost:3000/api/weather/history?days=30&resolution=5min';
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch data');

            const data = await response.json();

            if (Array.isArray(data) && data.length > 0) {
                const processedData = data.map(d => ({
                    date: new Date(d.date),
                    pressure: d.pressure || 0,
                    windSpeed: d.wind || 0,
                    hour: new Date(d.date).getHours()
                })).filter(d => !isNaN(d.date.getTime()) && d.pressure > 0);

                setChartData(processedData);

                const uniqueDates = [...new Set(processedData.map(d =>
                    d.date.toISOString().split('T')[0]
                ))].sort().reverse();

                setAvailableDates(uniqueDates);
                if (!selectedDate && uniqueDates.length > 0) {
                    setSelectedDate(uniqueDates[0]);
                }
            } else {
                setChartData([]);
            }
        } catch (err) {
            setError(err.message);
            setChartData([]);
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchChartData();
    }, []);

    // Color function based on hour (0-23)
    const getHourColor = (hour) => {
        // Create a viridis-like color scale
        const colors = [
            '#440154', '#481567', '#482677', '#453781', '#404788',
            '#39568C', '#33638D', '#2D708E', '#287D8E', '#238A8D',
            '#1F968B', '#20A387', '#29AF7F', '#3CBB75', '#55C667',
            '#73D055', '#95D840', '#B8DE29', '#DCE319', '#FDE725'
        ];
        const index = Math.floor((hour / 24) * colors.length);
        return colors[Math.min(index, colors.length - 1)];
    };

    // Draw the scatter plot
    const drawChart = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || chartData.length === 0) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = { top: 50, right: 100, bottom: 60, left: 80 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Filter data based on plot type and selected date
        let displayData = chartData;

        if (plotType === 'selectedday' && selectedDate) {
            // Show only the selected day
            displayData = chartData.filter(d =>
                d.date.toISOString().split('T')[0] === selectedDate
            );
        } else if (plotType === 'scatter' && selectedDate) {
            // For scatter, show 7 days centered around selected date
            const uniqueDates = [...new Set(chartData.map(d => d.date.toISOString().split('T')[0]))].sort();
            const selectedIndex = uniqueDates.indexOf(selectedDate);
            if (selectedIndex >= 0) {
                const startIdx = Math.max(0, selectedIndex - 3);
                const endIdx = Math.min(uniqueDates.length, startIdx + 7);
                const datesToShow = uniqueDates.slice(startIdx, endIdx);
                displayData = chartData.filter(d =>
                    datesToShow.includes(d.date.toISOString().split('T')[0])
                );
            }
        }

        if (displayData.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '14px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data available', width / 2, height / 2);
            return;
        }

        // Title with subtitle
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 18px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Pressure vs Wind Speed', width / 2, 28);

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '12px Inter, system-ui, sans-serif';
        const subtitle = `${displayData.length.toLocaleString()} data points • colored by hour of day`;
        ctx.fillText(subtitle, width / 2, 48);

        // Calculate ranges
        const pressures = displayData.map(d => d.pressure);
        const winds = displayData.map(d => d.windSpeed);

        const minPressure = Math.floor(Math.min(...pressures) / 2) * 2;
        const maxPressure = Math.ceil(Math.max(...pressures) / 2) * 2;
        const minWind = 0;
        const maxWind = Math.ceil(Math.max(...winds) / 2) * 2 || 12;

        const pressureRange = maxPressure - minPressure || 10;
        const windRange = maxWind - minWind || 12;

        // Draw clean grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;

        // Y-axis grid lines (Wind)
        const numYLines = 5;
        for (let i = 0; i <= numYLines; i++) {
            const y = padding.top + chartHeight - (i / numYLines) * chartHeight;
            const value = minWind + (i / numYLines) * windRange;

            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();

            // Y-axis labels
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${value.toFixed(1)}`, padding.left - 12, y + 4);
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
        ctx.fillText('Wind (Km/h)', 0, 0);
        ctx.restore();

        // X-axis title
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('Pressure (hPa)', width / 2, height - 10);

        // Draw scatter points - clean minimal style
        ctx.globalAlpha = 0.55;
        displayData.forEach((point) => {
            const x = padding.left + ((point.pressure - minPressure) / pressureRange) * chartWidth;
            const y = padding.top + chartHeight - ((point.windSpeed - minWind) / windRange) * chartHeight;
            const color = getHourColor(point.hour);

            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        // Draw axes lines
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.lineTo(width - padding.right, height - padding.bottom);
        ctx.stroke();

        // Draw premium color legend (hour scale)
        const legendX = padding.left + chartWidth + 25;
        const legendBarHeight = chartHeight * 0.8;
        const legendY = padding.top + (chartHeight - legendBarHeight) / 2;
        const legendWidth = 14;

        // Legend title
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '600 11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Hour', legendX, legendY - 10);

        // Draw smooth gradient bar
        const gradientBar = ctx.createLinearGradient(0, legendY, 0, legendY + legendBarHeight);
        for (let i = 0; i <= 23; i++) {
            gradientBar.addColorStop(1 - i / 23, getHourColor(i));
        }

        ctx.beginPath();
        ctx.roundRect(legendX, legendY, legendWidth, legendBarHeight, 3);
        ctx.fillStyle = gradientBar;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Legend labels
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        [0, 6, 12, 18, 24].forEach(hour => {
            const yPos = legendY + legendBarHeight - (hour / 24) * legendBarHeight;
            ctx.fillText(`${hour}:00`, legendX + legendWidth + 6, yPos + 3);
        });

    }, [chartData, plotType, selectedDate]);

    useEffect(() => {
        if (!loading) {
            drawChart();
        }
    }, [loading, drawChart, plotType, selectedDate]);

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
        link.download = `pressure-wind-${selectedDate || 'chart'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    // Calculate stats
    const maxPressure = chartData.length > 0 ? Math.max(...chartData.map(d => d.pressure)) : 0;
    const minPressure = chartData.length > 0 ? Math.min(...chartData.map(d => d.pressure)) : 0;
    const avgWind = chartData.length > 0
        ? (chartData.reduce((sum, d) => sum + d.windSpeed, 0) / chartData.length).toFixed(1)
        : 0;

    // Format date for display
    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div className="bg-slate-900/80 backdrop-blur-xl p-6 shadow-xl border border-white/10 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                        <Activity className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-lg">{title}</h3>
                        <p className="text-sm text-white/50">{formatDateDisplay(selectedDate)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-xs text-white/50">Pressure Range</p>
                        <p className="text-lg font-bold text-blue-400">{minPressure.toFixed(0)} - {maxPressure.toFixed(0)} hPa</p>
                    </div>
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-tighter bg-blue-500/20 px-2 py-1 rounded">
                        Scatter Plot
                    </span>
                    <span className="text-xs text-white/50">
                        {chartData.length} points
                    </span>
                </div>
            </div>

            {/* Control Panel - Horizontal */}
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

                <select
                    value={plotType}
                    onChange={(e) => setPlotType(e.target.value)}
                    className="px-3 py-2 text-sm border border-white/20 rounded-lg bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    {plotOptions.map(opt => (
                        <option key={opt.value} value={opt.value} className="bg-slate-800">{opt.label}</option>
                    ))}
                </select>

                <button
                    onClick={() => fetchChartData()}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>

                <button
                    onClick={saveAsPNG}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-white/10 text-white/80 hover:bg-white/20 rounded-lg transition-colors"
                >
                    <Download className="w-4 h-4" />
                    PNG
                </button>
            </div>

            {/* Chart Canvas */}
            <div className="relative flex justify-center" style={{ height: '450px' }}>
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <RefreshCw className="w-8 h-8 text-white/50 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="absolute inset-0 flex items-center justify-center text-red-500">
                        {error}
                    </div>
                ) : chartData.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50">
                        <Activity className="w-12 h-12 mb-2 opacity-50" />
                        <p>No pressure/wind data available</p>
                        <p className="text-sm mt-1">Try selecting a different date</p>
                    </div>
                ) : (
                    <canvas
                        ref={canvasRef}
                        width={800}
                        height={450}
                        style={{ maxWidth: '100%', height: 'auto' }}
                    />
                )}
            </div>

            {/* Stats Footer */}
            {chartData.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-xs text-white/50">Avg Wind</p>
                        <p className="text-lg font-bold text-white">{avgWind} km/h</p>
                    </div>
                    <div>
                        <p className="text-xs text-white/50">Pressure Range</p>
                        <p className="text-lg font-bold text-blue-400">{(maxPressure - minPressure).toFixed(1)} hPa</p>
                    </div>
                    <div>
                        <p className="text-xs text-white/50">Samples</p>
                        <p className="text-lg font-bold text-white">{chartData.length}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
