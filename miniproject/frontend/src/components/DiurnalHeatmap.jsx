import { useMemo, useRef, useEffect, useState, useCallback } from 'react';

// Viridis-inspired colormap (dark purple → blue → teal → green → yellow)
const VIRIDIS = [
    [68, 1, 84],
    [72, 24, 106],
    [68, 57, 131],
    [59, 82, 139],
    [47, 107, 142],
    [38, 130, 142],
    [31, 150, 139],
    [53, 183, 121],
    [110, 206, 88],
    [181, 222, 43],
    [253, 231, 37],
];

function viridisColor(ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));
    const idx = clamped * (VIRIDIS.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, VIRIDIS.length - 1);
    const t = idx - lo;
    const r = Math.round(VIRIDIS[lo][0] + t * (VIRIDIS[hi][0] - VIRIDIS[lo][0]));
    const g = Math.round(VIRIDIS[lo][1] + t * (VIRIDIS[hi][1] - VIRIDIS[lo][1]));
    const b = Math.round(VIRIDIS[lo][2] + t * (VIRIDIS[hi][2] - VIRIDIS[lo][2]));
    return `rgb(${r},${g},${b})`;
}

export function DiurnalHeatmap({ data = [], metric: initialMetric = 'temp', title = 'Diurnal Heatmap' }) {
    const canvasRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);
    const [metric, setMetric] = useState(initialMetric);

    // Process data into heatmap grid
    const { grid, days, hours, minVal, maxVal, filledCells } = useMemo(() => {
        const processed = {};

        data.forEach(record => {
            if (!record.date) return;

            let dateObj;
            let hour;

            if (record.date.includes('T') || record.date.includes('Z')) {
                dateObj = new Date(record.date);
                hour = dateObj.getHours();
            } else {
                if (record.time) {
                    const timeMatch = record.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
                    if (timeMatch) {
                        hour = parseInt(timeMatch[1]);
                        const isPM = timeMatch[3].toUpperCase() === 'PM';
                        if (isPM && hour !== 12) hour += 12;
                        if (!isPM && hour === 12) hour = 0;
                    }
                }
                dateObj = new Date(record.date);
            }

            // Use short date label for x-axis
            const day = dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
            const sortKey = dateObj.toISOString().split('T')[0];

            const value = record[metric];
            const key = `${sortKey}-${hour}`;

            if (hour !== undefined && value !== null && value !== undefined) {
                processed[key] = { day, sortKey, hour, value };
            }
        });

        const entries = Object.values(processed);

        // Unique sorted days
        const dayMap = new Map();
        entries.forEach(e => dayMap.set(e.sortKey, e.day));
        const sortedDays = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const daysList = sortedDays.map(d => ({ sortKey: d[0], label: d[1] }));

        const hoursList = Array.from({ length: 24 }, (_, i) => i);

        // Build 2D grid [hour][dayIndex]
        const gridData = {};
        entries.forEach(e => {
            const dayIdx = daysList.findIndex(d => d.sortKey === e.sortKey);
            if (dayIdx >= 0) {
                gridData[`${e.hour}-${dayIdx}`] = e.value;
            }
        });

        const values = entries.map(e => e.value).filter(v => v !== null && v !== undefined);
        const min = values.length > 0 ? Math.min(...values) : 0;
        const max = values.length > 0 ? Math.max(...values) : 100;

        return {
            grid: gridData,
            days: daysList,
            hours: hoursList,
            minVal: min,
            maxVal: max,
            filledCells: entries.length,
        };
    }, [data, metric]);

    const unitLabel = metric === 'solarradiation' ? 'W/m²' : '°C';

    // Draw the heatmap on canvas
    const drawHeatmap = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || days.length === 0) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // Layout
        const marginLeft = 50;
        const marginBottom = 70;
        const marginTop = 10;
        const marginRight = 10;
        const plotW = canvas.clientWidth - marginLeft - marginRight;
        const plotH = canvas.clientHeight - marginTop - marginBottom;

        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        ctx.scale(dpr, dpr);

        // Background
        ctx.fillStyle = '#0f0a1a';
        ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

        const cellW = plotW / days.length;
        const cellH = plotH / 24;
        const range = maxVal - minVal || 1;

        // Draw cells
        for (let h = 0; h < 24; h++) {
            for (let d = 0; d < days.length; d++) {
                const key = `${h}-${d}`;
                const val = grid[key];
                const x = marginLeft + d * cellW;
                const y = marginTop + (23 - h) * cellH; // 0 at bottom, 23 at top

                if (val !== undefined && val !== null) {
                    const ratio = (val - minVal) / range;
                    ctx.fillStyle = viridisColor(ratio);
                } else {
                    ctx.fillStyle = 'rgba(15, 10, 26, 1)';
                }
                ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
            }
        }

        // Y-axis labels (Hour)
        ctx.fillStyle = '#a0a0b8';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let h = 0; h <= 23; h += 2) {
            const y = marginTop + (23 - h) * cellH + cellH / 2;
            ctx.fillText(h.toString(), marginLeft - 8, y);
        }

        // Y-axis title
        ctx.save();
        ctx.fillStyle = '#c0c0d8';
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.translate(14, marginTop + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('Hour', 0, 0);
        ctx.restore();

        // X-axis labels (Date) rotated
        ctx.save();
        ctx.fillStyle = '#a0a0b8';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const labelStep = Math.max(1, Math.floor(days.length / 20));
        for (let d = 0; d < days.length; d += labelStep) {
            const x = marginLeft + d * cellW + cellW / 2;
            const y = marginTop + plotH + 8;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-Math.PI / 4);
            ctx.fillText(days[d].label, 0, 0);
            ctx.restore();
        }
        ctx.restore();

        // X-axis title
        ctx.fillStyle = '#c0c0d8';
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Date', marginLeft + plotW / 2, canvas.clientHeight - 8);
    }, [grid, days, hours, minVal, maxVal]);

    useEffect(() => {
        drawHeatmap();
        const handleResize = () => drawHeatmap();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawHeatmap]);

    // Mouse interaction for tooltip
    const handleMouseMove = (e) => {
        const canvas = canvasRef.current;
        if (!canvas || days.length === 0) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const marginLeft = 50;
        const marginBottom = 70;
        const marginTop = 10;
        const marginRight = 10;
        const plotW = canvas.clientWidth - marginLeft - marginRight;
        const plotH = canvas.clientHeight - marginTop - marginBottom;

        const cellW = plotW / days.length;
        const cellH = plotH / 24;

        const dayIdx = Math.floor((x - marginLeft) / cellW);
        const hourIdx = 23 - Math.floor((y - marginTop) / cellH);

        if (dayIdx >= 0 && dayIdx < days.length && hourIdx >= 0 && hourIdx < 24) {
            const key = `${hourIdx}-${dayIdx}`;
            const val = grid[key];
            setTooltip({
                x: e.clientX - rect.left + 15,
                y: e.clientY - rect.top - 10,
                text: val !== undefined ? `${days[dayIdx].label} ${hourIdx.toString().padStart(2, '0')}:00 — ${val}${unitLabel}` : `${days[dayIdx].label} ${hourIdx.toString().padStart(2, '0')}:00 — No data`,
            });
        } else {
            setTooltip(null);
        }
    };

    // Generate color bar ticks
    const colorBarTicks = useMemo(() => {
        const count = 6;
        return Array.from({ length: count + 1 }, (_, i) => {
            const ratio = i / count;
            return {
                value: Math.round(minVal + ratio * (maxVal - minVal)),
                ratio,
            };
        });
    }, [minVal, maxVal]);

    // Save as PNG
    const handleSavePNG = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = `${title.replace(/\s+/g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    const metricOptions = [
        { value: 'temp', label: 'Temperature' },
        { value: 'solarradiation', label: 'Solar' },
        { value: 'humidity', label: 'Humidity' },
    ];

    return (
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl">
            {/* Title */}
            <h3 className="text-white text-lg font-bold tracking-tight mb-4">{title}</h3>

            <div className="flex gap-4">
                {/* Canvas + Color Bar */}
                <div className="flex flex-1 gap-2">
                    {/* Main Canvas */}
                    <div className="flex-1 relative" style={{ minHeight: 420 }}>
                        <canvas
                            ref={canvasRef}
                            className="w-full h-full rounded-lg"
                            style={{ display: 'block', minHeight: 420 }}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={() => setTooltip(null)}
                        />
                        {/* Tooltip */}
                        {tooltip && (
                            <div
                                className="absolute pointer-events-none bg-black/90 text-white text-xs px-3 py-2 rounded-lg shadow-xl border border-white/20 whitespace-nowrap z-50"
                                style={{ left: tooltip.x, top: tooltip.y }}
                            >
                                {tooltip.text}
                            </div>
                        )}
                    </div>

                    {/* Color Bar */}
                    <div className="flex flex-col items-center w-16 shrink-0" style={{ paddingTop: 10, paddingBottom: 70 }}>
                        <div className="flex-1 w-5 rounded-sm overflow-hidden relative" style={{ minHeight: 300 }}>
                            {Array.from({ length: 100 }, (_, i) => (
                                <div
                                    key={i}
                                    className="w-full"
                                    style={{
                                        height: '1%',
                                        backgroundColor: viridisColor(1 - i / 99),
                                    }}
                                />
                            ))}
                        </div>
                        <div className="relative w-full mt-0" style={{ height: 0 }}>
                            {colorBarTicks.map((tick, i) => (
                                <span
                                    key={i}
                                    className="absolute text-white/60 text-xs"
                                    style={{
                                        right: 0,
                                        bottom: `calc(${tick.ratio * 100}% + 70px)`,
                                        transform: 'translateY(50%)',
                                        fontSize: 10,
                                    }}
                                >
                                    {tick.value}
                                </span>
                            ))}
                        </div>
                        <span className="text-white/50 text-xs mt-2 text-center leading-tight">{unitLabel}</span>
                    </div>
                </div>

                {/* Control Panel */}
                <div className="w-56 shrink-0 bg-white/10 rounded-2xl p-4 border border-white/10 space-y-4 self-start">
                    <h4 className="text-white/80 text-sm font-bold uppercase tracking-wider">Control Panel</h4>

                    {/* Metric Selector */}
                    <div>
                        <label className="text-white/50 text-xs mb-1 block">Metric:</label>
                        <select
                            value={metric}
                            onChange={(e) => setMetric(e.target.value)}
                            className="w-full bg-white/10 border border-white/20 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                            {metricOptions.map(opt => (
                                <option key={opt.value} value={opt.value} className="bg-slate-800">{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Plot Type */}
                    <div>
                        <label className="text-white/50 text-xs mb-1 block">Plot:</label>
                        <div className="bg-white/10 border border-white/20 rounded-lg p-1">
                            <div className="text-indigo-300 text-sm px-2 py-1.5 bg-indigo-500/30 rounded font-medium">
                                Diurnal heatmap
                            </div>
                        </div>
                    </div>

                    {/* Draw / Refresh */}
                    <button
                        onClick={drawHeatmap}
                        className="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                    >
                        Draw / Refresh
                    </button>

                    {/* Save PNG */}
                    <button
                        onClick={handleSavePNG}
                        className="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                    >
                        Save PNG
                    </button>

                    {/* Stats */}
                    <div className="border-t border-white/10 pt-3 space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-white/40">Readings:</span>
                            <span className="text-white/70 font-medium">{filledCells}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-white/40">Days:</span>
                            <span className="text-white/70 font-medium">{days.length}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-white/40">Range:</span>
                            <span className="text-white/70 font-medium">{Math.round(minVal)} – {Math.round(maxVal)} {unitLabel}</span>
                        </div>
                    </div>

                    {/* Health Index Info */}
                    {metric === 'temp' && (
                        <div className="border-t border-white/10 pt-3">
                            <p className="text-white/40 text-xs leading-relaxed">
                                <strong className="text-white/60">Heat Index (°C):</strong> &lt;27 OK, 27-32 Caution, 32-41 Extreme Caution, 41-54 Danger, &gt;54 Extreme
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
