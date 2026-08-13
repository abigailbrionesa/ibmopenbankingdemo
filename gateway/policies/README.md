# API Gateway Policies

This directory contains policy configurations and middleware for the API gateway.

## Purpose

Defines policies for:
- **Authentication and authorization** - OAuth token validation and introspection
- **Consent validation** - Ensuring tokens have valid, active consents
- **Scope enforcement** - Verifying tokens have required scopes
- **Rate limiting and throttling** - Protecting APIs from abuse
- **Request/response transformation** - Modifying requests/responses
- **Caching strategies** - Performance optimization
- **Error handling** - Consistent error responses

## Available Policies

### Token Introspection

**File**: [`token-introspection.js`](./token-introspection.js)

Validates OAuth 2.0 access tokens before forwarding requests to protected APIs.

**Features**:
- JWT signature verification
- Token expiration checking
- Database status validation
- In-memory caching (5-minute TTL)
- Fast format validation
- Comprehensive error handling

**Usage**:
```javascript
const { gatewayTokenIntrospection } = require('./gateway/policies/token-introspection');

app.get('/api/v1/accounts',
  gatewayTokenIntrospection,
  accountsController.list
);
```

**Documentation**: See [`docs/gateway-introspection.md`](../../docs/gateway-introspection.md)

### OAuth Middleware

**File**: [`oauth-middleware.js`](./oauth-middleware.js)

Provides OAuth token validation and scope enforcement middleware.

**Features**:
- Bearer token extraction
- Token verification via token exchange service
- Scope-based authorization
- Customer context attachment

**Usage**:
```javascript
const { requireOAuthToken, requireScope } = require('./gateway/policies/oauth-middleware');

app.get('/api/v1/accounts',
  requireOAuthToken(),
  requireScope('accounts:read'),
  accountsController.list
);
```

### Consent Validation

**File**: [`consent-validation.js`](./consent-validation.js)

Validates that tokens have active, approved consents with required scopes.

**Features**:
- Consent status checking (approved, not revoked, not expired)
- Scope validation against consent
- Automatic 403 responses for invalid consents
- Integration with consent lifecycle

**Usage**:
```javascript
const { validateConsent, requireConsentScope } = require('./gateway/policies/consent-validation');

app.get('/api/v1/accounts',
  requireOAuthToken(),
  validateConsent,
  requireConsentScope('accounts:read'),
  accountsController.list
);
```

## Complete Protection Chain

For maximum security, use the complete protection chain:

```javascript
const { gatewayProtection } = require('./gateway/policies/token-introspection');

app.get('/api/v1/accounts',
  ...gatewayProtection(), // Format + Introspection + Consent
  requireConsentScope('accounts:read'),
  accountsController.list
);
```

This applies:
1. **Format validation** - Fast rejection of malformed tokens
2. **Token introspection** - Full validation with caching
3. **Consent validation** - Ensure consent is active and approved
4. **Scope validation** - Verify required scopes are present

## Policy Execution Order

Policies should be applied in this order for optimal performance and security:

1. **Format Validation** (fastest, rejects obviously invalid requests)
2. **Token Introspection** (validates token is active and valid)
3. **Consent Validation** (ensures consent is approved and active)
4. **Scope Validation** (verifies specific permissions)
5. **Business Logic** (your API endpoint handler)

## Error Responses

All policies follow consistent error response formats:

### 401 Unauthorized

Token validation failed:
```json
{
  "error": "invalid_token",
  "error_description": "Token has expired"
}
```

### 403 Forbidden

Token valid but lacks permission:
```json
{
  "error": "insufficient_scope",
  "error_description": "Token does not have required scope: transactions:read"
}
```

### 500 Internal Server Error

Server-side validation error:
```json
{
  "error": "server_error",
  "error_description": "Failed to validate token"
}
```

## Testing

Tests for gateway policies are located in [`tests/gateway/`](../../tests/gateway/):

- [`token-introspection.test.js`](../../tests/gateway/token-introspection.test.js) - Token introspection tests
- [`oauth-middleware.test.js`](../../tests/gateway/oauth-middleware.test.js) - OAuth middleware tests
- [`consent-validation.test.js`](../../tests/gateway/consent-validation.test.js) - Consent validation tests

Run tests:
```bash
npm test tests/gateway/
```

## Performance Considerations

### Caching

Token introspection uses in-memory caching with 5-minute TTL:
- **Cache Hit**: <1ms response time
- **Cache Miss**: 10-50ms (includes database query)
- **Target Hit Rate**: >80%

### Database Queries

With caching enabled:
- ~80% reduction in database queries
- Lower latency for repeated requests
- Better scalability under load

### Production Recommendations

1. **Use Redis**: Replace in-memory cache with Redis for distributed caching
2. **Monitor Cache Hit Rate**: Track and optimize cache performance
3. **Adjust TTL**: Balance between performance and security requirements
4. **Enable Connection Pooling**: Optimize database connections

## Security Best Practices

1. **Always validate tokens** - Never trust client-provided tokens without validation
2. **Check consent status** - Ensure consent hasn't been revoked
3. **Enforce scopes** - Validate tokens have required permissions
4. **Use HTTPS** - Protect tokens in transit
5. **Short token lifetime** - Limit exposure window (1 hour default)
6. **Immediate revocation** - Invalidate cache when tokens/consents are revoked
7. **Monitor for anomalies** - Track validation failures and suspicious patterns
