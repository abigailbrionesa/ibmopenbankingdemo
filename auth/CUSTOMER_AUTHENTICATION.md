# Customer Authentication - Demo Implementation

This is a DEMO authentication implementation for MVP purposes only

This implementation maintains strict separation between:

1. **Customer Identity** (Bank customer authentication)
   - Used for: Consent approval, account access
   - Method: Customer login credentials
   - Session: Customer session tokens

2. **Fintech Identity** (OAuth client authentication)
   - Used for: API access after consent
   - Method: OAuth client credentials
   - Session: OAuth access tokens

### Authentication Flow

```
┌─────────────┐
│   Fintech   │
│ Application │
└──────┬──────┘
       │
       │ 1. Initiate OAuth flow
       │    (with client_id)
       ▼
┌─────────────────┐
│  Authorization  │
│    Endpoint     │
└──────┬──────────┘
       │
       │ 2. Redirect to customer login
       │    (NO customer session)
       ▼
┌─────────────────┐
│  Customer Login │ ◄── AUTHENTICATION BOUNDARY
│      Page       │
└──────┬──────────┘
       │
       │ 3. Customer authenticates
       │    (email + password)
       ▼
┌─────────────────┐
│ Create Customer │
│     Session     │
└──────┬──────────┘
       │
       │ 4. Show consent page
       │    (WITH customer session)
       ▼
┌─────────────────┐
│  Consent Page   │
│  (Protected)    │
└─────────────────┘
```

## Demo Authentication

### Customer Login

**Endpoint:** `POST /auth/login`

**Request:**
```json
{
  "email": "maria.garcia@example.com",
  "password": "demo123"
}
```

**Response:**
```json
{
  "success": true,
  "customer_id": "CUST-001",
  "customer_name": "Maria Garcia",
  "session_token": "dGhpc19pc19hX3Nlc3Npb25fdG9rZW4...",
  "expires_at": "2026-08-13T15:00:00.000Z",
  "authentication_method": "demo",
  "warning": "DEMO AUTHENTICATION - Not SCA compliant"
}
```

### Demo Credentials

For testing purposes, the following demo credentials are available:

| Customer | Email | Password |
|----------|-------|----------|
| Maria Garcia | maria.garcia@example.com | demo123 or CUST-001 |
| Carlos Rodriguez | carlos.rodriguez@example.com | demo123 or CUST-002 |
| Ana Martinez | ana.martinez@example.com | demo123 or CUST-003 |

## Session Management

### Session Properties

- **Duration:** 30 minutes
- **Token:** 32-byte secure random token
- **Storage:** Database with expiration tracking
- **Renewal:** On activity (last_activity_at updated)
- **Cleanup:** Automatic expiration of old sessions

### Session Verification

**Endpoint:** `GET /auth/verify`

**Headers:**
```
X-Customer-Session: <session_token>
```

**Response:**
```json
{
  "valid": true,
  "customer_id": "CUST-001",
  "customer_name": "Maria Garcia",
  "expires_at": "2026-08-13T15:00:00.000Z"
}
```

### Logout

**Endpoint:** `POST /auth/logout`

**Headers:**
```
X-Customer-Session: <session_token>
```

## Middleware Usage

### Protecting Routes

```javascript
const { requireCustomerAuth } = require('./auth/middleware/customer-auth-middleware');

// Protect consent page
app.get('/consent', requireCustomerAuth, (req, res) => {
  // req.customer contains authenticated customer info
  const { customer_id, customer_name } = req.customer;
  // ... show consent page
});
```

### OAuth Authorization Endpoint

```javascript
const { requireCustomerAuthForAuthorization } = require('./auth/middleware/customer-auth-middleware');

// OAuth authorization endpoint
app.get('/oauth/authorize', requireCustomerAuthForAuthorization, (req, res) => {
  // req.customer contains authenticated customer
  // req.authorizationContext contains auth metadata
  // ... process authorization request
});
```

### Preventing OAuth Client Auth for Customers

```javascript
const { preventOAuthClientAuth } = require('./auth/middleware/customer-auth-middleware');

// Customer login endpoint
app.post('/auth/login', preventOAuthClientAuth, (req, res) => {
  // Blocks requests with OAuth client credentials
  // ... process customer login
});
```

## Security Rules

### ✅ DO

- Require customer authentication before showing consent
- Use customer session tokens for customer-facing pages
- Separate customer identity from fintech identity
- Validate session expiration
- Log authentication events
- Clean up expired sessions
- Use HTTPS in production
- Implement CSRF protection
- Use secure session cookies

### ❌ DON'T

- Allow OAuth client credentials to authenticate customers
- Skip customer authentication for consent approval
- Share session tokens between customers
- Store passwords in plaintext
- Use demo authentication in production
- Allow infinite session duration
- Trust client-side authentication state
- Expose session tokens in URLs

## Error Handling

### Unauthenticated Request

```json
{
  "error": "Authentication required",
  "message": "Customer must be authenticated to access this resource",
  "redirect_to": "/auth/login"
}
```

### Expired Session

```json
{
  "error": "Invalid or expired session",
  "message": "Session has expired",
  "redirect_to": "/auth/login"
}
```

### OAuth Credentials Used for Customer Auth

```json
{
  "error": "Invalid authentication method",
  "message": "OAuth client credentials cannot be used for customer authentication",
  "reason": "Fintech identity and customer identity are separate security domains",
  "required_action": "Use customer login endpoint instead"
}
```

## Testing

### Test Scenarios

1. **Unauthenticated Authorization Request**
   - Request: GET /oauth/authorize without session
   - Expected: Redirect to /auth/login

2. **Authenticated Customer Consent**
   - Request: GET /oauth/authorize with valid session
   - Expected: Show consent page

3. **OAuth Credentials for Customer Auth**
   - Request: POST /auth/login with client_id/client_secret
   - Expected: 403 Forbidden

4. **Expired Session**
   - Request: GET /consent with expired session
   - Expected: 401 Unauthorized, redirect to login

5. **Session Validation**
   - Request: GET /auth/verify with valid session
   - Expected: 200 OK with customer info