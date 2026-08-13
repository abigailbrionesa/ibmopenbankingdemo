# Audit Logging

## Overview

The audit logging system records every authorization event for protected API requests, providing a comprehensive audit trail for security monitoring, compliance, and troubleshooting.

## Features

- **Complete Coverage**: Every protected API request generates exactly one audit event
- **Allowed Requests**: Records successful authorizations with full context
- **Denied Requests**: Records failed authorizations with specific denial reasons
- **Queryable Logs**: Database-backed storage enables efficient querying and analysis
- **Real-time Monitoring**: Console logging for immediate visibility
- **Statistical Analysis**: Built-in functions for generating audit statistics

## Audit Event Fields

Each audit event includes the following fields:

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `audit_id` | Serial | Unique sequential identifier | Auto-generated |
| `timestamp` | Timestamp | When the event occurred | Yes |
| `endpoint` | String | API endpoint accessed | Yes |
| `method` | String | HTTP method (GET, POST, etc.) | Yes |
| `client_id` | String | OAuth client identifier | Optional |
| `customer_id` | String | Customer identifier | Optional |
| `consent_id` | String | Consent identifier | Optional |
| `scope` | String | Scopes granted in token | Optional |
| `required_scope` | String | Scopes required for endpoint | Optional |
| `authorization` | String | 'allowed' or 'denied' | Yes |
| `reason` | String | Denial reason (required if denied) | Conditional |
| `ip_address` | String | Client IP address | Optional |
| `user_agent` | String | Client user agent | Optional |
| `token_id` | String | Token identifier | Optional |
| `http_status` | Integer | HTTP response status code | Optional |
| `metadata` | JSONB | Additional context | Optional |

## Denial Reasons

The system tracks specific reasons for authorization denials:

### Token-Related Denials
- **`invalid_token`**: Token is invalid or cannot be verified
- **`expired_token`**: Token has expired
- **`missing_token`**: No token provided in request
- **`malformed_token`**: Token format is invalid

### Consent-Related Denials
- **`missing_consent`**: No consent associated with token
- **`revoked_consent`**: Consent has been revoked by customer
- **`expired_consent`**: Consent has expired
- **`denied_consent`**: Consent was denied by customer

### Scope-Related Denials
- **`insufficient_scope`**: Token lacks required scope for endpoint
- **`scope_mismatch`**: Token scopes exceed consent scopes

### Other Denials
- **`rate_limit_exceeded`**: Rate limit has been exceeded
- **`unauthorized`**: Generic authorization failure

## Usage

### Automatic Logging

Audit logging is automatically integrated into the authorization middleware chain:

```javascript
const { completeAuthorization } = require('./gateway/policies/complete-authorization');

// Apply to protected routes
app.get('/api/v1/accounts', completeAuthorization(), (req, res) => {
  // Route handler
});
```

### Manual Logging

For custom scenarios, you can manually log audit events:

```javascript
const { logAllowedRequest, logDeniedRequest, DENIAL_REASONS } = require('./gateway/policies/audit-logger');

// Log allowed request
await logAllowedRequest(req, 200);

// Log denied request
await logDeniedRequest(req, DENIAL_REASONS.INSUFFICIENT_SCOPE, 403, {
  granted_scopes: ['accounts:read'],
  required_scopes: ['transactions:read']
});
```

### Querying Audit Logs

Query audit logs with various filters:

```javascript
const { queryAuditLogs } = require('./gateway/policies/audit-logger');

// Query by customer
const customerLogs = await queryAuditLogs({
  customer_id: 'cust-123',
  limit: 100,
  offset: 0
});

// Query denied events
const deniedLogs = await queryAuditLogs({
  authorization: 'denied',
  start_date: new Date('2024-01-01'),
  end_date: new Date('2024-12-31')
});

// Query by specific reason
const revokedConsentLogs = await queryAuditLogs({
  reason: 'revoked_consent',
  limit: 50
});
```

### Audit Statistics

Generate statistical summaries:

```javascript
const { getAuditStatistics } = require('./gateway/policies/audit-logger');

// Overall statistics
const stats = await getAuditStatistics();
console.log(`Total events: ${stats.total_events}`);
console.log(`Allowed: ${stats.allowed_count}`);
console.log(`Denied: ${stats.denied_count}`);

// Statistics for specific customer
const customerStats = await getAuditStatistics({
  customer_id: 'cust-123',
  start_date: new Date('2024-01-01')
});
```

## Database Schema

The audit logs are stored in the `audit_logs` table:

```sql
CREATE TABLE audit_logs (
  audit_id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  client_id VARCHAR(255),
  customer_id VARCHAR(50),
  consent_id VARCHAR(255),
  scope TEXT,
  required_scope TEXT,
  authorization VARCHAR(20) NOT NULL CHECK (authorization IN ('allowed', 'denied')),
  reason VARCHAR(100),
  ip_address VARCHAR(45),
  user_agent TEXT,
  token_id VARCHAR(255),
  http_status INTEGER,
  metadata JSONB
);
```

### Indexes

Optimized indexes for common queries:

- `idx_audit_timestamp`: Timestamp-based queries
- `idx_audit_customer`: Customer-specific queries
- `idx_audit_client`: Client-specific queries
- `idx_audit_authorization`: Filter by authorization status
- `idx_audit_denied_events`: Denied events analysis
- `idx_audit_customer_timestamp`: Customer timeline queries

## Examples

### Example 1: Successful Authorization

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
  "ip_address": "192.168.1.100",
  "user_agent": "FinTech Mobile App/1.0",
  "token_id": "token-abc123",
  "http_status": 200,
  "metadata": {
    "consent_status": "approved",
    "consent_expires_at": "2024-12-31T23:59:59Z"
  }
}
```

### Example 2: Insufficient Scope Denial

```json
{
  "audit_id": 2,
  "timestamp": "2024-01-15T10:35:00Z",
  "endpoint": "/api/v1/accounts/acc-123/transactions",
  "method": "GET",
  "client_id": "fintech-app-123",
  "customer_id": "cust-456",
  "consent_id": "consent-789",
  "scope": "accounts:read",
  "required_scope": "transactions:read",
  "authorization": "denied",
  "reason": "insufficient_scope",
  "ip_address": "192.168.1.100",
  "user_agent": "FinTech Mobile App/1.0",
  "token_id": "token-abc123",
  "http_status": 403,
  "metadata": {
    "granted_scopes": ["accounts:read"],
    "required_scopes": ["transactions:read"]
  }
}
```

### Example 3: Revoked Consent Denial

```json
{
  "audit_id": 3,
  "timestamp": "2024-01-15T11:00:00Z",
  "endpoint": "/api/v1/accounts",
  "method": "GET",
  "client_id": "fintech-app-123",
  "customer_id": "cust-456",
  "consent_id": "consent-789",
  "scope": "accounts:read",
  "required_scope": "accounts:read",
  "authorization": "denied",
  "reason": "revoked_consent",
  "ip_address": "192.168.1.100",
  "user_agent": "FinTech Mobile App/1.0",
  "token_id": "token-abc123",
  "http_status": 403,
  "metadata": {
    "consent_id": "consent-789",
    "consent_status": "revoked"
  }
}
```

## Security Considerations

### Data Retention

- Audit logs should be retained according to compliance requirements
- Consider implementing automatic archival for old logs
- Ensure adequate storage capacity for long-term retention

### Access Control

- Restrict access to audit logs to authorized personnel only
- Implement role-based access control for audit log queries
- Log access to audit logs themselves (meta-auditing)

### Privacy

- Audit logs may contain sensitive information
- Ensure compliance with data protection regulations (GDPR, CCPA, etc.)
- Consider data anonymization for non-production environments

### Monitoring

- Set up alerts for unusual patterns:
  - High denial rates
  - Repeated authorization failures
  - Access attempts with revoked consents
  - Unusual access patterns

## Performance Considerations

### Database Performance

- Audit logging uses asynchronous operations to minimize impact
- Indexes optimize common query patterns
- Consider partitioning for very large datasets

### Error Handling

- Audit logging failures do not block request processing
- Errors are logged but do not propagate to the client
- Monitor audit logging health separately

### Scalability

- For high-volume systems, consider:
  - Batch insertion of audit logs
  - Separate audit database
  - Message queue for async processing
  - Time-series database for analytics

## Compliance

The audit logging system supports compliance with:

- **PSD2**: Transaction monitoring and security event logging
- **GDPR**: Data access tracking and consent management
- **SOC 2**: Security monitoring and access control
- **ISO 27001**: Information security event logging

## Testing

Run audit logging tests:

```bash
# Unit tests
npm test tests/gateway/audit-logger.test.js

# Integration tests
npm test tests/integration/audit-logging.test.js
```

