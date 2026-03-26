import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Wind } from 'lucide-react';

export function WindPolarChart({ title = "Wind Direction & Speed" }) {
    const canvasRef = useRef(null);
    const [selectedDate, setSelectedDate] = useState('');
    const [availableDates, setAvailableDates] = useState([]);
    const [windData, setWindData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch wind data for a specific date
    const fetchWindData = useCallback(async (date = '') => {
        try {
            setLoading(true);
            setError(null);
            const url = date
                ? `http://localhost:3000/api/weather/wind?date=${date}`
                : 'http://localhost:3000/api/weather/wind';

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch wind data');

            const data = await response.json();
            setWindData(data.windData || []);
            setSelectedDate(data.date);

            if (data.availableDates && data.availableDates.length > 0) {
                setAvailableDates(data.availableDates);
            }
        } catch (err) {
            setError(err.message);
            setWindData([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch - defaults to today
    useEffect(() => {
        fetchWindData();
    }, [fetchWindData]);

    // Viridis-style color scale for wind speed
    const getSpeedColor = (speed, maxSpeed) => {
        const t = Math.min(speed / Math.max(maxSpeed, 20), 1);

        // Purple -> Blue -> Teal -> Green -> Yellow
        const colors = [
            { r: 68, g: 1, b: 84 },      // Purple (0)
            { r: 59, g: 82, b: 139 },    // Blue (0.25)
            { r: 33, g: 145, b: 140 },   // Teal (0.5)
            { r: 94, g: 201, b: 98 },    // Green (0.75)
            { r: 253, g: 231, b: 37 }    // Yellow (1)
        ];

        const idx = t * (colors.length - 1);
        const lower = Math.floor(idx);
        const upper = Math.min(lower + 1, colors.length - 1);
        const blend = idx - lower;

        const r = Math.round(colors[lower].r + blend * (colors[upper].r - colors[lower].r));
        const g = Math.round(colors[lower].g + blend * (colors[upper].g - colors[lower].g));
        const b = Math.round(colors[lower].b + blend * (colors[upper].b - colors[lower].b));

        return `rgb(${r}, ${g}, ${b})`;
    };

    // Draw the polar chart
    const drawChart = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // Set canvas size with DPR for HD rendering
        const displayWidth = 600;
        const displayHeight = 450;
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        ctx.scale(dpr, dpr);

        const width = displayWidth;
        const height = displayHeight;
        const centerX = width / 2 - 50;
        const centerY = height / 2;
        const maxRadius = Math.min(centerX, centerY) - 50;

        // Clear canvas with transparent background
        ctx.clearRect(0, 0, width, height);

        // Calculate max speed for scaling
        const maxSpeed = Math.max(20, ...windData.map(d => d.windspeed));
        const speedStep = Math.ceil(maxSpeed / 4);

        // Draw polar grid with smoother lines
        ctx.lineWidth = 1;

        // Concentric circles (speed rings)
        for (let i = 1; i <= 4; i++) {
            const radius = (i / 4) * maxRadius;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.strokeStyle = i === 4 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
            ctx.stroke();

            // Speed labels with better styling
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '11px Inter, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`${i * speedStep}`, centerX, centerY - radius - 4);
        }

        // Radial lines for directions (every 30 degrees)
        for (let angle = 0; angle < 360; angle += 30) {
            const radian = (angle - 90) * Math.PI / 180;
            const x = centerX + maxRadius * Math.cos(radian);
            const y = centerY + maxRadius * Math.sin(radian);

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(x, y);
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Direction labels
            const labelRadius = maxRadius + 22;
            const labelX = centerX + labelRadius * Math.cos(radian);
            const labelY = centerY + labelRadius * Math.sin(radian);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Cardinal direction labels
            const dirLabels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
            if (dirLabels[angle]) {
                ctx.font = 'bold 14px Inter, -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.fillText(dirLabels[angle], labelX, labelY);
            } else {
                ctx.font = '11px Inter, -apple-system, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillText(`${angle}°`, labelX, labelY);
            }
        }

        // Plot wind data points with glow effect
        windData.forEach(point => {
            const speed = point.windspeed;
            const direction = point.winddir;

            // Convert to canvas coordinates
            const radian = (direction - 90) * Math.PI / 180;
            const radius = (speed / maxSpeed) * maxRadius;
            const x = centerX + radius * Math.cos(radian);
            const y = centerY + radius * Math.sin(radian);

            // Draw point with subtle shadow
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = getSpeedColor(speed, maxSpeed);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        // Draw color legend
        const legendX = width - 70;
        const legendY = 50;
        const legendHeight = height - 100;
        const legendWidth = 16;

        // Gradient bar
        const gradient = ctx.createLinearGradient(0, legendY + legendHeight, 0, legendY);
        gradient.addColorStop(0, getSpeedColor(0, maxSpeed));
        gradient.addColorStop(0.25, getSpeedColor(maxSpeed * 0.25, maxSpeed));
        gradient.addColorStop(0.5, getSpeedColor(maxSpeed * 0.5, maxSpeed));
        gradient.addColorStop(0.75, getSpeedColor(maxSpeed * 0.75, maxSpeed));
        gradient.addColorStop(1, getSpeedColor(maxSpeed, maxSpeed));

        // Legend background
        ctx.fillStyle = gradient;
        ctx.fillRect(legendX, legendY, legendWidth, legendHeight);

        // Legend border
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

        // Legend labels
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '10px Inter, -apple-system, sans-serif';
        ctx.textAlign = 'left';

        for (let i = 0; i <= 4; i++) {
            const y = legendY + legendHeight - (i / 4) * legendHeight;
            const value = Math.round((i / 4) * maxSpeed);
            ctx.fillText(`${value}`, legendX + legendWidth + 6, y + 3);
        }

        // Legend title
        ctx.save();
        ctx.translate(legendX + legendWidth + 30, legendY + legendHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.font = '11px Inter, -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('Wind Speed (km/h)', 0, 0);
        ctx.restore();

    }, [windData]);

    // Redraw when data changes
    useEffect(() => {
        if (!loading) {
            drawChart();
        }
    }, [loading, drawChart]);

    // Navigate to previous/next date
    const navigateDate = (direction) => {
        const currentIndex = availableDates.indexOf(selectedDate);
        if (direction === 'prev' && currentIndex < availableDates.length - 1) {
            fetchWindData(availableDates[currentIndex + 1]);
        } else if (direction === 'next' && currentIndex > 0) {
            fetchWindData(availableDates[currentIndex - 1]);
        }
    };

    // Format date for display
    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Calculate stats
    const maxWindSpeed = windData.length > 0 ? Math.max(...windData.map(d => d.windspeed)) : 0;
    const avgWindSpeed = windData.length > 0
        ? (windData.reduce((sum, d) => sum + d.windspeed, 0) / windData.length).toFixed(1)
        : 0;

    return (
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-500/20 rounded-xl flex items-center justify-center">
                        <Wind className="w-6 h-6 text-teal-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-lg">{title}</h3>
                        <p className="text-sm text-white/50">{formatDateDisplay(selectedDate)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-xs text-white/50">Max Speed</p>
                        <p className="text-lg font-bold text-teal-400">{maxWindSpeed.toFixed(1)} km/h</p>
                    </div>
                    <span className="text-xs font-bold text-teal-400 uppercase tracking-tighter bg-teal-500/20 px-2 py-1 rounded">
                        Polar Plot
                    </span>
                    <span className="text-xs text-white/50">
                        {windData.length} points
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
                    onChange={(e) => fetchWindData(e.target.value)}
                    className="px-3 py-2 text-sm border border-white/20 rounded-lg bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                    onClick={() => fetchWindData(selectedDate)}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
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
                ) : windData.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50">
                        <Wind className="w-12 h-12 mb-2 opacity-50" />
                        <p>No wind data available for this date</p>
                        <p className="text-sm mt-1">Try selecting a different date</p>
                    </div>
                ) : (
                    <canvas
                        ref={canvasRef}
                        style={{ maxWidth: '100%', height: 'auto' }}
                    />
                )}
            </div>

            {/* Stats Footer */}
            {windData.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-xs text-white/50">Average</p>
                        <p className="text-lg font-bold text-white">{avgWindSpeed} km/h</p>
                    </div>
                    <div>
                        <p className="text-xs text-white/50">Max</p>
                        <p className="text-lg font-bold text-teal-400">{maxWindSpeed.toFixed(1)} km/h</p>
                    </div>
                    <div>
                        <p className="text-xs text-white/50">Samples</p>
                        <p className="text-lg font-bold text-white">{windData.length}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
