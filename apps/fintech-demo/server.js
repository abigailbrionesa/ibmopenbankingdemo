/**
 * Fintech Demo Application Server
 * Demonstrates OAuth flow and API consumption
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.FINTECH_APP_PORT || 3000;

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

// Serve static files
app.use(express.static(__dirname));

// Home page
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Fintech Demo App</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 800px;
                    margin: 50px auto;
                    padding: 20px;
                }
                .container {
                    background: #f5f5f5;
                    padding: 30px;
                    border-radius: 8px;
                }
                h1 { color: #333; }
                button {
                    background: #007bff;
                    color: white;
                    padding: 12px 24px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 16px;
                }
                button:hover { background: #0056b3; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🏦 Fintech Demo Application</h1>
                <p>This is a demo third-party fintech application that requests access to customer banking data through Open Banking APIs.</p>
                <h2>Features:</h2>
                <ul>
                    <li>OAuth 2.0 Authorization Flow</li>
                    <li>Customer Consent Management</li>
                    <li>Secure API Access</li>
                    <li>Account Information Retrieval</li>
                </ul>
                <button onclick="startAuth()">Connect Your Bank Account</button>
                <script>
                    function startAuth() {
                        const authUrl = '${process.env.OAUTH_AUTHORIZATION_ENDPOINT || 'http://localhost:8080/oauth/authorize'}';
                        const params = new URLSearchParams({
                            client_id: '${process.env.OAUTH_CLIENT_ID || 'fintech-demo-client'}',
                            redirect_uri: '${process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/callback'}',
                            response_type: 'code',
                            scope: 'accounts:read transactions:read',
                            state: Math.random().toString(36).substring(7)
                        });
                        window.location.href = authUrl + '?' + params.toString();
                    }
                </script>
            </div>
        </body>
        </html>
    `);
});

// OAuth callback
app.get('/callback', (req, res) => {
    const { code, state, error } = req.query;
    
    if (error) {
        return res.send(`
            <h1>Authorization Failed</h1>
            <p>Error: ${error}</p>
            <a href="/">Try Again</a>
        `);
    }
    
    res.send(`
        <h1>Authorization Successful!</h1>
        <p>Authorization code received: ${code}</p>
        <p>State: ${state}</p>
        <p>In a real application, this code would be exchanged for an access token.</p>
        <a href="/">Back to Home</a>
    `);
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'fintech-demo' });
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
        console.log(`Fintech Demo App running on http://localhost:${PORT}`);
    });
}

module.exports = app;

// Made with Bob
