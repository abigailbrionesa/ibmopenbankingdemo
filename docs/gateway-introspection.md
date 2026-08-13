# Gateway Token Introspection

## Overview

The gateway token introspection system validates OAuth 2.0 access tokens before forwarding requests to protected banking APIs. This ensures that only valid, active tokens with proper authorization can access customer data.

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Fintech   │────────>│   Gateway    │────────>│  Banking    │
│     App     │  Token  │ Introspection│  Valid  │     API     │
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              │ Validate
                              ▼
                        ┌──────────────┐
                        │    Token     │
                        │   Exchange   │
                        │   Service    │
                        └──────────────┘
                              │
                              │ Check DB
                              ▼
                        ┌──────────────┐
                        │  PostgreSQL  │
                        │  (tokens,    │
                        │   consents)  │
                        └──────────────┘
```

## Token Validation Flow

### 1. Request Arrives at Gateway

```http
GET /api/v1/accounts HTTP/1.1
Host: gateway.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. Format Validation (Fast Path)

The gateway first performs quick format validation:

- **Check Authorization header exists**
- **Verify Bearer prefix**
- **Validate JWT structure** (3 parts separated by dots)
- **Check base64url encoding**

**Result**: Immediate 401 rejection for malformed tokens without database lookup.

### 3. Token Introspection

If format is valid, the gateway introspects the token:

```javascript
const introspection = await introspectToken(token);
```

#### Cache Check

1. Check in-memory cache for recent introspection result
2. If cached and not expired, return cached result
3. Otherwise, proceed to full validation

#### Full Validation

The introspection process validates:

- **JWT Signature**: Verify token was signed by authorization server
- **Expiration**: Check token hasn't expired (`exp` claim)
- **Database Status**: Verify token exists and is not revoked
- **Consent Status**: Check associated consent is still approved
- **Customer Context**: Validate customer_id is present

### 4. Introspection Response

#### Active Token Response

```json
{
  "active": true,
  "scope": "accounts:read transactions:read",
  "client_id": "fintech-app-123",
  "token_type": "Bearer",
  "exp": 1735920000,
  "iat": 1735916400,
  "sub": "customer-456",
  "customer_id": "customer-456",
  "consent_id": "consent-789",
  "token_id": "token-abc"
}
```

#### Inactive Token Response

```json
{
  "active": false,
  "error": "invalid_token",
  "error_description": "Token has been revoked"
}
```

### 5. Request Processing

#### Token Active

- Attach introspection result to request object
- Proceed to consent validation
- Forward to banking API if all checks pass

#### Token Inactive

- Return 401 Unauthorized immediately
- Include error details in response
- Do not forward request to banking API

## Validation Checks

### Format Validation

| Check | Failure Response | Status Code |
|-------|-----------------|-------------|
| Missing Authorization header | `unauthorized: Authorization header required` | 401 |
| Missing Bearer prefix | `unauthorized: Bearer token required` | 401 |
| Empty token | `unauthorized: Token cannot be empty` | 401 |
| Invalid JWT structure | `invalid_token: Invalid JWT format` | 401 |
| Invalid base64url encoding | `invalid_token: Invalid base64url encoding` | 401 |

### Token Introspection

| Check | Failure Response | Status Code |
|-------|-----------------|-------------|
| Invalid signature | `invalid_token: Invalid token signature` | 401 |
| Token expired | `invalid_token: Token has expired` | 401 |
| Token revoked | `invalid_token: Token has been revoked` | 401 |
| Consent revoked | `invalid_token: Associated consent has been revoked` | 401 |
| Database error | `server_error: Failed to validate token` | 500 |

## Caching Strategy

### Cache Configuration

- **Default TTL**: 5 minutes (300,000 ms)
- **Storage**: In-memory Map (production should use Redis)
- **Cache Key**: Raw token string
- **Cache Value**: Introspection result + expiration timestamp

### Cache Behavior

#### Positive Results (Active Tokens)

- Cached for full TTL
- Reduces database load for frequently used tokens
- Automatically expires after TTL

#### Negative Results (Inactive Tokens)

- Also cached for TTL
- Prevents repeated validation attempts for revoked tokens
- Reduces attack surface for token guessing

### Cache Invalidation

#### Explicit Invalidation

```javascript
// Invalidate specific token
invalidateToken(token);

// Clear all cached tokens
clearTokenCache();
```

#### Automatic Invalidation

- Cache entries expire after TTL
- Expired entries removed on next access
- No background cleanup process needed

### When to Invalidate

1. **Token Revocation**: Immediately invalidate when token is revoked
2. **Consent Revocation**: Invalidate all tokens for that consent
3. **Emergency**: Clear entire cache if security incident detected
4. **Testing**: Clear cache between test runs

## Integration Points

### Gateway Middleware

```javascript
const { gatewayTokenIntrospection } = require('./gateway/policies/token-introspection');

// Single middleware
app.get('/api/v1/accounts', 
  gatewayTokenIntrospection,
  accountsController.list
);

// Complete protection chain
const { gatewayProtection } = require('./gateway/policies/token-introspection');

app.get('/api/v1/accounts',
  ...gatewayProtection(), // Format + Introspection + Consent
  accountsController.list
);
```

### Token Exchange Service

The introspection module uses the token exchange service for validation:

```javascript
const { verifyAccessToken } = require('../../auth/oauth/token-exchange');

// Verify token signature, expiration, and database status
const verification = await verifyAccessToken(token);
```

### Consent Validation

After successful introspection, consent validation ensures:

- Consent is in `approved` status
- Consent has not been revoked
- Consent has not expired
- Consent includes required scopes

## Error Handling

### Client Errors (4xx)

#### 401 Unauthorized

Returned when token validation fails:

```json
{
  "error": "invalid_token",
  "error_description": "Token has expired"
}
```

**Common Causes**:
- Missing or malformed token
- Expired token
- Revoked token
- Invalid signature

**Client Action**: Obtain new token via authorization flow

#### 403 Forbidden

Returned when token is valid but lacks permission:

```json
{
  "error": "insufficient_scope",
  "error_description": "Token does not have required scope: transactions:read"
}
```

**Common Causes**:
- Token missing required scope
- Consent revoked
- Consent expired

**Client Action**: Request new authorization with required scopes

### Server Errors (5xx)

#### 500 Internal Server Error

Returned when validation process fails:

```json
{
  "error": "server_error",
  "error_description": "Failed to validate token"
}
```

**Common Causes**:
- Database connection failure
- Unexpected exception in validation logic

**Client Action**: Retry with exponential backoff

## Performance Considerations

### Cache Hit Rate

- **Target**: >80% cache hit rate for active tokens
- **Monitoring**: Track cache hits vs. misses
- **Tuning**: Adjust TTL based on token lifetime and usage patterns

### Database Load

- **Without Cache**: Every request queries database
- **With Cache**: Only cache misses query database
- **Reduction**: ~80% fewer database queries with good cache hit rate

### Response Time

| Scenario | Typical Response Time |
|----------|----------------------|
| Cache hit | <1ms |
| Cache miss (valid token) | 10-50ms |
| Cache miss (invalid token) | 5-30ms |
| Format validation failure | <1ms |

## Security Considerations

### Token Leakage

If a token is compromised:

1. **Immediate Revocation**: Call token revocation endpoint
2. **Cache Invalidation**: Explicitly invalidate cached token
3. **Consent Revocation**: Optionally revoke entire consent
4. **Monitoring**: Watch for suspicious usage patterns

### Replay Attacks

Mitigations:

- **Short Token Lifetime**: Tokens expire after 1 hour
- **Token Binding**: Tokens bound to specific client
- **Consent Binding**: Tokens bound to specific consent
- **Revocation**: Immediate invalidation when detected

### Cache Poisoning

Protections:

- **Cache Key**: Uses full token string (not derived value)
- **Cache Isolation**: Each token has separate cache entry
- **TTL Enforcement**: Automatic expiration prevents stale data
- **Validation**: Full validation on cache miss

## Monitoring and Observability

### Key Metrics

1. **Introspection Rate**: Requests per second
2. **Cache Hit Rate**: Percentage of cache hits
3. **Validation Failures**: Count by error type
4. **Response Time**: P50, P95, P99 latencies
5. **Cache Size**: Number of cached tokens

### Logging

#### Successful Introspection

```
INFO: Token introspection successful
  token_id: token-abc
  customer_id: customer-456
  client_id: fintech-app-123
  cache_hit: true
```

#### Failed Introspection

```
WARN: Token introspection failed
  error: invalid_token
  error_description: Token has expired
  token_id: token-abc
  cache_hit: false
```

### Alerting

Set up alerts for:

- **High Failure Rate**: >10% introspection failures
- **Cache Miss Rate**: <50% cache hit rate
- **Slow Responses**: P95 latency >100ms
- **Database Errors**: Any database connection failures

## Testing

### Unit Tests

Located in [`tests/gateway/token-introspection.test.js`](../tests/gateway/token-introspection.test.js):

- Format validation tests
- Introspection logic tests
- Cache behavior tests
- Error handling tests
- Middleware integration tests

### Running Tests

```bash
# Run all introspection tests
npm test tests/gateway/token-introspection.test.js

# Run with coverage
npm test -- --coverage tests/gateway/token-introspection.test.js

# Run specific test suite
npm test -- --testNamePattern="gatewayTokenIntrospection middleware"
```

### Test Coverage

Target coverage: >90% for all introspection code

Key test scenarios:
- ✅ Missing token returns 401
- ✅ Malformed token returns 401
- ✅ Expired token returns 401
- ✅ Revoked token returns 401
- ✅ Active token passes introspection
- ✅ Invalid signature rejected
- ✅ Cache hit avoids database query
- ✅ Cache miss performs validation

## Configuration

### Environment Variables

```bash
# Token cache TTL in milliseconds (default: 300000 = 5 minutes)
TOKEN_CACHE_TTL=300000

# Enable/disable token caching (default: true)
TOKEN_CACHE_ENABLED=true

# JWT secret for signature verification
JWT_SECRET=your-secret-key-here

# Database connection
DATABASE_URL=postgresql://user:pass@localhost:5432/openbanking
```

### Production Recommendations

1. **Use Redis for Caching**: Replace in-memory cache with Redis
2. **Adjust TTL**: Balance between performance and security
3. **Enable Monitoring**: Track all key metrics
4. **Set Up Alerts**: Monitor for anomalies
5. **Regular Audits**: Review introspection logs periodically

## API Reference

### introspectToken(token, useCache)

Introspect an OAuth access token.

**Parameters**:
- `token` (string): Access token to introspect
- `useCache` (boolean): Whether to use cache (default: true)

**Returns**: Promise<Object> - Introspection result

**Example**:
```javascript
const result = await introspectToken('eyJhbGci...');
if (result.active) {
  console.log('Token is valid for customer:', result.customer_id);
}
```

### gatewayTokenIntrospection(req, res, next)

Express middleware for token introspection.

**Attaches to Request**:
- `req.token_introspection`: Full introspection result
- `req.oauth_token`: Simplified token data

**Example**:
```javascript
app.get('/api/v1/accounts',
  gatewayTokenIntrospection,
  (req, res) => {
    const customerId = req.oauth_token.customer_id;
    // ... fetch accounts for customer
  }
);
```

### invalidateToken(token)

Invalidate a specific token in cache.

**Parameters**:
- `token` (string): Token to invalidate

**Example**:
```javascript
// After token revocation
await revokeToken(tokenId);
invalidateToken(token);
```

### clearTokenCache()

Clear all cached tokens.

**Example**:
```javascript
// Emergency cache clear
clearTokenCache();
console.log('All tokens invalidated');
```

### getCacheStats()

Get cache statistics.

**Returns**: Object with cache metrics

**Example**:
```javascript
const stats = getCacheStats();
console.log(`Cache size: ${stats.size}, TTL: ${stats.ttl}ms`);
```

## Related Documentation

- [OAuth 2.0 Implementation](./oauth-implementation.md)
- [Consent Management](./consent-management.md)
- [Banking APIs](./banking-apis.md)
- [Token Exchange](./token-exchange.md)
- [Security Architecture](./security-architecture.md)