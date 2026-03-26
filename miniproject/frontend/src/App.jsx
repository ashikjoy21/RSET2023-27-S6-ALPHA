import { useState, useEffect } from 'react';
import DeviceCard from './components/DeviceCard';
import './App.css';

function App() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDevices();
  }, []);

  async function fetchDevices() {
    try {
      setLoading(true);
      const response = await fetch('/api/weather');
      if (!response.ok) {
        throw new Error('Failed to fetch devices');
      }
      const data = await response.json();
      setDevices(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <div className="background-glob"></div>
      <div className="container">
        <header>
          <h1>Ambient Weather API</h1>
          <p>Real-time Weather Station Data</p>
        </header>

        <main id="device-container">
          {loading && <div className="loading">Loading devices...</div>}
          {error && <div className="loading error">Error loading data: {error}</div>}
          {!loading && !error && devices.length === 0 && (
            <div className="loading">No devices found.</div>
          )}
          {!loading && !error && devices.map((device, index) => (
            <DeviceCard key={device.macAddress || index} device={device} />
          ))}
        </main>
      </div>
    </div>
  );
}

export default App;
