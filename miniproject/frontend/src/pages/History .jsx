import { useState, useEffect } from 'react';
import { Calendar, Loader, RefreshCw, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export function History() {
  const [chartData, setChartData] = useState([]);
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHistoryData();
  }, []);

  async function fetchHistoryData() {
    try {
      setLoading(true);
      setError(null);

      // Fetch 8 days to ensure we get 7 complete days before today
      const res = await fetch('http://localhost:3000/api/weather/history?days=8&resolution=daily');
      if (!res.ok) throw new Error('Failed to fetch history');
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        // Filter out today and keep only the last 7 days before today
        const filteredData = data
          .filter(d => d.isoDate !== today)
          .slice(-7); // Take last 7 days

        if (filteredData.length === 0) {
          setError('No historical data available (excluding today)');
          return;
        }

        setRecords(filteredData);
        setChartData([...filteredData].reverse());

        // Calculate stats from filtered data
        const temps = filteredData.map(d => d.temp).filter(t => t !== null);
        const humidities = filteredData.map(d => d.humidity).filter(h => h !== null);
        const winds = filteredData.map(d => d.wind).filter(w => w !== null);
        const rainfall = filteredData.reduce((sum, d) => sum + parseFloat(d.rainfall || 0), 0);

        setStats({
          avgTemp: temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : 'N/A',
          avgHumidity: humidities.length ? Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length) : 'N/A',
          avgWind: winds.length ? (winds.reduce((a, b) => a + b, 0) / winds.length).toFixed(1) : 'N/A',
          totalRainfall: rainfall.toFixed(1)
        });
      } else {
        setError('No history data available in database');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center p-12">
        <Loader className="w-8 h-8 text-white/50 animate-spin" />
        <span className="text-white/50 ml-3">Loading history...</span>
      </div>
    );
  }

  if (error || records.length === 0) {
    return (
      <div className="max-w-6xl mx-auto flex flex-col items-center justify-center p-12 gap-4">
        <AlertCircle className="w-10 h-10 text-yellow-400" />
        <span className="text-white/70 text-center">{error || 'No history data available'}</span>
        <button onClick={fetchHistoryData} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  const monthlyStats = stats ? [
    { metric: 'Avg Temperature', value: `${stats.avgTemp}°C`, icon: '🌡️' },
    { metric: 'Avg Humidity', value: `${stats.avgHumidity}%`, icon: '💧' },
    { metric: 'Total Rainfall', value: `${stats.totalRainfall}mm`, icon: '🌧️' },
    { metric: 'Avg Wind Speed', value: `${stats.avgWind}mph`, icon: '💨' },
  ] : [];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-white mb-2">Weather History</h2>
          <p className="text-white/80">Previous 7 days (excluding today)</p>
        </div>
        <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
          <Calendar className="w-5 h-5 text-white" />
          <span className="text-white">{records.length} Day{records.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {monthlyStats.map((stat, index) => (
            <div key={index} className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-white/10">
              <p className="text-white/70 mb-2">{stat.metric}</p>
              <div className="flex items-end justify-between">
                <p className="text-white text-3xl">{stat.value}</p>
                <span className="text-2xl">{stat.icon}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {chartData.length > 0 && (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-white/10">
          <h3 className="text-white mb-6">Temperature & Humidity</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.7)" tick={{ fontSize: 12 }} />
              <YAxis stroke="rgba(255,255,255,0.7)" />
              <Tooltip contentStyle={{ backgroundColor: 'rgba(30, 58, 138, 0.9)', border: 'none', borderRadius: '8px', color: 'white' }} />
              <Legend />
              <Line type="monotone" dataKey="temp" stroke="#fbbf24" strokeWidth={3} name="Temp (°C)" dot={{ fill: '#fbbf24', r: 5 }} />
              <Line type="monotone" dataKey="humidity" stroke="#60a5fa" strokeWidth={3} name="Humidity (%)" dot={{ fill: '#60a5fa', r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {records.length > 0 && (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-white/10">
          <h3 className="text-white mb-6">Daily Records</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left text-white/70 pb-3 pr-4">Day</th>
                  <th className="text-left text-white/70 pb-3 pr-4">Temp</th>
                  <th className="text-left text-white/70 pb-3 pr-4">Humidity</th>
                  <th className="text-left text-white/70 pb-3 pr-4">Pressure</th>
                  <th className="text-left text-white/70 pb-3 pr-4">Wind</th>
                  <th className="text-left text-white/70 pb-3">Rain</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => (
                  <tr key={index} className="border-b border-white/10">
                    <td className="py-4 pr-4">
                      <div className="text-white font-medium">{record.date}</div>
                    </td>
                    <td className="py-4 pr-4 text-white text-lg">{record.temp}°C</td>
                    <td className="py-4 pr-4 text-white">{record.humidity}%</td>
                    <td className="py-4 pr-4 text-white">{record.pressure}hPa</td>
                    <td className="py-4 pr-4 text-white">{record.wind}mph</td>
                    <td className="py-4 text-white">{record.rainfall}mm</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
