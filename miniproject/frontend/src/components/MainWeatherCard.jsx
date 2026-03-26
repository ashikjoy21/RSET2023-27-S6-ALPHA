import React, { useState, useEffect } from "react";
import { Search, MapPin, Droplets, Eye, Gauge, Wind, CloudRain, ChevronLeft, ChevronRight, Clock, RefreshCw, Sun, Thermometer, ArrowDown } from "lucide-react";

// SearchBar Component
export function SearchBar({ searchQuery, setSearchQuery }) {
  return (
    <div className="max-w-md mx-auto mb-12">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
        <input
          type="text"
          placeholder="Search location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-full bg-white/90 backdrop-blur-sm text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white shadow-lg"
        />
      </div>
    </div>
  );
}

// Retry function for robust API calls (optimized for speed)
async function fetchWithRetry(url, retries = 1, delay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Failed after retries');
}

// MainWeatherCard Component - Fetches real-time data from API
export function MainWeatherCard() {
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = 3;

  useEffect(() => {
    fetchWeatherData();
    // Refresh data every 60 seconds
    const interval = setInterval(fetchWeatherData, 60000);
    return () => clearInterval(interval);
  }, []);

  async function fetchWeatherData() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetchWithRetry('http://localhost:3000/api/weather');
      const data = await response.json();

      if (data && data.length > 0) {
        const device = data[0];
        const lastData = device.lastData || {};

        // Convert Fahrenheit to Celsius
        const tempC = lastData.tempf !== undefined
          ? ((lastData.tempf - 32) * 5 / 9).toFixed(1)
          : null;

        // Compute dew point
        const tempCNum = lastData.tempf !== undefined ? (lastData.tempf - 32) * 5 / 9 : null;
        let dewPoint = null;
        if (tempCNum !== null && lastData.humidity !== undefined) {
          const a = 17.27, b = 237.7;
          const alpha = ((a * tempCNum) / (b + tempCNum)) + Math.log(lastData.humidity / 100);
          dewPoint = ((b * alpha) / (a - alpha)).toFixed(1);
        }

        // Compute feels-like (heat index if warm, wind chill if cold)
        let feelsLike = tempC;
        if (tempCNum !== null && tempCNum >= 27 && lastData.humidity !== undefined) {
          const T = tempCNum, R = lastData.humidity;
          const HI = -8.7847 + 1.6114 * T + 2.3385 * R
            - 0.1461 * T * R - 0.0123 * T * T
            - 0.0164 * R * R + 0.0022 * T * T * R
            + 0.0007 * T * R * R - 0.0000036 * T * T * R * R;
          feelsLike = HI.toFixed(1);
        }

        // Wind direction
        const windDirDeg = lastData.winddir;
        const windDirLabels = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const windDir = windDirDeg !== undefined ? windDirLabels[Math.round(windDirDeg / 22.5) % 16] : null;

        // Format date
        const dateStr = lastData.date
          ? new Date(lastData.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            weekday: 'long'
          })
          : '';

        setWeatherData({
          location: device.info?.name || 'Weather Station',
          temperature: tempC,
          feelsLike: feelsLike,
          date: dateStr,
          humidity: lastData.humidity,
          visibility: 8, // Not available from API, using default
          airPressure: lastData.baromrelin ? Math.round(lastData.baromrelin * 33.8639) : null,
          wind: lastData.windspeedmph,
          windGust: lastData.windgustmph,
          windDir: windDir,
          windDirDeg: windDirDeg,
          condition: lastData.solarradiation > 100 ? "Sunny" : "Partly Cloudy",
          lastUpdated: lastData.date ? new Date(lastData.date) : null,
          uv: lastData.uv,
          solarRadiation: lastData.solarradiation,
          dailyRain: lastData.dailyrainin !== undefined ? Math.round(lastData.dailyrainin * 25.4 * 10) / 10 : null,
          hourlyRain: lastData.hourlyrainin !== undefined ? Math.round(lastData.hourlyrainin * 25.4 * 100) / 100 : null,
          dewPoint: dewPoint,
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="relative max-w-2xl mx-auto mb-12">
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <p className="text-white text-center">Loading weather data...</p>
        </div>
      </div>
    );
  }

  if (error || !weatherData) {
    return (
      <div className="relative max-w-2xl mx-auto mb-12">
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <p className="text-white text-center">Error loading weather data: {error}</p>
        </div>
      </div>
    );
  }

  // Page content renderers
  const renderPage0 = () => (
    <>
      {/* Temperature and Icon */}
      <div className="flex items-center justify-center mb-6">
        <div className="flex items-center gap-8">
          <div className="flex items-start">
            <span className="text-7xl text-white">{weatherData.temperature}</span>
            <span className="text-3xl text-white mt-2">°C</span>
          </div>
          <CloudRain className="w-20 h-20 text-white/80" />
        </div>
      </div>

      {/* Date */}
      <div className="text-center mb-8">
        <p className="text-white/90 text-sm">{weatherData.date}</p>
      </div>

      {/* Weather Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-white/20">
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Droplets className="w-5 h-5 text-white/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">HUMIDITY</p>
          <p className="text-white">{weatherData.humidity}%</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Eye className="w-5 h-5 text-white/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">VISIBILITY</p>
          <p className="text-white">{weatherData.visibility}km</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Gauge className="w-5 h-5 text-white/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">AIR PRESSURE</p>
          <p className="text-white">{weatherData.airPressure}hPa</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Wind className="w-5 h-5 text-white/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">WIND</p>
          <p className="text-white">{weatherData.wind}mph</p>
        </div>
      </div>
    </>
  );

  const renderPage1 = () => (
    <>
      {/* Feels Like + Dew Point header */}
      <div className="flex items-center justify-center mb-6">
        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-white/50 text-sm mb-1">FEELS LIKE</p>
            <div className="flex items-start justify-center">
              <span className="text-6xl text-white">{weatherData.feelsLike}</span>
              <span className="text-2xl text-white mt-1">°C</span>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center mb-8">
        <p className="text-white/60 text-sm">Comfort & Environmental Details</p>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-white/20">
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Sun className="w-5 h-5 text-yellow-300/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">UV INDEX</p>
          <p className="text-white">{weatherData.uv ?? 'N/A'}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Sun className="w-5 h-5 text-orange-300/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">SOLAR</p>
          <p className="text-white">{weatherData.solarRadiation ?? 'N/A'} W/m²</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Thermometer className="w-5 h-5 text-cyan-300/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">DEW POINT</p>
          <p className="text-white">{weatherData.dewPoint ?? 'N/A'}°C</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <CloudRain className="w-5 h-5 text-blue-300/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">DAILY RAIN</p>
          <p className="text-white">{weatherData.dailyRain ?? 0} mm</p>
        </div>
      </div>
    </>
  );

  const renderPage2 = () => (
    <>
      {/* Wind compass-style display */}
      <div className="flex items-center justify-center mb-6">
        <div className="relative w-40 h-40">
          {/* Compass ring */}
          <div className="absolute inset-0 rounded-full border-2 border-white/20" />
          <div className="absolute inset-2 rounded-full border border-white/10" />
          {/* Cardinal points */}
          <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 text-white/60 text-xs font-bold">N</span>
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 text-white/60 text-xs font-bold">S</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 text-white/60 text-xs font-bold">E</span>
          <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 text-white/60 text-xs font-bold">W</span>
          {/* Direction arrow */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ transform: `rotate(${weatherData.windDirDeg ?? 0}deg)` }}
          >
            <div className="flex flex-col items-center -mt-6">
              <ArrowDown className="w-8 h-8 text-emerald-400 rotate-180" />
            </div>
          </div>
          {/* Center */}
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-white text-lg font-bold mt-6">{weatherData.windDir ?? '—'}</span>
            <span className="text-white/40 text-xs">{weatherData.windDirDeg ?? 0}°</span>
          </div>
        </div>
      </div>

      <div className="text-center mb-8">
        <p className="text-white/60 text-sm">Wind Details</p>
      </div>

      {/* Wind Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-white/20">
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Wind className="w-5 h-5 text-white/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">SPEED</p>
          <p className="text-white">{weatherData.wind} mph</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Wind className="w-5 h-5 text-red-300/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">GUST</p>
          <p className="text-white">{weatherData.windGust ?? 'N/A'} mph</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Gauge className="w-5 h-5 text-white/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">DIRECTION</p>
          <p className="text-white">{weatherData.windDir ?? '—'}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <CloudRain className="w-5 h-5 text-blue-300/80" />
          </div>
          <p className="text-white/70 text-sm mb-1">RAIN RATE</p>
          <p className="text-white">{weatherData.hourlyRain ?? 0} mm/hr</p>
        </div>
      </div>
    </>
  );

  const pages = [renderPage0, renderPage1, renderPage2];
  const pageLabels = ['Overview', 'Comfort & UV', 'Wind & Rain'];

  return (
    <div className="relative max-w-2xl mx-auto mb-12">
      {/* Left Arrow — hidden on first page */}
      {currentPage > 0 && (
        <button
          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-16 w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all hidden lg:flex cursor-pointer z-10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Right Arrow — hidden on last page */}
      {currentPage < totalPages - 1 && (
        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-16 w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-all hidden lg:flex cursor-pointer z-10"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Main Card */}
      <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
        {/* Location */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-white">
            <MapPin className="w-5 h-5" />
            <span className="text-lg">{weatherData.location}</span>
          </div>
          <span className="text-white/40 text-xs uppercase tracking-wider">{pageLabels[currentPage]}</span>
        </div>

        {/* Animated page content */}
        <div className="min-h-[280px]">
          {pages[currentPage]()}
        </div>

        {/* Page dots */}
        <div className="flex items-center justify-center gap-2 mt-4">
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === currentPage ? 'bg-white w-6' : 'bg-white/30 hover:bg-white/50'}`}
            />
          ))}
        </div>

        {/* Last Updated */}
        {weatherData.lastUpdated && (
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="text-white/50 text-xs uppercase tracking-wider">Last Updated</span>
            <span className="text-emerald-400 text-sm font-medium">
              {weatherData.lastUpdated.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              })}
            </span>
            <span className="text-white/30 text-xs">
              • {weatherData.lastUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
