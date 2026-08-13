# OAuth Client Registration API

This document describes the OAuth client registration system for fintech applications to register as API consumers.

## Overview

The client registration system allows third-party fintech applications to register and receive OAuth 2.0 credentials for accessing the Open Banking APIs.

## Registration Process

### 1. Submit Registration Request

**Endpoint:** `POST /oauth/register`

**Request Body:**
```json
{
  "name": "My Fintech App",
  "redirect_uris": [
    "https://app.example.com/callback"
  ],
  "requested_scopes": [
    "accounts:read",
    "transactions:read"
  ],
  "description": "Personal finance management application",
  "contact_email": "dev@example.com",
  "website_url": "https://example.com"
}
```

**Required Fields:**
- `name` (string): Human-readable application name
- `redirect_uris` (array): One or more OAuth callback URIs
- `requested_scopes` (array): OAuth scopes being requested

**Optional Fields:**
- `description` (string): Application description
- `contact_email` (string): Developer contact email
- `website_url` (string): Application website

### 2. Successful Registration Response

```json
{
  "success": true,
  "client_id": "client_a1b2c3d4e5f6...",
  "client_secret": "dGhpc19pc19hX3NlY3JldA...",
  "name": "My Fintech App",
  "redirect_uris": [
    "https://app.example.com/callback"
  ],
  "allowed_scopes": [
    "accounts:read",
    "transactions:read"
  ],
  "status": "active",
  "created_at": "2026-08-13T14:00:00.000Z",
  "warning": "Store client_secret securely. It will not be shown again."
}
```

**IMPORTANT:** The `client_secret` is only returned once during registration. Store it securely in your backend. It will never be displayed again.

### 3. Error Response

```json
{
  "success": false,
  "error": "Invalid redirect URI(s)",
  "invalid_uris": [
    "http://insecure.example.com/callback"
  ]
}
```

## Supported Scopes

The following OAuth scopes are supported:

| Scope | Description |
|-------|-------------|
| `accounts:read` | Read customer account information |
| `transactions:read` | Read transaction history |
| `balances:read` | Read account balances |
| `profile:read` | Read customer profile information |

## Redirect URI Requirements

### Production Environment
- **MUST** use HTTPS protocol
- **MUST NOT** contain URL fragments (#)
- **MUST** be a valid, absolute URL

### Development Environment
- **MAY** use HTTP for localhost only
- Example: `http://localhost:3000/callback`

### Invalid Examples
```
❌ http://app.example.com/callback  (HTTP in production)
❌ https://app.example.com/callback#fragment  (contains fragment)
❌ /callback  (relative URL)
❌ not-a-url  (malformed)
```

### Valid Examples
```
✅ https://app.example.com/callback
✅ https://app.example.com/oauth/callback
✅ http://localhost:3000/callback  (dev only)
✅ https://staging.example.com/callback
```

## Security Best Practices

### Client Secret Storage

**DO:**
- ✅ Store `client_secret` in environment variables
- ✅ Store `client_secret` in HashiCorp Vault or similar
- ✅ Store `client_secret` in secure backend configuration
- ✅ Use `client_secret` only in backend/server code

**DON'T:**
- ❌ Store `client_secret` in frontend code
- ❌ Commit `client_secret` to version control
- ❌ Expose `client_secret` in client-side JavaScript
- ❌ Log `client_secret` in application logs
- ❌ Include `client_secret` in error messages

### Example: Secure Storage

```javascript
// ✅ CORRECT: Backend environment variable
const clientSecret = process.env.OAUTH_CLIENT_SECRET;

// ✅ CORRECT: Vault retrieval
const { client_secret } = await vault.retrieveClientCredentials(clientId);

// ❌ WRONG: Hardcoded in source
const clientSecret = 'dGhpc19pc19hX3NlY3JldA...';

// ❌ WRONG: Frontend code
const config = {
  clientSecret: 'dGhpc19pc19hX3NlY3JldA...'
};
```

## Validation Rules

### Application Name
- Required
- Must not be empty or whitespace only
- Maximum 255 characters

### Redirect URIs
- At least one URI required
- Each URI must be valid and absolute
- HTTPS required in production (except localhost)
- No URL fragments allowed

### Scopes
- At least one scope required
- All scopes must be from supported list
- Invalid scopes will be rejected

## Error Codes

| Error | Description |
|-------|-------------|
| `Application name is required` | Name field missing or empty |
| `At least one redirect URI is required` | No redirect URIs provided |
| `Invalid redirect URI(s)` | One or more URIs failed validation |
| `At least one scope must be requested` | No scopes provided |
| `Unsupported scopes` | One or more invalid scopes requested |
| `Internal server error` | Database or system error |

## Testing

### Running Tests

```bash
# Run all client registration tests
npm test tests/auth/client-registration.test.js

# Run specific test suite
npm test -- --testNamePattern="Valid Registration"
```

### Test Coverage

The test suite covers:
- ✅ Successful registration with valid data
- ✅ Registration with all supported scopes
- ✅ Multiple redirect URIs
- ✅ Localhost URIs in development
- ✅ Invalid redirect URI rejection
- ✅ Unsupported scope rejection
- ✅ Missing required fields
- ✅ Security validations

## Integration Example

### Step 1: Register Your Application

```javascript
const axios = require('axios');

async function registerApp() {
  const response = await axios.post('https://api.bank.example.com/oauth/register', {
    name: 'My Fintech App',
    redirect_uris: ['https://myapp.example.com/callback'],
    requested_scopes: ['accounts:read', 'transactions:read'],
    description: 'Personal finance management',
    contact_email: 'dev@myapp.example.com'
  });
  
  if (response.data.success) {
    // IMPORTANT: Store these securely!
    const { client_id, client_secret } = response.data;
    
    // Store in environment variables or vault
    await storeCredentials(client_id, client_secret);
    
    console.log('Registration successful!');
    console.log('Client ID:', client_id);
    console.log('WARNING: client_secret will not be shown again');
  }
}
```

### Step 2: Use Credentials for OAuth Flow

```javascript
// Initiate OAuth authorization
const authUrl = `https://api.bank.example.com/oauth/authorize?` +
  `client_id=${clientId}&` +
  `redirect_uri=${encodeURIComponent(redirectUri)}&` +
  `scope=${encodeURIComponent('accounts:read transactions:read')}&` +
  `response_type=code&` +
  `state=${generateState()}`;

// Redirect user to authUrl
```

## Credential Rotation

To rotate your client secret:

1. Contact support or use the credential rotation endpoint
2. Receive new `client_secret`
3. Update your backend configuration
4. Old secret remains valid for 24 hours
5. After 24 hours, old secret is revoked

## Support

For registration issues or questions:
- Email: api-support@bank.example.com
- Documentation: https://developer.bank.example.com
- Status: https://status.bank.example.com

## Compliance

This registration system complies with:
- OAuth 2.0 RFC 6749
- OAuth 2.0 Dynamic Client Registration Protocol (RFC 7591)
- Open Banking Security Profile
- PCI DSS requirements for credential storage