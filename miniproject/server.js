const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const weatherRoutes = require('./routes/weather');
// Auth routes for login/signup (uses models/User.js + bcryptjs)
const authRoutes = require('./routes/auth');

const mongoose = require('mongoose');
const dbSync = require('./utils/db-sync');

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB');

        // Backfill any missing days first
        await dbSync.backfillMissingDays();

        // Then run a current sync
        dbSync.syncAllDevices();

        // Start the hourly sync
        // 3600000 ms = 1 hour
        setInterval(() => {
            dbSync.syncAllDevices();
        }, 3600000);
    })
    .catch(err => console.error('MongoDB connection error:', err));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/weather', weatherRoutes);
// Auth routes: POST /api/auth/signup and POST /api/auth/login
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
    res.send('Ambient Weather API Backend is running');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
