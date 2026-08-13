/**
 * Developer Portal Server
 * Serves the developer portal frontend and API endpoints
 */

const express = require('express');
const path = require('path');
const portalAPI = require('./portal-api');

const app = express();
const PORT = process.env.PORTAL_PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// API routes
app.use('/portal/api', portalAPI);

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'developer-portal' });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'server_error',
        error_description: 'An unexpected error occurred'
    });
});

// Start server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Developer Portal running on http://localhost:${PORT}`);
        console.log(`API Catalog: http://localhost:${PORT}/portal/api/catalog`);
    });
}

module.exports = app;

// Made with Bob