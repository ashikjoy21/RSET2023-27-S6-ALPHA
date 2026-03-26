import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CloudRain, Wind, Thermometer, Bell, Clock, MapPin, CheckCircle, Sun, Gauge, Droplets, RefreshCw, Activity, Loader2 } from 'lucide-react';

export function Alert() {
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [pastAlerts, setPastAlerts] = useState([]);
  const [conditions, setConditions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('http://localhost:3000/api/weather/alerts');
      if (!res.ok) throw new Error('Failed to fetch alerts');
      const data = await res.json();

      if (data.success) {
        setActiveAlerts(data.activeAlerts || []);
        setPastAlerts(data.pastAlerts || []);
        setConditions(data.conditions || null);
        setLastFetched(new Date());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high':
        return 'from-red-500/30 to-red-900/20';
      case 'medium':
        return 'from-orange-500/30 to-orange-900/20';
      case 'low':
        return 'from-yellow-500/30 to-yellow-900/20';
      default:
        return 'from-white/10 to-white/5';
    }
  };

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'high':
        return 'bg-red-900/50 text-red-100';
      case 'medium':
        return 'bg-orange-900/50 text-orange-100';
      case 'low':
        return 'bg-yellow-900/50 text-yellow-100';
      default:
        return 'bg-white/20 text-white';
    }
  };

  const getIcon = (iconType) => {
    switch (iconType) {
      case 'rain':
        return <CloudRain className="w-8 h-8" />;
      case 'wind':
        return <Wind className="w-8 h-8" />;
      case 'temp':
        return <Thermometer className="w-8 h-8" />;
      case 'uv':
        return <Sun className="w-8 h-8" />;
      case 'pressure':
        return <Gauge className="w-8 h-8" />;
      case 'humidity':
        return <Droplets className="w-8 h-8" />;
      default:
        return <AlertTriangle className="w-8 h-8" />;
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex flex-col items-center justify-center py-24">
        <Loader2 className="w-10 h-10 text-white/40 animate-spin mb-4" />
        <p className="text-white/50">Analyzing weather conditions…</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-white mb-2">Weather Alerts</h2>
          <p className="text-white/80">RSET Campus — Real-time alerts from station sensors</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setLoading(true); fetchAlerts(); }}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-3 py-2 rounded-lg text-white/70 hover:text-white transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <div className={`flex items-center gap-2 backdrop-blur-sm px-4 py-2 rounded-lg ${activeAlerts.length > 0 ? 'bg-red-500/20 border border-red-500/30' : 'bg-emerald-500/20 border border-emerald-500/30'}`}>
            {activeAlerts.length > 0 ? (
              <Bell className="w-5 h-5 text-red-300" />
            ) : (
              <CheckCircle className="w-5 h-5 text-emerald-300" />
            )}
            <span className="text-white">
              {activeAlerts.length > 0
                ? `${activeAlerts.length} Active Alert${activeAlerts.length > 1 ? 's' : ''}`
                : 'All Clear'
              }
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-red-200">
          {error}
        </div>
      )}

      {/* Current Conditions Summary */}
      {conditions && (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-white/60" />
            <h3 className="text-white/80 text-sm font-medium uppercase tracking-wider">Current Conditions</h3>
            {lastFetched && (
              <span className="text-white/30 text-xs ml-auto">
                Updated {formatTime(lastFetched)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {conditions.temperature !== null && (
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-white/40 text-xs mb-1">Temperature</p>
                <p className="text-white text-lg font-bold">{conditions.temperature}°C</p>
                {conditions.heatIndex > conditions.temperature && (
                  <p className="text-orange-300 text-xs">Feels {conditions.heatIndex}°C</p>
                )}
              </div>
            )}
            {conditions.humidity !== null && (
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-white/40 text-xs mb-1">Humidity</p>
                <p className="text-white text-lg font-bold">{conditions.humidity}%</p>
              </div>
            )}
            {conditions.windSpeed !== null && (
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-white/40 text-xs mb-1">Wind</p>
                <p className="text-white text-lg font-bold">{conditions.windSpeed} km/h</p>
              </div>
            )}
            {conditions.pressure !== null && (
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-white/40 text-xs mb-1">Pressure</p>
                <p className="text-white text-lg font-bold">{conditions.pressure} hPa</p>
              </div>
            )}
            {conditions.dailyRain !== null && (
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-white/40 text-xs mb-1">Daily Rain</p>
                <p className="text-white text-lg font-bold">{conditions.dailyRain} mm</p>
              </div>
            )}
            {conditions.uvIndex !== null && (
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <p className="text-white/40 text-xs mb-1">UV Index</p>
                <p className="text-white text-lg font-bold">{conditions.uvIndex}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Alerts */}
      <div>
        <h3 className="text-white mb-4">
          {activeAlerts.length > 0 ? 'Active Alerts' : 'No Active Alerts'}
        </h3>

        {activeAlerts.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 border border-white/10 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-white/80 text-lg mb-1">All conditions are normal</p>
            <p className="text-white/40 text-sm">
              No weather alerts at this time. Monitoring {conditions?.totalReadings24h || 0} readings from the last 24h.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`bg-gradient-to-r ${getSeverityColor(alert.severity)} backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-white/10`}
              >
                <div className="flex items-start gap-4">
                  <div className="bg-white/20 rounded-full p-3 text-white">
                    {getIcon(alert.icon)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
                      <div>
                        <h4 className="text-white mb-1">{alert.title}</h4>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block px-3 py-1 rounded-full text-sm uppercase tracking-wide ${getSeverityBadge(alert.severity)}`}>
                            {alert.severity} priority
                          </span>
                          {alert.measuredValue && (
                            <span className="inline-block px-3 py-1 rounded-full text-sm bg-white/10 text-white/80">
                              {alert.measuredValue}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-white/80">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">{alert.timeAgo}</span>
                      </div>
                    </div>
                    <p className="text-white/90 mb-4">{alert.description}</p>
                    <div className="flex items-center gap-6 text-white/80 text-sm">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span>{alert.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>Detected: {formatTime(alert.time)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Alerts */}
      {pastAlerts.length > 0 && (
        <div>
          <h3 className="text-white mb-4">Recently Resolved</h3>
          <div className="space-y-3">
            {pastAlerts.map((alert) => (
              <div
                key={alert.id}
                className="bg-white/5 backdrop-blur-xl rounded-xl p-4 shadow-lg border border-white/10 opacity-80"
              >
                <div className="flex items-center gap-4">
                  <div className="text-white/60">
                    {getIcon(alert.icon)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="text-white/90">{alert.title}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-white/60 text-sm">{alert.timeAgo}</span>
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      </div>
                    </div>
                    <p className="text-white/70 text-sm mt-1">{alert.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Station Info */}
      {conditions && (
        <div className="bg-white/5 backdrop-blur-xl rounded-xl p-4 border border-white/10 text-center">
          <p className="text-white/30 text-xs">
            Monitoring {conditions.totalReadings24h} sensor readings from the last 24 hours • Alerts auto-refresh every 5 minutes
          </p>
        </div>
      )}
    </div>
  );
}
