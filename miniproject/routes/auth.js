const express = require('express');
const router = express.Router();
const User = require('../models/User');

// POST /api/auth/signup
// Creates a new user account with hashed password
router.post('/signup', async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;

        // --- Basic field validation ---
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }
        if (confirmPassword && password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }

        // --- Check for duplicate email or username ---
        const existingEmail = await User.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        }
        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            return res.status(409).json({ success: false, message: 'This username is already taken.' });
        }

        // --- Create and save user (password hashed automatically via pre-save hook) ---
        const user = new User({ username, email, password });
        await user.save();

        res.status(201).json({
            success: true,
            message: 'Account created successfully! Please sign in.',
            user: { username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('Signup error:', error);
        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            const msg = Object.values(error.errors).map(e => e.message).join(', ');
            return res.status(400).json({ success: false, message: msg });
        }
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});

// POST /api/auth/login
// Validates user credentials and returns user info on success
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // --- Basic field validation ---
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        // --- Find user by email ---
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ success: false, message: 'No account found with this email.' });
        }

        // --- Compare password hash ---
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
        }

        res.json({
            success: true,
            message: 'Login successful!',
            user: { username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});

module.exports = router;
