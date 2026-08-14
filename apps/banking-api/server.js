/**
 * Banking API Server
 * Main server file for the banking API
 */

const express = require('express');
const app = express();
const PORT = process.env.BANKING_API_PORT || 3002;

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

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'banking-api' });
});

// Mock accounts endpoint
app.get('/api/v1/accounts', (req, res) => {
    res.json({
        accounts: [
            {
                account_id: '1',
                account_number: '****1234',
                account_type: 'checking',
                currency: 'USD',
                balance: 5000.00,
                status: 'active'
            },
            {
                account_id: '2',
                account_number: '****5678',
                account_type: 'savings',
                currency: 'USD',
                balance: 15000.00,
                status: 'active'
            }
        ]
    });
});

// Mock transactions endpoint
app.get('/api/v1/accounts/:accountId/transactions', (req, res) => {
    res.json({
        transactions: [
            {
                transaction_id: '1',
                date: '2026-08-14',
                description: 'Coffee Shop',
                amount: -4.50,
                balance: 5000.00
            },
            {
                transaction_id: '2',
                date: '2026-08-13',
                description: 'Salary Deposit',
                amount: 3000.00,
                balance: 5004.50
            }
        ]
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'Banking API',
        version: '1.0.0',
        endpoints: {
            accounts: '/api/v1/accounts',
            transactions: '/api/v1/accounts/:accountId/transactions',
            health: '/health'
        }
    });
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
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Banking API running on http://localhost:${PORT}`);
        console.log(`Accounts endpoint: http://localhost:${PORT}/api/v1/accounts`);
    });
}

module.exports = app;

// Made with Bob
