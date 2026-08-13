# OAuth Authorization Flow - Complete Example

This document provides a complete, working example of the OAuth 2.0 authorization flow for the Open Banking MVP.

## Scenario

**Budget Tracker App** wants to access a customer's account and transaction data to provide budgeting insights.

- **Fintech App**: Budget Tracker
- **Customer**: Jane Doe (customer_id: CUST-001)
- **Requested Scopes**: `accounts:read`, `transactions:read`

## Prerequisites

1. Budget Tracker has registered as an OAuth client:
   - `client_id`: `budget-tracker-app`
   - `client_secret`: `secret_abc123...` (stored securely)
   - `redirect_uri`: `https://budget.example.com/callback`
   - `allowed_scopes`: `accounts:read`, `balances:read`

2. Jane Doe has an active bank account with the Open Banking provider

## Step-by-Step Flow

### Step 1: Initiate Authorization

Budget Tracker redirects Jane to the authorization endpoint:

```javascript
// budget-tracker-app/src/auth.js

const crypto = require('crypto');

function initiateAuthorization() {
  // Generate CSRF protection token
  const state = crypto.randomBytes(32).toString('hex');
  sessionStorage.setItem('oauth_state', state);
  
  // Build authorization URL
  const authParams = new URLSearchParams({
    client_id: 'budget-tracker-app',
    redirect_uri: 'https://budget.example.com/callback',
    response_type: 'code',
    scope: 'accounts:read transactions:read',
    state: state
  });
  
  const authUrl = `https://auth.openbanking.example.com/oauth/authorize?${authParams}`;
  
  // Redirect user to authorization server
  window.location.href = authUrl;
}
```

**Generated URL:**
```
https://auth.openbanking.example.com/oauth/authorize?client_id=budget-tracker-app&redirect_uri=https://budget.example.com/callback&response_type=code&scope=accounts:read%20transactions:read&state=a1b2c3d4e5f6...
```

### Step 2: Customer Authentication

Jane is redirected to the bank's login page (if not already authenticated):

```
GET /auth/login?return_to=/oauth/authorize?client_id=budget-tracker-app...
```

Jane enters her credentials:
- **Email**: `jane.doe@example.com`
- **Password**: `SecurePassword123!`

**Server-side authentication:**

```javascript
// auth/customer-authentication.js

const bcrypt = require('bcrypt');
const { query } = require('../data/db');

async function authenticateCustomer(email, password) {
  // Fetch customer from database
  const result = await query(
    'SELECT customer_id, email, password_hash FROM customers WHERE email = $1',
    [email]
  );
  
  if (result.rows.length === 0) {
    return { success: false, error: 'Invalid credentials' };
  }
  
  const customer = result.rows[0];
  
  // Verify password
  const passwordValid = await bcrypt.compare(password, customer.password_hash);
  
  if (!passwordValid) {
    return { success: false, error: 'Invalid credentials' };
  }
  
  // Create session
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  
  await query(
    'INSERT INTO customer_sessions (session_token, customer_id, expires_at) VALUES ($1, $2, $3)',
    [sessionToken, customer.customer_id, expiresAt]
  );
  
  return {
    success: true,
    session_token: sessionToken,
    customer_id: customer.customer_id
  };
}
```

**Response:**
```
Set-Cookie: session_token=abc123...; HttpOnly; Secure; SameSite=Strict
Location: /oauth/authorize?client_id=budget-tracker-app...
```

### Step 3: Authorization Request Processing

The authorization server validates the request:

```javascript
// auth/oauth/authorization-request.js

async function handleAuthorizationRequest(params, customerId) {
  // 1. Validate request parameters
  const validation = validateAuthorizationRequest(params);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }
  
  // 2. Validate client and redirect URI
  const clientValidation = await validateClientAndRedirectUri(
    params.client_id,
    params.redirect_uri
  );
  
  if (!clientValidation.valid) {
    return {
      success: false,
      error: clientValidation.error,
      error_description: clientValidation.error_description,
      should_redirect: false // Don't redirect for client/URI errors
    };
  }
  
  // 3. Validate scopes against client allowance
  const requestedScopes = params.scope.split(' ');
  const scopeValidation = validateScopesAgainstClient(
    requestedScopes,
    clientValidation.client.allowed_scopes
  );
  
  if (!scopeValidation.valid) {
    return {
      success: false,
      error: scopeValidation.error,
      error_description: scopeValidation.error_description,
      excessive_scopes: scopeValidation.excessive_scopes,
      should_redirect: true,
      redirect_uri: params.redirect_uri,
      state: params.state
    };
  }
  
  // 4. Create authorization context
  const authRequestId = `authreq_${crypto.randomBytes(16).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  await query(
    `INSERT INTO authorization_requests 
     (auth_request_id, customer_id, client_id, redirect_uri, scope, state, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      authRequestId,
      customerId,
      params.client_id,
      params.redirect_uri,
      params.scope,
      params.state,
      expiresAt
    ]
  );
  
  return {
    success: true,
    auth_request_id: authRequestId,
    client: clientValidation.client,
    requested_scopes: requestedScopes,
    redirect_uri: params.redirect_uri,
    state: params.state,
    expires_at: expiresAt
  };
}
```

**Note**: In this example, Budget Tracker requested `transactions:read` but is only allowed `accounts:read` and `balances:read`. The request would fail with:

```json
{
  "success": false,
  "error": "invalid_scope",
  "error_description": "Requested scope exceeds client allowance",
  "excessive_scopes": ["transactions:read"],
  "allowed_scopes": ["accounts:read", "balances:read"],
  "should_redirect": true
}
```

**Corrected request** (only requesting allowed scopes):
```
scope=accounts:read balances:read
```

### Step 4: Consent Screen

Jane is shown the consent screen:

```html
<!-- apps/customer-consent/consent.html -->

<div class="consent-screen">
  <h1>Authorization Request</h1>
  
  <div class="app-info">
    <img src="budget-tracker-logo.png" alt="Budget Tracker">
    <h2>Budget Tracker</h2>
    <p>Budget Tracker wants to access your banking data</p>
  </div>
  
  <div class="permissions">
    <h3>This app will be able to:</h3>
    <ul>
      <li>
        <strong>View your accounts</strong>
        <p>Read your account numbers, types, and basic information</p>
      </li>
      <li>
        <strong>View your balances</strong>
        <p>Read current and available balances for your accounts</p>
      </li>
    </ul>
  </div>
  
  <div class="customer-info">
    <p>Logged in as: <strong>Jane Doe</strong> (jane.doe@example.com)</p>
  </div>
  
  <form method="POST" action="/oauth/consent">
    <input type="hidden" name="auth_request_id" value="authreq_abc123...">
    <button type="submit" name="action" value="approve" class="btn-approve">
      Approve
    </button>
    <button type="submit" name="action" value="deny" class="btn-deny">
      Deny
    </button>
  </form>
</div>
```

### Step 5: Customer Approves Consent

Jane clicks "Approve". The server processes the consent:

```javascript
// auth/consent/consent-handler.js

async function handleConsent(authRequestId, action, customerId) {
  // 1. Fetch authorization request
  const authRequest = await query(
    'SELECT * FROM authorization_requests WHERE auth_request_id = $1 AND customer_id = $2',
    [authRequestId, customerId]
  );
  
  if (authRequest.rows.length === 0) {
    return { success: false, error: 'Invalid authorization request' };
  }
  
  const request = authRequest.rows[0];
  
  // 2. Check expiration
  if (new Date() > new Date(request.expires_at)) {
    return { success: false, error: 'Authorization request expired' };
  }
  
  // 3. Handle denial
  if (action === 'deny') {
    return {
      success: false,
      error: 'access_denied',
      error_description: 'Customer denied consent',
      redirect_uri: request.redirect_uri,
      state: request.state
    };
  }
  
  // 4. Generate authorization code
  const authCode = `authcode_${crypto.randomBytes(32).toString('hex')}`;
  const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  await query(
    `INSERT INTO authorization_codes 
     (code, customer_id, client_id, redirect_uri, scope, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [authCode, customerId, request.client_id, request.redirect_uri, request.scope, codeExpiresAt]
  );
  
  // 5. Delete authorization request (single use)
  await query('DELETE FROM authorization_requests WHERE auth_request_id = $1', [authRequestId]);
  
  return {
    success: true,
    code: authCode,
    redirect_uri: request.redirect_uri,
    state: request.state
  };
}
```

**Redirect response:**
```
HTTP/1.1 302 Found
Location: https://budget.example.com/callback?code=authcode_xyz789...&state=a1b2c3d4e5f6...
```

### Step 6: Handle Callback

Budget Tracker receives the callback:

```javascript
// budget-tracker-app/src/callback.js

async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  
  // 1. Check for errors
  if (params.has('error')) {
    const error = params.get('error');
    const description = params.get('error_description');
    console.error('Authorization failed:', error, description);
    return;
  }
  
  // 2. Verify state (CSRF protection)
  const receivedState = params.get('state');
  const expectedState = sessionStorage.getItem('oauth_state');
  
  if (receivedState !== expectedState) {
    console.error('State mismatch - possible CSRF attack');
    return;
  }
  
  // 3. Extract authorization code
  const code = params.get('code');
  
  // 4. Exchange code for access token (server-side)
  const response = await fetch('/api/exchange-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  
  const tokenData = await response.json();
  
  // 5. Store access token securely
  sessionStorage.setItem('access_token', tokenData.access_token);
  sessionStorage.setItem('refresh_token', tokenData.refresh_token);
  
  // 6. Redirect to app dashboard
  window.location.href = '/dashboard';
}
```

### Step 7: Token Exchange (Server-Side)

Budget Tracker's backend exchanges the code for tokens:

```javascript
// budget-tracker-app/server/token-exchange.js

const axios = require('axios');

async function exchangeCodeForToken(code) {
  const credentials = Buffer.from(
    `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
  ).toString('base64');
  
  const response = await axios.post(
    'https://auth.openbanking.example.com/oauth/token',
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: 'https://budget.example.com/callback'
    }),
    {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  
  return response.data;
}
```

**Token response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjdXN0b21lcl9pZCI6IkNVU1QtMDAxIiwiY2xpZW50X2lkIjoiYnVkZ2V0LXRyYWNrZXItYXBwIiwic2NvcGUiOiJhY2NvdW50czpyZWFkIGJhbGFuY2VzOnJlYWQiLCJpYXQiOjE2MjYzNjAwMDAsImV4cCI6MTYyNjM2MzYwMH0.signature",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "refresh_abc123xyz789",
  "scope": "accounts:read balances:read"
}
```

### Step 8: Access Protected Resources

Budget Tracker uses the access token to fetch Jane's data:

```javascript
// budget-tracker-app/server/api-client.js

async function fetchCustomerAccounts(accessToken) {
  const response = await axios.get(
    'https://api.openbanking.example.com/api/accounts',
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  return response.data;
}

async function fetchAccountBalances(accessToken, accountId) {
  const response = await axios.get(
    `https://api.openbanking.example.com/api/accounts/${accountId}/balance`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  return response.data;
}
```

**API Response:**
```json
{
  "accounts": [
    {
      "account_id": "ACC-001",
      "account_number": "****1234",
      "account_type": "checking",
      "currency": "USD",
      "balance": {
        "current": 5420.50,
        "available": 5420.50
      }
    },
    {
      "account_id": "ACC-002",
      "account_number": "****5678",
      "account_type": "savings",
      "currency": "USD",
      "balance": {
        "current": 12500.00,
        "available": 12500.00
      }
    }
  ]
}
```

## Error Scenarios

### Scenario 1: Customer Denies Consent

Jane clicks "Deny" on the consent screen:

```
HTTP/1.1 302 Found
Location: https://budget.example.com/callback?error=access_denied&error_description=Customer+denied+consent&state=a1b2c3d4e5f6...
```

Budget Tracker handles the error:

```javascript
if (params.get('error') === 'access_denied') {
  showMessage('You declined to share your data. You can try again later.');
}
```

### Scenario 2: Invalid Redirect URI

Budget Tracker uses wrong redirect URI:

```
GET /oauth/authorize?client_id=budget-tracker-app&redirect_uri=https://malicious.example.com/callback&...
```

**Response** (no redirect, shown to user):
```json
{
  "error": "invalid_request",
  "error_description": "redirect_uri does not match registered URIs",
  "registered_uris": ["https://budget.example.com/callback"]
}
```

### Scenario 3: Excessive Scope Request

Budget Tracker requests unauthorized scope:

```
scope=accounts:read transactions:read profile:read
```

**Response** (redirect with error):
```
Location: https://budget.example.com/callback?error=invalid_scope&error_description=Requested+scope+exceeds+client+allowance&state=a1b2c3d4e5f6...
```

## Security Best Practices

### 1. Always Use State Parameter

```javascript
// Generate cryptographically secure state
const state = crypto.randomBytes(32).toString('hex');

// Store in session
sessionStorage.setItem('oauth_state', state);

// Verify on callback
if (receivedState !== sessionStorage.getItem('oauth_state')) {
  throw new Error('CSRF attack detected');
}
```

### 2. Store Tokens Securely

```javascript
// ❌ DON'T: Store in localStorage (vulnerable to XSS)
localStorage.setItem('access_token', token);

// ✅ DO: Use HttpOnly cookies (server-side)
res.cookie('access_token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 3600000
});
```

### 3. Handle Token Expiration

```javascript
async function makeApiCall(endpoint) {
  try {
    return await fetchWithToken(endpoint, accessToken);
  } catch (error) {
    if (error.status === 401) {
      // Token expired, refresh it
      const newToken = await refreshAccessToken(refreshToken);
      return await fetchWithToken(endpoint, newToken);
    }
    throw error;
  }
}
```

## Testing the Flow

Use the provided test suite:

```bash
# Run authorization flow tests
npm test tests/auth/authorization-request.test.js

# Run integration tests
npm test tests/integration/oauth-flow.test.js
```
