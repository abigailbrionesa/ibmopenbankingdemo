# Rate Limiting

## Overview

The rate limiting system provides per-client request throttling to prevent abuse, ensure fair resource allocation, and demonstrate that the API gateway is an active enforcement point, not just a reverse proxy.

## Features

- **Per-Client Isolation**: Rate limits are tracked separately for each OAuth client
- **Sliding Window**: Uses a sliding window algorithm for accurate rate limiting
- **Configurable Limits**: Supports environment-based configuration
- **Audit Integration**: Rate limit denials are logged to the audit trail
- **Standard Headers**: Returns standard rate limit headers (X-RateLimit-*)
- **429 Responses**: Returns proper HTTP 429 Too Many Requests status

## Configuration

### Default Limits

- **Production**: 100 requests per minute per client
- **Test Mode**: 10 requests per 10 seconds per client

### Environment Variables

```bash
# Production configuration
RATE_LIMIT_REQUESTS=100          # Max requests per window
RATE_LIMIT_WINDOW_MS=60000       # Window size in milliseconds (1 minute)

# Test configuration
RATE_LIMIT_TEST_REQUESTS=10      # Max requests for testing
RATE_LIMIT_TEST_WINDOW_MS=10000  # Test window (10 seconds)
RATE_LIMIT_TEST_MODE=true        # Enable test mode
```

## Usage

### Automatic Integration

Rate limiting is automatically included in the complete authorization chain:

```javascript
const { completeAuthorization } = require('./gateway/policies/complete-authorization');

// Rate limiting is automatically applied
app.get('/api/v1/accounts', completeAuthorization(), (req, res) => {
  res.json({ accounts: [] });
});
```

### Custom Rate Limits

Create a rate limiter with custom configuration:

```javascript
const { createRateLimiter } = require('./gateway/policies/rate-limiter');

// Custom rate limit: 50 requests per 30 seconds
const customLimiter = createRateLimiter({
  limit: 50,
  windowMs: 30000
});

app.get('/api/v1/high-volume', customLimiter, (req, res) => {
  res.json({ data: [] });
});
```

### Manual Rate Limit Checks

```javascript
const { getRateLimitStatus, resetRateLimit } = require('./gateway/policies/rate-limiter');

// Check rate limit status for a client
const status = getRateLimitStatus('client-123');
console.log(`Remaining: ${status.remaining}/${status.limit}`);
console.log(`Resets at: ${status.reset}`);

// Reset rate limit for a client (admin operation)
resetRateLimit('client-123');
```

## Authorization Flow with Rate Limiting

```
1. Request arrives at gateway
   ↓
2. Token Introspection
   - Validates OAuth token
   - Extracts client_id
   ↓
3. Rate Limit Check ← NEW STEP
   - Checks request count for client
   - Compares against limit
   → DENIED: Returns 429, logs to audit
   ↓
4. Consent Validation
   - Validates consent status
   ↓
5. Scope Enforcement
   - Validates required scopes
   ↓
6. Request Allowed
   - Proceeds to API handler
```

## Response Format

### Successful Request (Under Limit)

**Status**: 200 OK

**Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2024-01-15T10:31:00Z
```

**Body**:
```json
{
  "accounts": [...]
}
```

### Rate Limit Exceeded

**Status**: 429 Too Many Requests

**Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2024-01-15T10:31:00Z
Retry-After: 60
```

**Body**:
```json
{
  "error": "rate_limit_exceeded",
  "error_description": "Rate limit exceeded. Maximum 100 requests per 60 seconds.",
  "rate_limit": {
    "limit": 100,
    "remaining": 0,
    "reset": "2024-01-15T10:31:00Z"
  }
}
```

## Rate Limit Headers

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | ISO 8601 timestamp when limit resets |
| `Retry-After` | Seconds until limit resets (only on 429) |

## Audit Logging

Rate limit denials are automatically logged to the audit trail:

```json
{
  "audit_id": 42,
  "timestamp": "2024-01-15T10:30:45Z",
  "endpoint": "/api/v1/accounts",
  "method": "GET",
  "client_id": "fintech-app-123",
  "customer_id": "cust-456",
  "authorization": "denied",
  "reason": "rate_limit_exceeded",
  "http_status": 429,
  "metadata": {
    "rate_limit": {
      "limit": 100,
      "current": 101,
      "remaining": 0,
      "reset": "2024-01-15T10:31:00Z"
    },
    "client_id": "fintech-app-123"
  }
}
```

## Per-Client Isolation

Rate limits are tracked independently for each OAuth client:

```javascript
// Client A makes 100 requests (hits limit)
// Client A: 429 Too Many Requests

// Client B makes 50 requests (under limit)
// Client B: 200 OK (not affected by Client A)
```

This ensures:
- One client cannot exhaust resources for others
- Fair resource allocation across all clients
- Misbehaving clients are isolated

## Implementation Details

### Sliding Window Algorithm

The rate limiter uses a sliding window approach:

1. Each request timestamp is recorded
2. On each check, old timestamps outside the window are removed
3. Current count is compared against the limit
4. Window slides forward with each request

**Advantages**:
- More accurate than fixed windows
- Prevents burst traffic at window boundaries
- Fair distribution of requests over time

### In-Memory Storage

**Current Implementation**:
- Uses in-memory Map for request tracking
- Automatic cleanup of old entries
- Suitable for single-instance deployments

**Production Considerations**:
- For multi-instance deployments, use Redis or similar
- Shared state across instances
- Persistent rate limit data

### Performance

- O(n) complexity for request count (where n = requests in window)
- Automatic cleanup every 5 minutes
- Minimal memory footprint per client
- Non-blocking async operations

## Testing

### Unit Tests

```bash
# Run rate limiter tests
npm test tests/gateway/rate-limiter.test.js
```

### Test Mode

Enable test mode for faster testing:

```bash
export NODE_ENV=test
export RATE_LIMIT_TEST_MODE=true
export RATE_LIMIT_TEST_REQUESTS=5
export RATE_LIMIT_TEST_WINDOW_MS=5000
```

### Example Test

```javascript
const { rateLimitMiddleware, resetRateLimit } = require('./gateway/policies/rate-limiter');

describe('Rate Limiting', () => {
  beforeEach(() => {
    resetRateLimit('test-client');
  });

  it('should block requests after limit exceeded', async () => {
    const clientId = 'test-client';
    const limit = 5;

    // Make requests up to limit
    for (let i = 0; i < limit; i++) {
      const req = { oauth_token: { client_id: clientId } };
      const res = { set: jest.fn() };
      const next = jest.fn();
      
      await rateLimitMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    }

    // Next request should be blocked
    const req = { oauth_token: { client_id: clientId } };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await rateLimitMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
```

## Monitoring

### Rate Limit Statistics

```javascript
const { getRateLimitStats } = require('./gateway/policies/rate-limiter');

const stats = getRateLimitStats();
console.log(`Tracked clients: ${stats.tracked_clients}`);
console.log(`Default limit: ${stats.config.default_limit}`);
console.log(`Window: ${stats.config.window_ms}ms`);
```

### Audit Log Queries

Query rate limit denials from audit logs:

```javascript
const { queryAuditLogs } = require('./gateway/policies/audit-logger');

// Get all rate limit denials
const rateLimitDenials = await queryAuditLogs({
  reason: 'rate_limit_exceeded',
  limit: 100
});

// Get rate limit denials for specific client
const clientDenials = await queryAuditLogs({
  client_id: 'fintech-app-123',
  reason: 'rate_limit_exceeded',
  start_date: new Date('2024-01-01')
});
```

## Best Practices

### 1. Set Appropriate Limits

- Consider typical usage patterns
- Allow headroom for legitimate bursts
- Monitor and adjust based on metrics

### 2. Communicate Limits

- Document rate limits in API documentation
- Include limits in developer portal
- Provide clear error messages

### 3. Handle 429 Responses

**Client Implementation**:
```javascript
async function makeRequest() {
  const response = await fetch('/api/v1/accounts', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    console.log(`Rate limited. Retry after ${retryAfter} seconds`);
    
    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return makeRequest();
  }

  return response.json();
}
```

### 4. Monitor Rate Limit Hits

- Set up alerts for frequent 429 responses
- Identify clients hitting limits regularly
- Investigate potential abuse or legitimate high usage

### 5. Consider Tiered Limits

For future enhancement, implement tiered limits:

```javascript
const TIER_LIMITS = {
  'free': { limit: 100, windowMs: 60000 },
  'premium': { limit: 1000, windowMs: 60000 },
  'enterprise': { limit: 10000, windowMs: 60000 }
};
```

## Troubleshooting

### Rate Limit Not Working

1. Verify OAuth token contains client_id
2. Check rate limit configuration
3. Ensure middleware is in correct order
4. Review console logs for errors

### Incorrect Limit Applied

1. Check environment variables
2. Verify test mode settings
3. Review custom rate limiter configuration

### Rate Limit Not Resetting

1. Check system time
2. Verify window configuration
3. Review cleanup process

## Future Enhancements

### Distributed Rate Limiting

For multi-instance deployments:

```javascript
// Redis-based rate limiting
const redis = require('redis');
const client = redis.createClient();

class RedisRateLimitStore {
  async recordRequest(clientId) {
    const key = `rate_limit:${clientId}`;
    await client.zadd(key, Date.now(), Date.now());
    await client.expire(key, 120); // 2x window
  }

  async getRequestCount(clientId, windowMs) {
    const key = `rate_limit:${clientId}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Remove old entries
    await client.zremrangebyscore(key, 0, windowStart);
    
    // Count remaining
    return await client.zcard(key);
  }
}
```

### Dynamic Limits

Adjust limits based on system load:

```javascript
function getDynamicLimit(clientId, systemLoad) {
  const baseLimit = 100;
  
  if (systemLoad > 0.9) {
    return baseLimit * 0.5; // Reduce by 50% under high load
  }
  
  return baseLimit;
}
```

### Client-Specific Limits

Store limits in database per client:

```sql
ALTER TABLE oauth_clients 
ADD COLUMN rate_limit_requests INTEGER DEFAULT 100,
ADD COLUMN rate_limit_window_ms INTEGER DEFAULT 60000;
```


## Made with Bob