# Developer Portal

A minimal developer onboarding experience for fintech applications to discover APIs, register applications, obtain credentials, and test the complete OAuth flow.

## Features

- **API Catalog**: Browse available Open Banking APIs and required scopes
- **App Registration**: Register OAuth client applications and receive credentials
- **Demo Flow**: Complete walkthrough from registration to API access
- **Secure Credentials**: Client secrets handled server-side only
- **Interactive Testing**: Test API calls with real access tokens

## Quick Start

### 1. Start the Developer Portal

```bash
cd apps/developer-portal
node server.js
```

The portal will be available at `http://localhost:3001`

### 2. Explore the API Catalog

Navigate to the "API Catalog" tab to see:
- Available APIs (Accounts, Transactions)
- API endpoints and methods
- Required OAuth scopes
- Scope descriptions

### 3. Register Your Application

In the "Register App" tab:

1. Fill in application details:
   - Application name
   - Description
   - Redirect URI (e.g., `http://localhost:3000/callback`)
   - Contact email
   - Website URL

2. Select required scopes:
   - `accounts:read` - Read account information (required)
   - `transactions:read` - Read transaction history
   - `balances:read` - Read account balances
   - `profile:read` - Read customer profile

3. Click "Register Application"

4. **Important**: Save your credentials securely
   - Client ID: Used to identify your application
   - Client Secret: Used for server-side token exchange
   - ⚠️ The client secret is shown only once

### 4. Try the Demo Flow

The "Try Demo" tab provides a complete walkthrough:

**Step 1: Save Credentials**
- Enter your Client ID and Client Secret
- Credentials are stored in memory only (never in browser storage)

**Step 2: Start Authorization**
- Click "Start Authorization Flow"
- Opens the OAuth authorization page
- Customer logs in and grants consent

**Step 3: Exchange Code for Token**
- Copy the authorization code from the callback URL
- Paste it into the form
- Click "Exchange for Token"
- Server-side exchange protects your client secret

**Step 4: Call Protected API**
- Select an API endpoint
- Click "Call API"
- View the response data

## API Endpoints

### Portal API

#### GET /portal/api/catalog
Get API catalog with available APIs and scopes.

**Response:**
```json
{
  "apis": [...],
  "scopes": [...]
}
```

#### POST /portal/api/register
Register a new OAuth client application.

**Request:**
```json
{
  "name": "My Fintech App",
  "description": "Personal finance management",
  "redirect_uris": ["http://localhost:3000/callback"],
  "requested_scopes": ["accounts:read", "transactions:read"],
  "contact_email": "dev@fintech.com",
  "website_url": "https://fintech.com"
}
```

**Response:**
```json
{
  "client_id": "client_abc123...",
  "client_secret": "secret_xyz789...",
  "name": "My Fintech App",
  "redirect_uris": ["http://localhost:3000/callback"],
  "granted_scopes": ["accounts:read", "transactions:read"],
  "created_at": "2024-01-15T10:30:00Z",
  "warning": "Store client_secret securely. It will not be shown again."
}
```

#### POST /portal/api/authorize
Start OAuth authorization flow.

**Request:**
```json
{
  "client_id": "client_abc123",
  "redirect_uri": "http://localhost:3000/callback",
  "scope": "accounts:read transactions:read",
  "state": "random_state_value"
}
```

**Response:**
```json
{
  "authorization_url": "http://localhost:3000/oauth/authorize?...",
  "instructions": "Redirect user to this URL to start authorization flow"
}
```

#### POST /portal/api/token
Exchange authorization code for access token (server-side only).

**Request:**
```json
{
  "code": "auth_code_123",
  "client_id": "client_abc123",
  "client_secret": "secret_xyz789",
  "redirect_uri": "http://localhost:3000/callback"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "refresh_token_abc...",
  "scope": "accounts:read transactions:read"
}
```

## Security

### Client Secret Handling

The portal implements secure client secret handling:

**✅ Secure Practices:**
- Client secrets are NEVER stored in browser storage (localStorage, sessionStorage, cookies)
- Secrets are only stored in memory during the demo session
- Token exchange happens server-side via `/portal/api/token`
- Secrets are cleared when the page is closed

**❌ Never Do This:**
```javascript
// DON'T: Store in localStorage
localStorage.setItem('client_secret', secret);

// DON'T: Expose in frontend code
const CLIENT_SECRET = 'hardcoded_secret';

// DON'T: Send directly to OAuth server from browser
fetch('/oauth/token', {
  body: JSON.stringify({ client_secret: secret })
});
```

**✅ Do This Instead:**
```javascript
// Store in memory only
let clientSecret = null;

// Use server-side endpoint for token exchange
fetch('/portal/api/token', {
  method: 'POST',
  body: JSON.stringify({
    code, client_id, client_secret, redirect_uri
  })
});
```

### Production Considerations

For production deployments:

1. **Use HTTPS**: All communications must use HTTPS
2. **Implement PKCE**: For public clients (mobile/SPA apps)
3. **Session Management**: Implement proper server-side sessions
4. **Rate Limiting**: Apply rate limits to registration endpoints
5. **Input Validation**: Validate all user inputs server-side
6. **CORS Configuration**: Restrict CORS to known origins
7. **CSP Headers**: Implement Content Security Policy
8. **Audit Logging**: Log all registration and authorization events

## Available APIs

### Accounts API

**GET /api/v1/accounts**
- Description: List all accounts for authenticated customer
- Required Scope: `accounts:read`
- Rate Limit: 100 requests/minute/client

**GET /api/v1/accounts/{id}**
- Description: Get details for a specific account
- Required Scope: `accounts:read`
- Rate Limit: 100 requests/minute/client

**GET /api/v1/accounts/{id}/balance**
- Description: Get account balance
- Required Scope: `balances:read`
- Rate Limit: 100 requests/minute/client

### Transactions API

**GET /api/v1/accounts/{id}/transactions**
- Description: Get transaction history for an account
- Required Scope: `transactions:read`
- Rate Limit: 100 requests/minute/client

## OAuth Scopes

| Scope | Description | Required |
|-------|-------------|----------|
| `accounts:read` | Read access to customer account information | Yes |
| `transactions:read` | Read access to customer transaction history | No |
| `balances:read` | Read access to account balances | No |
| `profile:read` | Read access to customer profile information | No |

## Testing

### Manual Testing

1. **Test Registration**:
   ```bash
   curl -X POST http://localhost:3001/portal/api/register \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test App",
       "redirect_uris": ["http://localhost:3000/callback"],
       "requested_scopes": ["accounts:read"]
     }'
   ```

2. **Test API Catalog**:
   ```bash
   curl http://localhost:3001/portal/api/catalog
   ```

3. **Test Authorization URL**:
   ```bash
   curl -X POST http://localhost:3001/portal/api/authorize \
     -H "Content-Type: application/json" \
     -d '{
       "client_id": "client_abc123",
       "redirect_uri": "http://localhost:3000/callback",
       "scope": "accounts:read"
     }'
   ```

### Automated Testing

```bash
# Run portal API tests
npm test tests/portal/

# Test client secret is not exposed
npm run test:security
```

## Troubleshooting

### Portal Won't Start

**Issue**: Server fails to start
**Solution**: 
- Check if port 3001 is available
- Verify database connection
- Check environment variables

### Registration Fails

**Issue**: Application registration returns error
**Solution**:
- Verify redirect URI format (must be valid URL)
- Check at least one scope is selected
- Ensure application name is provided

### Token Exchange Fails

**Issue**: Authorization code exchange fails
**Solution**:
- Verify authorization code is correct
- Check client credentials are correct
- Ensure redirect URI matches registration
- Verify code hasn't expired (10 minutes)

### API Calls Return 401

**Issue**: Protected API calls return unauthorized
**Solution**:
- Verify access token is valid
- Check token hasn't expired (1 hour)
- Ensure Authorization header format: `Bearer {token}`

### API Calls Return 403

**Issue**: API calls return forbidden
**Solution**:
- Verify token has required scope
- Check consent hasn't been revoked
- Ensure consent hasn't expired

### API Calls Return 429

**Issue**: Too many requests
**Solution**:
- Rate limit exceeded (100 req/min/client)
- Wait for rate limit window to reset
- Check `Retry-After` header for wait time

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Developer Portal                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ API Catalog  │  │  Register    │  │  Try Demo    │     │
│  │              │  │  Application │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  Frontend (HTML/CSS/JS)                                     │
│  - No client secrets in browser                             │
│  - Memory-only credential storage                           │
│  - Server-side token exchange                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Portal API                              │
│                                                              │
│  /portal/api/catalog     - Get API catalog                  │
│  /portal/api/register    - Register OAuth client            │
│  /portal/api/authorize   - Start OAuth flow                 │
│  /portal/api/token       - Exchange code (server-side)      │
│                                                              │
│  Backend (Node.js/Express)                                  │
│  - Handles client secrets securely                          │
│  - Validates all inputs                                     │
│  - Integrates with OAuth services                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   OAuth & Banking APIs                       │
│                                                              │
│  - Client Registration                                       │
│  - Authorization Flow                                        │
│  - Token Exchange                                            │
│  - Protected Banking APIs                                    │
└─────────────────────────────────────────────────────────────┘
```
