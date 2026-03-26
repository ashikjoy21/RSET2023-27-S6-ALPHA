document.addEventListener('DOMContentLoaded', () => {
    fetchDevices();
});

async function fetchDevices() {
    const container = document.getElementById('device-container');

    try {
        const response = await fetch('/api/weather');
        if (!response.ok) {
            throw new Error('Failed to fetch devices');
        }

        const devices = await response.json();
        container.innerHTML = ''; // Clear loading state

        if (devices.length === 0) {
            container.innerHTML = '<div class="loading">No devices found.</div>';
            return;
        }

        devices.forEach(device => {
            const card = createDeviceCard(device);
            container.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        container.innerHTML = `<div class="loading" style="color: #ef4444;">Error loading data: ${error.message}</div>`;
    }
}

function createDeviceCard(device) {
    const template = document.getElementById('device-card-template');
    const clone = template.content.cloneNode(true);

    const info = device.info || {};
    const lastData = device.lastData || {};

    clone.querySelector('.device-name').textContent = info.name || 'Unknown Device';
    clone.querySelector('.device-mac').textContent = device.macAddress || '';

    // Format data
    // Assuming 'tempf' is Temperature F, 'humidity' is Humidity %, 'windspeedmph' is Wind Speed, 'dailyrainin' is Rain
    // You might need to adjust these keys based on actual API response
    const tempC = lastData.tempf !== undefined ? ((lastData.tempf - 32) * 5 / 9).toFixed(1) : undefined;
    clone.querySelector('.temp').textContent = tempC !== undefined ? `${tempC}°C` : '--';
    clone.querySelector('.humidity').textContent = lastData.humidity !== undefined ? `${lastData.humidity}%` : '--';
    clone.querySelector('.wind').textContent = lastData.windspeedmph !== undefined ? `${lastData.windspeedmph} mph` : '--';
    clone.querySelector('.rain').textContent = lastData.dailyrainin !== undefined ? `${lastData.dailyrainin}"` : '--';

    // Format time
    if (lastData.date) {
        const date = new Date(lastData.date);
        clone.querySelector('.time').textContent = date.toLocaleString();
    }

    return clone;
}
