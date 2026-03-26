import { useState, useEffect } from 'react';
import { Cloud, CloudRain, Sun, CloudDrizzle, Loader, RefreshCw } from 'lucide-react';

// Retry function for robust API calls
async function fetchWithRetry(url, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new Error('Failed after retries');
}

export function HourlyForecast() {
  const [hourlyData, setHourlyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHourlyData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchHourlyData, 300000);
    return () => clearInterval(interval);
  }, []);

  async function fetchHourlyData() {
    try {
      setLoading(true);
      setError(null);

      // Get device with retry
      const devicesRes = await fetchWithRetry('http://localhost:3000/api/weather');
      const devices = await devicesRes.json();

      if (devices && devices.length > 0) {
        const macAddress = encodeURIComponent(devices[0].macAddress);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

        // Fetch last 7 hours of data with retry
        const historyRes = await fetchWithRetry(`http://localhost:3000/api/weather/${macAddress}?limit=84`);
        const history = await historyRes.json();

        if (Array.isArray(history) && history.length > 0) {
          // Filter to get one reading per hour (every 12th record since data is every 5 mins)
          const hourlyFiltered = history.filter((_, index) => index % 12 === 0);

          const formattedData = hourlyFiltered.map(record => {
            const date = new Date(record.date);
            const tempC = record.tempf !== undefined
              ? Math.round((record.tempf - 32) * 5 / 9)
              : null;

            // Determine icon based on conditions
            let icon = 'cloud';
            if (record.solarradiation > 200) icon = 'sun';
            else if (record.hourlyrainin > 0.1) icon = 'rain';
            else if (record.hourlyrainin > 0) icon = 'drizzle';
            else if (record.humidity > 85) icon = 'drizzle';

            return {
              time: date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                hour12: true
              }),
              temp: tempC,
              icon: icon,
              humidity: record.humidity
            };
          });

          setHourlyData(formattedData);
        }
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching hourly data:', err);
    } finally {
      setLoading(false);
    }
  }

  const getIcon = (iconType) => {
    switch (iconType) {
      case 'sun':
        return <Sun className="w-8 h-8 text-yellow-300" />;
      case 'rain':
        return <CloudRain className="w-8 h-8 text-blue-300" />;
      case 'drizzle':
        return <CloudDrizzle className="w-8 h-8 text-blue-200" />;
      default:
        return <Cloud className="w-8 h-8 text-white/80" />;
    }
  };

  if (loading && hourlyData.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <h2 className="text-white mb-4 ml-2">Hourly History</h2>
        <div className="flex items-center justify-center p-8">
          <Loader className="w-6 h-6 text-white/50 animate-spin" />
          <span className="text-white/50 ml-2">Loading hourly data...</span>
        </div>
      </div>
    );
  }

  if (hourlyData.length === 0 && !loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <h2 className="text-white mb-4 ml-2">Hourly History</h2>
        <div className="flex items-center justify-center p-8 gap-3">
          <span className="text-white/50">No hourly data available</span>
          <button
            onClick={fetchHourlyData}
            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-white mb-4 ml-2">Hourly History</h2>
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        {hourlyData.map((hour, index) => (
          <div
            key={index}
            className="flex-shrink-0 w-32 bg-white/5 backdrop-blur-xl rounded-2xl p-4 shadow-lg border border-white/10 hover:bg-white/10 transition-all"
          >
            <p className="text-purple-300 text-sm mb-3 text-center">{hour.time}</p>
            <div className="flex items-center justify-center mb-3">
              {getIcon(hour.icon)}
            </div>
            <p className="text-white text-center text-xl font-medium">
              {hour.temp}°
            </p>
            <p className="text-white/50 text-xs text-center mt-1">
              {hour.humidity}% humidity
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
