/**
 * Customer Consent Application Server
 * Handles customer authentication and consent management
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.CONSENT_APP_PORT || 3001;

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

// Serve consent page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'consent.html'));
});

app.get('/consent', (req, res) => {
    res.sendFile(path.join(__dirname, 'consent.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'customer-consent' });
});

// Authentication login page
app.get('/auth/login', (req, res) => {
    const returnUrl = req.query.return_url || '/';
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Login - Open Banking</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0;
                    padding: 20px;
                }
                .login-container {
                    background: white;
                    padding: 40px;
                    border-radius: 12px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-width: 400px;
                    width: 100%;
                }
                h1 { color: #333; margin-bottom: 30px; }
                .form-group {
                    margin-bottom: 20px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    color: #555;
                    font-weight: 500;
                }
                input {
                    width: 100%;
                    padding: 12px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 14px;
                }
                button {
                    width: 100%;
                    padding: 14px;
                    background: #667eea;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                }
                button:hover { background: #5568d3; }
                .demo-note {
                    margin-top: 20px;
                    padding: 15px;
                    background: #f0f0f0;
                    border-radius: 6px;
                    font-size: 13px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <h1>🏦 Bank Login</h1>
                <form action="/auth/login" method="POST">
                    <input type="hidden" name="return_url" value="${returnUrl}">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" name="username" value="demo_user" required>
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" name="password" value="password123" required>
                    </div>
                    <button type="submit">Login</button>
                </form>
                <div class="demo-note">
                    <strong>Demo Credentials:</strong><br>
                    Username: demo_user<br>
                    Password: password123
                </div>
            </div>
        </body>
        </html>
    `);
});

// Authentication login handler
app.post('/auth/login', (req, res) => {
    const { username, password, return_url } = req.body;
    
    // Simple demo authentication
    if (username === 'demo_user' && password === 'password123') {
        // In a real app, set session/cookie here
        res.redirect(return_url || '/');
    } else {
        res.redirect('/auth/login?error=invalid_credentials');
    }
});

// OAuth authorization endpoint - shows consent screen
app.get('/oauth/authorize', (req, res) => {
    const { client_id, redirect_uri, response_type, scope, state } = req.query;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authorize Application</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0;
                    padding: 20px;
                }
                .consent-container {
                    background: white;
                    padding: 40px;
                    border-radius: 12px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-width: 500px;
                    width: 100%;
                }
                h1 { color: #333; margin-bottom: 10px; }
                .app-name { color: #667eea; font-weight: bold; }
                .scopes {
                    background: #f5f5f5;
                    padding: 20px;
                    border-radius: 8px;
                    margin: 20px 0;
                }
                .scope-item {
                    padding: 10px 0;
                    border-bottom: 1px solid #ddd;
                }
                .scope-item:last-child { border-bottom: none; }
                .buttons {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }
                button {
                    flex: 1;
                    padding: 14px;
                    border: none;
                    border-radius: 6px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                }
                .approve {
                    background: #667eea;
                    color: white;
                }
                .approve:hover { background: #5568d3; }
                .deny {
                    background: #e0e0e0;
                    color: #333;
                }
                .deny:hover { background: #d0d0d0; }
            </style>
        </head>
        <body>
            <div class="consent-container">
                <h1>🔐 Authorization Request</h1>
                <p><span class="app-name">${client_id}</span> wants to access your banking data</p>
                
                <div class="scopes">
                    <h3>Requested Permissions:</h3>
                    ${(scope || '').split(' ').map(s => `
                        <div class="scope-item">
                            ✓ ${s.replace(':', ' - ').replace('read', 'Read').replace('write', 'Write')}
                        </div>
                    `).join('')}
                </div>
                
                <div class="buttons">
                    <button class="deny" onclick="deny()">Deny</button>
                    <button class="approve" onclick="approve()">Approve</button>
                </div>
                
                <script>
                    function approve() {
                        const code = 'demo_auth_code_' + Math.random().toString(36).substring(7);
                        const redirectUrl = '${redirect_uri}?code=' + code + '&state=${state}';
                        window.location.href = redirectUrl;
                    }
                    
                    function deny() {
                        const redirectUrl = '${redirect_uri}?error=access_denied&state=${state}';
                        window.location.href = redirectUrl;
                    }
                </script>
            </div>
        </body>
        </html>
    `);
});

// OAuth token endpoint
app.post('/oauth/token', (req, res) => {
    const { grant_type, code, redirect_uri, client_id } = req.body;
    
    // Simple demo token generation
    if (grant_type === 'authorization_code' && code) {
        res.json({
            access_token: 'demo_access_token_' + Math.random().toString(36).substring(7),
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'accounts:read transactions:read'
        });
    } else {
        res.status(400).json({
            error: 'invalid_request',
            error_description: 'Invalid grant type or missing code'
        });
    }
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
        console.log(`Customer Consent App running on http://localhost:${PORT}`);
    });
}

module.exports = app;

// Made with Bob
