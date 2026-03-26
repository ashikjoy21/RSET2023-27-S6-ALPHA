const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = 'https://rt.ambientweather.net/v1';

const getDevices = async () => {
    const apiKey = process.env.AMBIENT_WEATHER_API_KEY;
    const applicationKey = process.env.AMBIENT_WEATHER_APPLICATION_KEY;

    if (!apiKey || !applicationKey) {
        throw new Error('Missing Ambient Weather API Key or Application Key');
    }

    try {
        const response = await axios.get(`${BASE_URL}/devices`, {
            params: {
                apiKey,
                applicationKey
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching devices:', error.response ? error.response.data : error.message);
        throw error;
    }
};

const getDeviceData = async (macAddress, limit = 288, endDate) => {
    const apiKey = process.env.AMBIENT_WEATHER_API_KEY;
    const applicationKey = process.env.AMBIENT_WEATHER_APPLICATION_KEY;

    if (!apiKey || !applicationKey) {
        throw new Error('Missing Ambient Weather API Key or Application Key');
    }

    try {
        const params = {
            apiKey,
            applicationKey,
            limit
        };
        if (endDate) {
            params.endDate = endDate;
        }

        const response = await axios.get(`${BASE_URL}/devices/${macAddress}`, {
            params
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching data for device ${macAddress}:`, error.response ? error.response.data : error.message);
        throw error;
    }
};

module.exports = {
    getDevices,
    getDeviceData
};
