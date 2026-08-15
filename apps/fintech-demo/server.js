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
            <title>Fintech Demo App - IBM Open Banking</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #f4f4f4;
                    min-height: 100vh;
                    padding: 2rem;
                    font-size: 14px;
                    line-height: 1.5;
                    color: #161616;
                }
                .container {
                    max-width: 672px;
                    margin: 0 auto;
                    background: white;
                    padding: 2rem;
                    border: 1px solid #e0e0e0;
                }
                .header {
                    background: #0f62fe;
                    color: white;
                    padding: 2rem;
                    margin: -2rem -2rem 2rem -2rem;
                    border-bottom: 1px solid #0353e9;
                }
                h1 {
                    font-size: 1.75rem;
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                    letter-spacing: -0.02em;
                }
                .tagline {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.9);
                }
                h2 {
                    font-size: 1.25rem;
                    font-weight: 600;
                    margin: 1.5rem 0 1rem;
                    color: #161616;
                }
                p {
                    margin-bottom: 1rem;
                    color: #525252;
                }
                ul {
                    margin: 1rem 0 2rem 1.5rem;
                    color: #525252;
                }
                li {
                    margin-bottom: 0.5rem;
                }
                button {
                    background: #0f62fe;
                    color: white;
                    padding: 0.875rem 1rem;
                    border: none;
                    cursor: pointer;
                    font-size: 14px;
                    font-family: 'IBM Plex Sans', sans-serif;
                    font-weight: 400;
                    transition: background 0.11s cubic-bezier(0.2, 0, 0.38, 0.9);
                    min-height: 48px;
                    width: 100%;
                }
                button:hover {
                    background: #0353e9;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Fintech Demo Application</h1>
                    <p class="tagline">Third-party application requesting access to banking data</p>
                </div>
                <p>This is a demo third-party fintech application that requests access to customer banking data through Open Banking APIs.</p>
                <h2>Features</h2>
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
            <!DOCTYPE html>
            <html>
            <head>
                <title>Authorization Failed</title>
                <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'IBM Plex Sans', sans-serif; background: #f4f4f4; padding: 2rem; }
                    .container { max-width: 672px; margin: 0 auto; background: white; padding: 2rem; border: 1px solid #e0e0e0; }
                    h1 { color: #da1e28; font-size: 1.75rem; font-weight: 600; margin-bottom: 1rem; }
                    p { color: #525252; margin-bottom: 1.5rem; }
                    a { color: #0f62fe; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Authorization Failed</h1>
                    <p>Error: ${error}</p>
                    <a href="/">Try Again</a>
                </div>
            </body>
            </html>
        `);
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authorization Successful</title>
            <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'IBM Plex Sans', sans-serif; background: #f4f4f4; padding: 2rem; }
                .container { max-width: 672px; margin: 0 auto; background: white; padding: 2rem; border: 1px solid #e0e0e0; }
                h1 { color: #24a148; font-size: 1.75rem; font-weight: 600; margin-bottom: 1rem; }
                p { color: #525252; margin-bottom: 1rem; }
                code { background: #f4f4f4; padding: 0.25rem 0.5rem; font-family: 'IBM Plex Mono', monospace; }
                a { display: inline-block; margin-top: 1.5rem; color: #0f62fe; text-decoration: none; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Authorization Successful</h1>
                <p>Authorization code received: <code>${code}</code></p>
                <p>State: <code>${state}</code></p>
                <p>In a real application, this code would be exchanged for an access token.</p>
                <a href="/">Back to Home</a>
            </div>
        </body>
        </html>
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
