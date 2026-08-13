# Gateway Policies

This directory contains middleware policies for API gateway authorization and security.

## Overview

Gateway policies enforce security controls for protected API endpoints, including OAuth token validation, consent verification, scope enforcement, and comprehensive audit logging.

## Available Policies

### Rate Limiting

#### [`rate-limiter.js`](./rate-limiter.js)
Per-client rate limiting to prevent abuse and ensure fair resource allocation.

**Key Functions:**
- `rateLimitMiddleware()` - Standard rate limiting middleware
- `createRateLimiter(options)` - Create custom rate limiter
- `getRateLimitStatus(clientId)` - Get rate limit status
- `resetRateLimit(clientId)` - Reset rate limit for client
- `getRateLimitStats()` - Get rate limiting statistics

**Configuration:**
- Default: 100 requests/minute/client
- Test mode: 10 requests/10 seconds/client
- Configurable via environment variables

**Features:**
- Per-client isolation (one client cannot affect others)
- Sliding window algorithm for accurate limiting
- Standard rate limit headers (X-RateLimit-*)
- 429 Too Many Requests responses
- Automatic audit logging of denials

**Audit Integration:**
- Logs denied requests with reason `rate_limit_exceeded`
- Includes rate limit status in metadata
- Tracks client_id for analysis

### Core Authorization Policies

#### [`oauth-middleware.js`](./oauth-middleware.js)
OAuth 2.0 middleware for token validation and scope enforcement.

**Key Functions:**
- `requireOAuthToken()` - Validates OAuth access tokens
- `requireScope(scope)` - Enforces specific scope requirement
- `requireAnyScope(scopes)` - Enforces any of multiple scopes
- `protectWithScope(scope)` - Complete protection with scope
- `logApiAccess()` - Legacy API access logging

#### [`token-introspection.js`](./token-introspection.js)
Token introspection and validation at the gateway level.

**Key Functions:**
- `introspectToken(token)` - Introspect and validate token
- `gatewayTokenIntrospection()` - Middleware for token introspection
- `validateTokenFormat()` - Quick token format validation
- `gatewayProtection()` - Complete gateway protection chain

**Audit Integration:**
- Logs denied requests for invalid, expired, or malformed tokens
- Logs denied requests for missing authorization headers
- Captures token validation failures with specific reasons

#### [`consent-validation.js`](./consent-validation.js)
Validates consent status before allowing API access.

**Key Functions:**
- `validateConsent()` - Validates consent is active and approved
- `requireConsentScope(scope)` - Validates consent includes required scope
- `checkConsentStatus(consent_id)` - Check consent status utility
- `batchCheckConsentStatus(consent_ids)` - Batch consent checking

**Audit Integration:**
- Logs denied requests for missing consents
- Logs denied requests for revoked consents
- Logs denied requests for expired consents
- Logs denied requests for denied consents
- Logs denied requests for scope mismatches

#### [`scope-enforcement.js`](./scope-enforcement.js)
Maps OAuth scopes to API endpoints and enforces access control.

**Key Functions:**
- `enforceEndpointScopes()` - Automatic scope enforcement based on endpoint
- `requireEndpointScope(scopes)` - Explicit scope requirement
- `getRequiredScopes(method, path)` - Get scopes for endpoint
- `hasRequiredScope(tokenScopes, requiredScopes)` - Check scope match

**Audit Integration:**
- Logs denied requests for insufficient scopes
- Captures granted vs. required scope details
- Stores required scope information for audit trail

**Rate Limiting Integration:**
- Rate limiting occurs after token validation
- Before consent and scope checks
- Ensures authenticated clients only

#### [`complete-authorization.js`](./complete-authorization.js)
Unified authorization middleware combining all checks.

**Key Functions:**
- `completeAuthorization()` - Full authorization chain with audit logging
- `completeAuthorizationWithScope(scopes)` - Authorization with explicit scope
- `completeAuthorizationWithLogging()` - Authorization with enhanced logging
- `validateAuthorizationContext(req)` - Validate authorization state
- `getAuthorizationDetails(req)` - Extract authorization information

**Audit Integration:**
- Automatically logs all allowed requests after successful authorization
- Integrates with all denial logging from upstream middleware
- Provides authorization summary for audit context

**Rate Limiting Integration:**
- Rate limiting is included in all authorization chains
- Applied after token validation, before consent checks
- Can be disabled via `createAuthorizationChain({ requireRateLimit: false })`

### Audit Logging

#### [`audit-logger.js`](./audit-logger.js)
Comprehensive audit logging for all authorization events.

**Key Functions:**
- `logAuditEvent(event)` - Log any audit event
- `logAllowedRequest(req, httpStatus)` - Log successful authorization
- `logDeniedRequest(req, reason, httpStatus, context)` - Log failed authorization
- `auditAllowedRequest()` - Middleware for allowed request logging
- `queryAuditLogs(filters)` - Query audit logs
- `getAuditStatistics(filters)` - Get audit statistics

**Denial Reasons:**
- `INVALID_TOKEN` - Token is invalid
- `EXPIRED_TOKEN` - Token has expired
- `MISSING_TOKEN` - No token provided
- `MALFORMED_TOKEN` - Token format invalid
- `INSUFFICIENT_SCOPE` - Lacks required scope
- `MISSING_CONSENT` - No consent found
- `REVOKED_CONSENT` - Consent revoked
- `EXPIRED_CONSENT` - Consent expired
- `DENIED_CONSENT` - Consent denied
- `SCOPE_MISMATCH` - Token scopes exceed consent
- `RATE_LIMIT_EXCEEDED` - Rate limit hit
- `UNAUTHORIZED` - Generic failure

**Features:**
- Database-backed audit trail
- Real-time console logging
- Queryable audit history
- Statistical analysis
- Compliance support (PSD2, GDPR, SOC 2)

## Usage Examples

### Basic Protection with Audit Logging

```javascript
const { completeAuthorization } = require('./gateway/policies/complete-authorization');

// Automatically logs both allowed and denied requests
app.get('/api/v1/accounts', completeAuthorization(), (req, res) => {
  // Your route handler
  res.json({ accounts: [] });
});
```

### Protection with Specific Scope

```javascript
const { completeAuthorizationWithScope } = require('./gateway/policies/complete-authorization');

// Logs allowed/denied with scope context
app.get('/api/v1/transactions', 
  completeAuthorizationWithScope('transactions:read'), 
  (req, res) => {
    res.json({ transactions: [] });
  }
);
```

### Manual Audit Logging

```javascript
const { logDeniedRequest, DENIAL_REASONS } = require('./gateway/policies/audit-logger');

// Custom denial logging
if (rateLimitExceeded) {
  await logDeniedRequest(req, DENIAL_REASONS.RATE_LIMIT_EXCEEDED, 429);
  return res.status(429).json({ error: 'rate_limit_exceeded' });
}
```

### Querying Audit Logs

```javascript
const { queryAuditLogs, getAuditStatistics } = require('./gateway/policies/audit-logger');

// Get recent denied requests
const deniedRequests = await queryAuditLogs({
  authorization: 'denied',
  limit: 100
});

// Get statistics for a customer
const stats = await getAuditStatistics({
  customer_id: 'cust-123',
  start_date: new Date('2024-01-01')
});

console.log(`Total: ${stats.total_events}`);
console.log(`Allowed: ${stats.allowed_count}`);
console.log(`Denied: ${stats.denied_count}`);
```

## Authorization Flow with Audit Logging and Rate Limiting

```
1. Request arrives at gateway
   ↓
2. Token Introspection (token-introspection.js)
   - Validates token format
   - Verifies token signature
   - Checks token expiration
   → DENIED: Logs with reason (invalid_token, expired_token, etc.)
   ↓
3. Rate Limiting (rate-limiter.js) ← NEW
   - Checks request count for client
   - Compares against configured limit
   → DENIED: Returns 429, logs with reason (rate_limit_exceeded)
   ↓
4. Consent Validation (consent-validation.js)
   - Checks consent exists
   - Verifies consent is approved
   - Validates consent not expired
   - Checks consent not revoked
   → DENIED: Logs with reason (missing_consent, revoked_consent, etc.)
   ↓
5. Scope Enforcement (scope-enforcement.js)
   - Determines required scope for endpoint
   - Validates token has required scope
   → DENIED: Logs with reason (insufficient_scope)
   ↓
6. Authorization Success
   - Logs allowed request with full context
   - Proceeds to route handler
```

## Audit Event Structure

### Allowed Request
```json
{
  "audit_id": 1,
  "timestamp": "2024-01-15T10:30:00Z",
  "endpoint": "/api/v1/accounts",
  "method": "GET",
  "client_id": "fintech-app-123",
  "customer_id": "cust-456",
  "consent_id": "consent-789",
  "scope": "accounts:read",
  "required_scope": "accounts:read",
  "authorization": "allowed",
  "reason": null,
  "http_status": 200
}
```

### Denied Request
```json
{
  "audit_id": 2,
  "timestamp": "2024-01-15T10:35:00Z",
  "endpoint": "/api/v1/accounts",
  "method": "GET",
  "client_id": "fintech-app-123",
  "customer_id": "cust-456",
  "consent_id": "consent-789",
  "scope": "accounts:read",
  "required_scope": "transactions:read",
  "authorization": "denied",
  "reason": "insufficient_scope",
  "http_status": 403,
  "metadata": {
    "granted_scopes": ["accounts:read"],
    "required_scopes": ["transactions:read"]
  }
}
```

## Testing

```bash
# Run policy tests
npm test tests/gateway/

# Run audit logging tests
npm test tests/gateway/audit-logger.test.js

# Run integration tests
npm test tests/integration/audit-logging.test.js
```

## Performance Considerations

- Audit logging is asynchronous and non-blocking
- Database writes do not delay request processing
- Failures in audit logging do not affect authorization
- Indexes optimize common query patterns
- Consider batch processing for high-volume systems

## Security Best Practices

1. **Access Control**: Restrict audit log access to authorized personnel
2. **Data Retention**: Implement retention policies per compliance requirements
3. **Monitoring**: Set up alerts for unusual patterns
4. **Privacy**: Handle audit data according to privacy regulations
5. **Integrity**: Protect audit logs from tampering

## Related Documentation

- [Audit Logging](../../docs/audit-logging.md) - Comprehensive audit logging guide
- [Rate Limiting](../../docs/rate-limiting.md) - Per-client rate limiting guide
- [Complete Authorization](../../docs/complete-authorization.md) - Authorization flow
- [Scope Enforcement](../../docs/scope-enforcement.md) - Scope validation
- [Consent Model](../../docs/consent-model.md) - Consent management

## Made with Bob
