# OAuth 2.0 Authorization Flow

This document describes the OAuth 2.0 Authorization Code flow implementation for the Open Banking MVP.

## Overview

The authorization flow allows third-party fintech applications to request access to customer banking data with explicit customer consent. This implementation follows the OAuth 2.0 Authorization Code Grant type

## Flow Diagram

```
┌─────────────┐                                  ┌──────────────┐
│   Fintech   │                                  │   Customer   │
│ Application │                                  │   (Browser)  │
└──────┬──────┘                                  └──────┬───────┘
       │                                                │
       │ 1. Redirect to /oauth/authorize               │
       │   with client_id, redirect_uri, scope         │
       ├──────────────────────────────────────────────>│
       │                                                │
       │                                                │ 2. Customer Authentication
       │                                                │    (if not already authenticated)
       │                                                │
       │                                                │ 3. Consent Screen
       │                                                │    - View requested scopes
       │                                                │    - Approve or deny
       │                                                │
       │ 4. Redirect back with authorization code      │
       │<───────────────────────────────────────────────┤
       │                                                │
       │ 5. Exchange code for access token             │
       │    POST /oauth/token                          │
       │                                                │
       │ 6. Access customer data with token            │
       │    Authorization: Bearer {access_token}       │
       │                                                │
```

## Step 1: Authorization Request

### Endpoint

```
GET /oauth/authorize
```

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `client_id` | string | The OAuth client identifier obtained during registration |
| `redirect_uri` | string | The callback URI registered with the client |
| `response_type` | string | Must be `code` for authorization code flow |
| `scope` | string | Space-separated list of requested scopes |
| `state` | string | **Recommended** - CSRF protection token |

### Supported Scopes

| Scope | Description |
|-------|-------------|
| `accounts:read` | Read customer account information |
| `transactions:read` | Read transaction history |
| `balances:read` | Read account balances |
| `profile:read` | Read customer profile information |

### Example Request

```http
GET /oauth/authorize?client_id=fintech-demo-client&redirect_uri=http://localhost:3000/callback&response_type=code&scope=accounts:read%20transactions:read&state=random_state_123 HTTP/1.1
Host: auth.openbanking.example.com
```

### Validation Rules

1. **client_id**: Must be a registered, active OAuth client
2. **redirect_uri**: Must exactly match one of the URIs registered with the client
3. **response_type**: Must be `code` (other grant types not supported)
4. **scope**: All requested scopes must be:
   - Supported by the authorization server
   - Allowed for the specific client (based on client registration)
5. **state**: Strongly recommended for CSRF protection

### Success Response

If the request is valid and the customer is authenticated, they are redirected to the consent screen:

```
HTTP/1.1 302 Found
Location: /consent?auth_request_id=authreq_abc123xyz
```

### Error Responses

#### Invalid Client or Redirect URI

If the `client_id` is invalid or the `redirect_uri` doesn't match registration, the error is displayed directly to the user (no redirect):

```json
{
  "error": "invalid_client",
  "error_description": "Client not found or redirect_uri does not match registration"
}
```

#### Other Errors

For other validation errors, the user is redirected back to the `redirect_uri` with error parameters:

```
HTTP/1.1 302 Found
Location: https://app.example.com/callback?error=invalid_scope&error_description=Requested+scope+exceeds+client+allowance&state=random_state_123
```

**Error Codes:**

| Error Code | Description |
|------------|-------------|
| `invalid_request` | Missing or malformed required parameter |
| `unauthorized_client` | Client is suspended or not authorized |
| `access_denied` | Customer denied consent |
| `unsupported_response_type` | response_type is not `code` |
| `invalid_scope` | Requested scope is invalid or excessive |
| `server_error` | Internal server error |

## Step 2: Customer Authentication

If the customer is not already authenticated, they are redirected to the login page:

```
HTTP/1.1 302 Found
Location: /auth/login?return_to=/oauth/authorize?client_id=...
```

### Authentication Requirements

- **Identity Separation**: OAuth client credentials (client_id/client_secret) CANNOT be used to authenticate customers
- **Session Duration**: Customer sessions expire after 30 minutes of inactivity
- **Demo Implementation**: Current authentication is for demonstration purposes only and does not implement Strong Customer Authentication (SCA) required by PSD2

### Security Notes

⚠️ **Important**: The current authentication implementation is a DEMO and should NOT be used in production:

- Passwords are stored with bcrypt (12 rounds) but lack additional security layers
- No multi-factor authentication (MFA)
- No device fingerprinting or risk-based authentication
- No compliance with PSD2 Strong Customer Authentication requirements

## Step 3: Consent Screen

After successful authentication, the customer is presented with a consent screen showing:

1. **Fintech Application Details**
   - Application name
   - Application description
   - Developer/company information

2. **Requested Permissions**
   - Clear description of each requested scope
   - What data will be accessible
   - Duration of access

3. **Customer Actions**
   - **Approve**: Grant the requested permissions
   - **Deny**: Reject the authorization request

### Consent Context

The authorization request creates a temporary context stored in the database:

```sql
CREATE TABLE authorization_requests (
  auth_request_id VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(50) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  state TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);
```

**Expiration**: Authorization contexts expire after 10 minutes

## Step 4: Authorization Code Issuance

### Approval Flow

If the customer approves the consent:

```
HTTP/1.1 302 Found
Location: https://app.example.com/callback?code=authcode_abc123xyz&state=random_state_123
```

The authorization code:
- Is single-use only
- Expires after 10 minutes
- Is bound to the specific client_id and redirect_uri
- Can be exchanged for an access token

### Denial Flow

If the customer denies consent:

```
HTTP/1.1 302 Found
Location: https://app.example.com/callback?error=access_denied&error_description=Customer+denied+consent&state=random_state_123
```

## Step 5: Token Exchange

The fintech application exchanges the authorization code for an access token:

```http
POST /oauth/token HTTP/1.1
Host: auth.openbanking.example.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(client_id:client_secret)

grant_type=authorization_code&code=authcode_abc123xyz&redirect_uri=https://app.example.com/callback
```

### Success Response

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "refresh_abc123xyz",
  "scope": "accounts:read transactions:read"
}
```

### Token Properties

- **Access Token**: JWT containing customer_id, client_id, and granted scopes
- **Expires In**: 3600 seconds (1 hour)
- **Refresh Token**: Can be used to obtain new access tokens without re-authorization
- **Scope**: The actual granted scopes (may be less than requested)

## Step 6: API Access

Use the access token to access protected resources:

```http
GET /api/accounts HTTP/1.1
Host: api.openbanking.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Validation

The API gateway validates:
1. Token signature and expiration
2. Token has not been revoked
3. Requested resource matches granted scopes
4. Customer account is active

## Security Considerations

### State Parameter

The `state` parameter is **strongly recommended** for CSRF protection:

1. Generate a random, unguessable value before redirecting to `/oauth/authorize`
2. Store it in the session or local storage
3. Verify it matches when receiving the callback
4. Reject the authorization if state doesn't match

**Example:**

```javascript
// Before authorization
const state = crypto.randomBytes(32).toString('hex');
sessionStorage.setItem('oauth_state', state);
window.location.href = `/oauth/authorize?client_id=...&state=${state}`;

// In callback handler
const receivedState = new URLSearchParams(window.location.search).get('state');
const expectedState = sessionStorage.getItem('oauth_state');
if (receivedState !== expectedState) {
  throw new Error('CSRF attack detected');
}
```

### Redirect URI Validation

- Redirect URIs must be registered during client registration
- Exact match required (no wildcards or pattern matching)
- HTTPS required for production (HTTP allowed for localhost in development)
- Prevents open redirect vulnerabilities

### Authorization Code Security

- Single-use only (attempting to reuse invalidates all tokens)
- Short-lived (10 minutes)
- Bound to client_id and redirect_uri
- Must be exchanged with client authentication

## Error Handling

### Client-Side Error Handling

```javascript
const params = new URLSearchParams(window.location.search);

if (params.has('error')) {
  const error = params.get('error');
  const description = params.get('error_description');
  const state = params.get('state');
  
  // Verify state matches
  if (state !== sessionStorage.getItem('oauth_state')) {
    console.error('State mismatch - possible CSRF attack');
    return;
  }
  
  // Handle specific errors
  switch (error) {
    case 'access_denied':
      console.log('User denied consent');
      break;
    case 'invalid_scope':
      console.error('Requested scope not allowed:', description);
      break;
    default:
      console.error('Authorization error:', error, description);
  }
}
```

## Testing

Comprehensive tests are available in [`tests/auth/authorization-request.test.js`](../tests/auth/authorization-request.test.js):

- Request parameter validation
- Client and redirect URI validation
- Scope validation against client allowance
- State parameter preservation
- Error redirect URL construction
- Complete authorization flow integration
- Consent handoff integration

Run tests:

```bash
npm test tests/auth/authorization-request.test.js
```

