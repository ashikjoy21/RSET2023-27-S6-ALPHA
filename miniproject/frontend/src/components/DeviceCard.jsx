import './DeviceCard.css';

function DeviceCard({ device }) {
    const info = device.info || {};
    const lastData = device.lastData || {};

    // Convert Fahrenheit to Celsius
    const tempC = lastData.tempf !== undefined
        ? ((lastData.tempf - 32) * 5 / 9).toFixed(1)
        : null;

    // Format the date
    const formattedDate = lastData.date
        ? new Date(lastData.date).toLocaleString()
        : '--';

    return (
        <div className="device-card">
            <div className="card-header">
                <h2 className="device-name">{info.name || 'Unknown Device'}</h2>
                <span className="device-mac">{device.macAddress || ''}</span>
            </div>

            <div className="weather-grid">
                <div className="weather-item">
                    <span className="label">Temp</span>
                    <span className="value temp">{tempC !== null ? `${tempC}°C` : '--'}</span>
                </div>
                <div className="weather-item">
                    <span className="label">Humidity</span>
                    <span className="value humidity">{lastData.humidity !== undefined ? `${lastData.humidity}%` : '--'}</span>
                </div>
                <div className="weather-item">
                    <span className="label">Wind</span>
                    <span className="value wind">{lastData.windspeedmph !== undefined ? `${lastData.windspeedmph} mph` : '--'}</span>
                </div>
                <div className="weather-item">
                    <span className="label">Rain</span>
                    <span className="value rain">{lastData.dailyrainin !== undefined ? `${lastData.dailyrainin}"` : '--'}</span>
                </div>
            </div>

            <div className="last-updated">
                Updated: <span className="time">{formattedDate}</span>
            </div>
        </div>
    );
}

export default DeviceCard;
