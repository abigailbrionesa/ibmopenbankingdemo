# Complete Authorization Flow

## Overview

The complete authorization flow enforces the full security model for Open Banking API access: **valid token + correct scope + active consent**. All three conditions must be met for a request to succeed.

## Authorization Requirements

For any protected API call to succeed, the following must ALL be true:

1. **Valid Token**: OAuth access token must be valid, active, and not expired
2. **Correct Scope**: Token must have the scope required for the endpoint
3. **Active Consent**: Consent must be approved, not revoked, and not expired
4. **Consent Ownership**: Consent must belong to the customer, client, and include the required scope

## Architecture

```
┌─────────────┐
│   Request   │
│  with Token │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ 1. Token         │  ◄── Validates JWT signature, expiration
│    Introspection │      Checks database for revocation
└──────┬───────────┘      Returns 401 if invalid
       │
       │ Token Valid
       ▼
┌──────────────────┐
│ 2. Consent       │  ◄── Validates consent status (approved)
│    Validation    │      Checks expiration and revocation
└──────┬───────────┘      Validates consent belongs to customer/client
       │                  Returns 403 if invalid
       │ Consent Active
       ▼
┌──────────────────┐
│ 3. Scope         │  ◄── Validates token has required scope
│    Enforcement   │      Checks consent includes scope
└──────┬───────────┘      Returns 403 if insufficient
       │
       │ Scope Valid
       ▼
┌──────────────────┐
│ 4. API Handler   │  ◄── Process request
│                  │      Return data
└──────────────────┘
```

## Validation Steps

### Step 1: Token Introspection

**Purpose**: Validate the OAuth access token is valid and active

**Checks**:
- JWT signature is valid
- Token has not expired
- Token exists in database
- Token has not been revoked
- Associated consent has not been revoked

**Success**: Attach token payload to `req.oauth_token` and `req.token_introspection`

**Failure**: Return `401 Unauthorized`

```json
{
  "error": "invalid_token",
  "error_description": "Token has expired"
}
```

### Step 2: Consent Validation

**Purpose**: Validate the consent backing the token is still active

**Checks**:
- Consent exists in database
- Consent belongs to customer from token
- Consent belongs to client from token
- Consent status is `approved`
- Consent has not expired
- Token scopes do not exceed consent scopes

**Success**: Attach consent to `req.consent`

**Failure**: Return `403 Forbidden`

```json
{
  "error": "forbidden",
  "error_description": "Consent has been revoked",
  "consent_id": "consent-789",
  "status": "revoked"
}
```

### Step 3: Scope Enforcement

**Purpose**: Validate the token has the scope required for this endpoint

**Checks**:
- Identify required scope for endpoint
- Verify token includes required scope
- Verify consent includes required scope

**Success**: Proceed to API handler

**Failure**: Return `403 Forbidden`

```json
{
  "error": "insufficient_scope",
  "error_description": "This endpoint requires one of the following scopes: transactions:read",
  "required_scopes": ["transactions:read"],
  "granted_scopes": ["accounts:read"]
}
```

## Usage

### Basic Usage

Apply complete authorization to any protected endpoint:

```javascript
const { completeAuthorization } = require('./gateway/policies/complete-authorization');

app.get('/api/v1/accounts',
  ...completeAuthorization(),
  accountsController.list
);
```

### With Explicit Scope

Specify the required scope explicitly:

```javascript
const { completeAuthorizationWithScope } = require('./gateway/policies/complete-authorization');

app.get('/api/v1/accounts/:account_id/transactions',
  ...completeAuthorizationWithScope('transactions:read'),
  transactionsController.list
);
```

### With Logging

Include authorization success logging:

```javascript
const { completeAuthorizationWithLogging } = require('./gateway/policies/complete-authorization');

app.get('/api/v1/accounts',
  ...completeAuthorizationWithLogging(),
  accountsController.list
);
```

### Custom Chain

Build a custom authorization chain:

```javascript
const { createAuthorizationChain } = require('./gateway/policies/complete-authorization');

const customAuth = createAuthorizationChain({
  requireToken: true,
  requireConsent: true,
  requireScope: true,
  explicitScope: 'accounts:read',
  logging: true
});

app.get('/api/v1/accounts', ...customAuth, accountsController.list);
```

## Authorization Scenarios

### Scenario 1: Happy Path ✅

**Conditions**:
- Valid, active token
- Token has `accounts:read` scope
- Consent is approved and active
- Consent includes `accounts:read` scope

**Result**: Request succeeds, data returned

```http
GET /api/v1/accounts HTTP/1.1
Authorization: Bearer <valid-token>

HTTP/1.1 200 OK
{
  "accounts": [
    { "id": "acc-1", "balance": 1000 }
  ]
}
```

### Scenario 2: Missing Consent ❌

**Conditions**:
- Valid, active token
- Token has correct scope
- **Consent not found in database**

**Result**: Request fails with 403

```http
GET /api/v1/accounts HTTP/1.1
Authorization: Bearer <token-without-consent>

HTTP/1.1 403 Forbidden
{
  "error": "forbidden",
  "error_description": "Consent not found",
  "consent_id": "consent-789"
}
```

### Scenario 3: Expired Consent ❌

**Conditions**:
- Valid, active token
- Token has correct scope
- **Consent has expired**

**Result**: Request fails with 403

```http
GET /api/v1/accounts HTTP/1.1
Authorization: Bearer <token-with-expired-consent>

HTTP/1.1 403 Forbidden
{
  "error": "forbidden",
  "error_description": "Consent has expired",
  "consent_id": "consent-789",
  "status": "expired",
  "expired_at": "2026-08-01T00:00:00Z"
}
```

### Scenario 4: Revoked Consent ❌

**Conditions**:
- Valid, active token
- Token has correct scope
- **Consent has been revoked**

**Result**: Request fails with 403

```http
GET /api/v1/accounts HTTP/1.1
Authorization: Bearer <token-with-revoked-consent>

HTTP/1.1 403 Forbidden
{
  "error": "forbidden",
  "error_description": "Consent has been revoked",
  "consent_id": "consent-789",
  "status": "revoked"
}
```

### Scenario 5: Insufficient Scope ❌

**Conditions**:
- Valid, active token
- **Token only has `accounts:read`**
- Consent is approved and active
- Endpoint requires `transactions:read`

**Result**: Request fails with 403

```http
GET /api/v1/accounts/acc-123/transactions HTTP/1.1
Authorization: Bearer <token-with-accounts-read-only>

HTTP/1.1 403 Forbidden
{
  "error": "insufficient_scope",
  "error_description": "This endpoint requires one of the following scopes: transactions:read",
  "required_scopes": ["transactions:read"],
  "granted_scopes": ["accounts:read"]
}
```

### Scenario 6: Token Scope Exceeds Consent ❌

**Conditions**:
- Valid, active token
- **Token has `accounts:read transactions:read`**
- Consent is approved and active
- **Consent only includes `accounts:read`**

**Result**: Request fails with 403

```http
GET /api/v1/accounts HTTP/1.1
Authorization: Bearer <token-with-extra-scopes>

HTTP/1.1 403 Forbidden
{
  "error": "forbidden",
  "error_description": "Token scopes exceed consent scopes",
  "consent_id": "consent-789",
  "unauthorized_scopes": ["transactions:read"],
  "granted_scopes": ["accounts:read"]
}
```

## Error Response Matrix

| Condition | Status Code | Error Code | Description |
|-----------|-------------|------------|-------------|
| Missing token | 401 | `unauthorized` | Authorization header required |
| Invalid token | 401 | `invalid_token` | Token signature invalid or expired |
| Revoked token | 401 | `invalid_token` | Token has been revoked |
| Missing consent | 403 | `forbidden` | Consent not found |
| Expired consent | 403 | `forbidden` | Consent has expired |
| Revoked consent | 403 | `forbidden` | Consent has been revoked |
| Denied consent | 403 | `forbidden` | Consent was denied |
| Insufficient scope | 403 | `insufficient_scope` | Token lacks required scope |
| Scope mismatch | 403 | `forbidden` | Token scopes exceed consent |

## Authorization Context

After successful authorization, the request object contains:

```javascript
req.oauth_token = {
  customer_id: 'customer-456',
  client_id: 'fintech-app-123',
  consent_id: 'consent-789',
  token_id: 'token-abc',
  scope: 'accounts:read transactions:read'
};

req.token_introspection = {
  active: true,
  scope: 'accounts:read transactions:read',
  client_id: 'fintech-app-123',
  token_type: 'Bearer',
  exp: 1735920000,
  iat: 1735916400,
  sub: 'customer-456',
  customer_id: 'customer-456',
  consent_id: 'consent-789',
  token_id: 'token-abc'
};

req.consent = {
  consent_id: 'consent-789',
  customer_id: 'customer-456',
  client_id: 'fintech-app-123',
  status: 'approved',
  expires_at: '2027-08-13T00:00:00Z',
  granted_scopes: 'accounts:read transactions:read'
};

req.authorization_summary = {
  customer_id: 'customer-456',
  client_id: 'fintech-app-123',
  consent_id: 'consent-789',
  token_scopes: ['accounts:read', 'transactions:read'],
  consent_scopes: ['accounts:read', 'transactions:read'],
  consent_status: 'approved',
  consent_expires_at: '2027-08-13T00:00:00Z',
  authorized_at: '2026-08-13T15:00:00.000Z'
};
```

## Utility Functions

### validateAuthorizationContext(req)

Check if request has passed all authorization checks:

```javascript
const { validateAuthorizationContext } = require('./gateway/policies/complete-authorization');

const validation = validateAuthorizationContext(req);
if (!validation.valid) {
  console.error('Authorization incomplete:', validation.errors);
}
```

### getAuthorizationDetails(req)

Extract structured authorization information:

```javascript
const { getAuthorizationDetails } = require('./gateway/policies/complete-authorization');

const details = getAuthorizationDetails(req);
console.log('Authorized for customer:', details.customer_id);
console.log('Token scopes:', details.token_scopes);
console.log('Consent expires:', details.consent_expires_at);
```

## Security Logging

### Authorization Success

Successful authorizations are logged with full context:

```json
{
  "event": "authorization_success",
  "timestamp": "2026-08-13T15:00:00.000Z",
  "method": "GET",
  "path": "/api/v1/accounts",
  "customer_id": "customer-456",
  "client_id": "fintech-app-123",
  "consent_id": "consent-789",
  "scopes": ["accounts:read"],
  "ip_address": "192.168.1.100",
  "user_agent": "FintechApp/1.0"
}
```

### Authorization Failure

Failures are logged at each validation step (see individual component docs):
- Token introspection failures → See [Gateway Introspection](./gateway-introspection.md)
- Consent validation failures → See [Consent Management](./consent-management.md)
- Scope enforcement failures → See [Scope Enforcement](./scope-enforcement.md)

## Testing

### Test Coverage

Located in [`tests/gateway/complete-authorization.test.js`](../tests/gateway/complete-authorization.test.js):

- ✅ Valid token + scope + active consent returns data
- ✅ Valid token + scope without consent returns 403
- ✅ Valid token + scope with expired consent returns 403
- ✅ Valid token + scope with revoked consent returns 403
- ✅ Token scope exceeds consent scope returns 403
- ✅ Authorization context validation
- ✅ Authorization details extraction
- ✅ Custom authorization chains

### Running Tests

```bash
# Run all complete authorization tests
npm test tests/gateway/complete-authorization.test.js

# Run with coverage
npm test -- --coverage tests/gateway/complete-authorization.test.js

# Run specific test suite
npm test -- --testNamePattern="Happy Path"
```

## Performance Considerations

### Validation Overhead

| Step | Typical Time | Cacheable |
|------|--------------|-----------|
| Token introspection | <1ms (cached) / 10-50ms (uncached) | Yes |
| Consent validation | 10-30ms (database query) | Possible |
| Scope enforcement | <1ms (in-memory check) | N/A |
| **Total** | **<5ms (cached) / 20-80ms (uncached)** | - |

### Optimization Strategies

1. **Token Caching**: Introspection results cached for 5 minutes
2. **Database Indexing**: Ensure indexes on `consent_id`, `customer_id`, `client_id`
3. **Connection Pooling**: Reuse database connections
4. **Early Rejection**: Fast-path rejection for obvious failures

## Best Practices

### 1. Always Use Complete Authorization

Never rely on just token validation or just scope checking:

```javascript
// ❌ Bad: Only token validation
app.get('/api/v1/accounts',
  requireOAuthToken,
  accountsController.list
);

// ✅ Good: Complete authorization
app.get('/api/v1/accounts',
  ...completeAuthorization(),
  accountsController.list
);
```

### 2. Apply to All Protected Endpoints

Every endpoint that accesses customer data must use complete authorization:

```javascript
// Apply to all routes
app.use('/api/v1/*', ...completeAuthorization());

// Or apply per route
app.get('/api/v1/accounts', ...completeAuthorization(), handler);
app.get('/api/v1/transactions', ...completeAuthorization(), handler);
```

### 3. Log Authorization Events

Enable logging for security monitoring:

```javascript
app.get('/api/v1/accounts',
  ...completeAuthorizationWithLogging(),
  accountsController.list
);
```

### 4. Handle Errors Gracefully

Provide clear error messages to clients:

```javascript
app.use((err, req, res, next) => {
  if (err.name === 'AuthorizationError') {
    return res.status(403).json({
      error: 'forbidden',
      error_description: err.message,
      details: err.details
    });
  }
  next(err);
});
```

### 5. Monitor Authorization Metrics

Track key metrics:
- Authorization success rate
- Failure reasons (token, consent, scope)
- Response times
- Cache hit rates

## Compliance

### PSD2 Requirements

Complete authorization helps meet PSD2 requirements:
- **Strong Customer Authentication**: Token validation
- **Explicit Consent**: Consent validation
- **Granular Access**: Scope enforcement
- **Audit Trail**: Comprehensive logging

### GDPR Requirements

Supports GDPR principles:
- **Lawful Basis**: Consent validation
- **Purpose Limitation**: Scope enforcement
- **Data Minimization**: Granular scopes
- **Accountability**: Complete audit trail

## Troubleshooting

### Issue: 403 on Valid Request

**Diagnosis**:
1. Check token: `jwt.io` or introspection endpoint
2. Check consent: Query database for consent status
3. Check scopes: Compare token scopes vs consent scopes vs required scopes

**Common Causes**:
- Consent expired or revoked
- Token scopes don't match consent
- Endpoint requires different scope

### Issue: Slow Authorization

**Diagnosis**:
1. Check cache hit rate
2. Monitor database query times
3. Review connection pool settings

**Solutions**:
- Increase cache TTL
- Add database indexes
- Increase connection pool size

## API Reference

### completeAuthorization()

Returns middleware chain for complete authorization.

**Returns**: Function[]

**Usage**:
```javascript
app.get('/api/v1/accounts', ...completeAuthorization(), handler);
```

### completeAuthorizationWithScope(scopes)

Returns middleware chain with explicit scope requirement.

**Parameters**:
- `scopes` (string|string[]): Required scope(s)

**Returns**: Function[]

**Usage**:
```javascript
app.get('/api/v1/accounts',
  ...completeAuthorizationWithScope('accounts:read'),
  handler
);
```

### createAuthorizationChain(options)

Create custom authorization chain.

**Parameters**:
- `options.requireToken` (boolean): Require token validation
- `options.requireConsent` (boolean): Require consent validation
- `options.requireScope` (boolean): Require scope enforcement
- `options.explicitScope` (string|string[]): Explicit scope requirement
- `options.logging` (boolean): Enable logging

**Returns**: Function[]

**Usage**:
```javascript
const chain = createAuthorizationChain({
  requireToken: true,
  requireConsent: true,
  requireScope: true,
  logging: true
});
```