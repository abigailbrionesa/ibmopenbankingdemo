# OAuth Token Exchange

This document describes the OAuth 2.0 authorization code token exchange flow for the Open Banking MVP.

## Overview

The token exchange endpoint allows fintech applications to exchange an authorization code for an access token. This is the final step in the OAuth 2.0 Authorization Code flow, where the application proves its identity and receives credentials to access the customer's banking data.

## Endpoint

```
POST /oauth/token
```

## Request Format

### Headers

```http
POST /oauth/token HTTP/1.1
Host: auth.openbanking.example.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(client_id:client_secret)
```

**Client Authentication Methods:**

1. **HTTP Basic Authentication** (Recommended)
   ```
   Authorization: Basic base64(client_id:client_secret)
   ```

2. **Request Body Parameters**
   ```
   client_id=fintech-demo-client&client_secret=secret_abc123
   ```

### Body Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `grant_type` | Yes | Must be `authorization_code` |
| `code` | Yes | The authorization code received from authorization endpoint |
| `redirect_uri` | Yes | Must exactly match the redirect_uri used in authorization request |
| `client_id` | Conditional | Required if not using Basic Auth |
| `client_secret` | Conditional | Required if not using Basic Auth |

### Example Request

```http
POST /oauth/token HTTP/1.1
Host: auth.openbanking.example.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic ZmludGVjaC1kZW1vLWNsaWVudDpzZWNyZXRfYWJjMTIz

grant_type=authorization_code&code=authcode_xyz789&redirect_uri=http://localhost:3000/callback
```

## Response Format

### Success Response (200 OK)

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "refresh_abc123xyz789",
  "scope": "accounts:read transactions:read"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | JWT access token for API requests |
| `token_type` | string | Always "Bearer" |
| `expires_in` | integer | Token lifetime in seconds (3600 = 1 hour) |
| `refresh_token` | string | Token for obtaining new access tokens |
| `scope` | string | Space-separated list of granted scopes |

### Error Responses

#### Invalid Client (401 Unauthorized)

```json
{
  "error": "invalid_client",
  "error_description": "Client not found"
}
```

**Headers:**
```
WWW-Authenticate: Basic realm="OAuth Token Endpoint"
```

#### Invalid Grant (400 Bad Request)

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code has expired"
}
```

#### Unsupported Grant Type (400 Bad Request)

```json
{
  "error": "unsupported_grant_type",
  "error_description": "Only authorization_code grant type is supported"
}
```

## Access Token Structure

The access token is a JWT (JSON Web Token) with the following payload:

```json
{
  "token_id": "token_abc123",
  "customer_id": "CUST-001",
  "client_id": "fintech-demo-client",
  "consent_id": "consent_xyz789",
  "scope": "accounts:read transactions:read",
  "type": "access",
  "iat": 1626360000,
  "exp": 1626363600
}
```

**Payload Fields:**

| Field | Description |
|-------|-------------|
| `token_id` | Unique token identifier |
| `customer_id` | Customer who granted consent |
| `client_id` | OAuth client identifier |
| `consent_id` | Reference to approved consent |
| `scope` | Granted scopes |
| `type` | Token type ("access") |
| `iat` | Issued at timestamp |
| `exp` | Expiration timestamp |

## Validation Rules

### 1. Grant Type Validation

Only `authorization_code` grant type is supported:

```javascript
if (grant_type !== 'authorization_code') {
  return {
    error: 'unsupported_grant_type',
    error_description: 'Only authorization_code grant type is supported'
  };
}
```

### 2. Client Credentials Validation

Client must exist, be active, and provide correct secret:

```javascript
// Fetch client
const client = await getClient(client_id);

// Check status
if (client.status !== 'active') {
  return { error: 'unauthorized_client' };
}

// Verify secret
const valid = await bcrypt.compare(client_secret, client.client_secret_hash);
if (!valid) {
  return { error: 'invalid_client' };
}
```

### 3. Authorization Code Validation

Code must be:
- Valid (exists in database)
- Not expired (within 10 minutes)
- Not used (single-use only)
- Issued to the requesting client
- Used with matching redirect_uri

```javascript
// Check expiration
if (now > code.expires_at) {
  return { error: 'invalid_grant', error_description: 'Code expired' };
}

// Check if used
if (code.used) {
  // Security violation - revoke all tokens
  await revokeTokensByCode(code);
  return { error: 'invalid_grant', error_description: 'Code already used' };
}

// Verify client_id
if (code.client_id !== client_id) {
  return { error: 'invalid_grant', error_description: 'Wrong client' };
}

// Verify redirect_uri
if (code.redirect_uri !== redirect_uri) {
  return { error: 'invalid_grant', error_description: 'Wrong redirect_uri' };
}
```

### 4. Code Reuse Detection

If a code is used twice, it's a security violation:

1. Mark code as used
2. Revoke all tokens issued for that consent
3. Return error to client

```javascript
if (code.used) {
  // Revoke all tokens for this consent
  await query(
    'UPDATE access_tokens SET revoked = true WHERE consent_id = $1',
    [code.consent_id]
  );
  
  return {
    error: 'invalid_grant',
    error_description: 'Authorization code has already been used',
    security_violation: true
  };
}
```

## Token Binding

Tokens are bound to multiple entities:

```sql
CREATE TABLE access_tokens (
  token_id VARCHAR(255) PRIMARY KEY,
  access_token_hash VARCHAR(255) NOT NULL,
  customer_id VARCHAR(50) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  consent_id VARCHAR(255) NOT NULL,
  scope TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  -- ...
);
```

**Binding ensures:**
- Token can only be used by the client it was issued to
- Token scopes match the approved consent
- Token is linked to specific customer
- Token can be revoked via consent revocation

## Token Expiration

### Access Token
- **Lifetime**: 1 hour (3600 seconds)
- **Format**: JWT with `exp` claim
- **Renewal**: Use refresh token

### Refresh Token
- **Lifetime**: 30 days (2,592,000 seconds)
- **Format**: Random string with `refresh_` prefix
- **Usage**: Exchange for new access token (not yet implemented)

### Expiration Handling

```javascript
const TOKEN_CONFIG = {
  ACCESS_TOKEN_TTL: 3600,      // 1 hour
  REFRESH_TOKEN_TTL: 2592000   // 30 days
};

// Calculate expiration
const expiresAt = new Date(Date.now() + TOKEN_CONFIG.ACCESS_TOKEN_TTL * 1000);
```

## Security Considerations

### 1. Client Secret Protection

Client secrets are:
- Hashed with bcrypt (12 rounds)
- Never returned in API responses
- Validated on every token request

```javascript
const secretValid = await bcrypt.compare(
  client_secret,
  client.client_secret_hash
);
```

### 2. Authorization Code Security

Codes are:
- Single-use only
- Short-lived (10 minutes)
- Bound to client and redirect_uri
- Revoke all tokens on reuse

### 3. Token Storage

Tokens are stored hashed:

```javascript
const accessTokenHash = crypto
  .createHash('sha256')
  .update(accessToken)
  .digest('hex');
```

### 4. JWT Secret Management

**Development:**
```javascript
// Temporary secret (DO NOT USE IN PRODUCTION)
const JWT_SECRET = 'temporary-secret-for-development-only';
```

**Production:**
```javascript
// Must be stored in HashiCorp Vault
const JWT_SECRET = await vault.read('secret/jwt-signing-key');
```

## Usage Examples

### Example 1: Basic Token Exchange

```javascript
// Fintech application backend
const response = await fetch('https://auth.openbanking.example.com/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    redirect_uri: 'http://localhost:3000/callback'
  })
});

const tokens = await response.json();

if (response.ok) {
  // Store tokens securely
  sessionStorage.setItem('access_token', tokens.access_token);
  sessionStorage.setItem('refresh_token', tokens.refresh_token);
  
  // Use access token for API requests
  const accounts = await fetchAccounts(tokens.access_token);
} else {
  console.error('Token exchange failed:', tokens.error);
}
```

### Example 2: Using Access Token

```javascript
async function fetchAccounts(accessToken) {
  const response = await fetch('https://api.openbanking.example.com/api/accounts', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (response.status === 401) {
    // Token expired or invalid
    // Attempt refresh or re-authorize
    return null;
  }
  
  return await response.json();
}
```

### Example 3: Error Handling

```javascript
async function exchangeCode(code) {
  try {
    const response = await fetch('/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      switch (data.error) {
        case 'invalid_grant':
          if (data.error_description.includes('expired')) {
            throw new Error('Authorization code expired. Please re-authorize.');
          } else if (data.error_description.includes('already been used')) {
            throw new Error('Security violation: Code reuse detected.');
          }
          break;
        case 'invalid_client':
          throw new Error('Invalid client credentials.');
        default:
          throw new Error(`Token exchange failed: ${data.error_description}`);
      }
    }
    
    return data;
  } catch (error) {
    console.error('Token exchange error:', error);
    throw error;
  }
}
```

## Testing

Comprehensive tests are available in [`tests/auth/token-exchange.test.js`](../tests/auth/token-exchange.test.js):

- Successful code exchange
- Authorization code reuse detection
- Client credentials validation
- Authorization code validation
- Grant type validation
- Token generation and verification
- Token expiration
- Complete exchange flow

Run tests:

```bash
npm test tests/auth/token-exchange.test.js
```

## Additional Endpoints

### Token Introspection (RFC 7662)

```http
POST /oauth/token/introspect
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "active": true,
  "scope": "accounts:read transactions:read",
  "client_id": "fintech-demo-client",
  "token_type": "Bearer",
  "exp": 1626363600,
  "iat": 1626360000,
  "sub": "CUST-001"
}
```

### Token Revocation (RFC 7009)

```http
POST /oauth/token/revoke
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```
HTTP/1.1 200 OK
```
