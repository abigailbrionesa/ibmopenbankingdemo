# Observability and Operational Logging

This document describes the comprehensive observability and operational logging implementation for the IBM Open Banking Demo MVP.

## Overview

The observability system provides end-to-end traceability of the security and data-access flow, enabling:

- **Golden path tracing**: Track successful requests from authentication through API access
- **Failure diagnosis**: Clear reasons for denied requests with full context
- **Security monitoring**: Detection of suspicious patterns and security violations
- **Performance tracking**: Latency measurement for all critical operations
- **Compliance**: Audit trail for regulatory requirements

## Architecture

### Components

1. **Centralized Logger** ([`utils/logger.js`](../utils/logger.js))
   - Structured JSON logging
   - Correlation ID tracking
   - Automatic secret/token redaction
   - Latency measurement
   - Multiple log levels (error, warn, info, debug)

2. **Correlation IDs**
   - Generated for each request: `corr_[32-char-hex]`
   - Propagated across all components
   - Included in response headers as `X-Correlation-ID`
   - Enables end-to-end request tracing

3. **Secret Redaction**
   - Automatic detection and redaction of sensitive data
   - Patterns: passwords, tokens, secrets, API keys, authorization headers
   - JWT tokens detected by format (3 dot-separated parts)
   - Long random strings treated as secrets

## Logged Events

### Authentication Events

**Component**: `customer-authentication`

| Event | Description | Key Fields |
|-------|-------------|------------|
| `login_attempt` | Customer login initiated | email, ip_address, user_agent |
| `login_success` | Successful authentication | customer_id, session_id, authentication_method, latency_ms |
| `login_failure` | Failed authentication | reason (missing_credentials, customer_not_found, invalid_password), latency_ms |
| `session_verification_success` | Session validated | customer_id, session_id, latency_ms |
| `session_verification_failure` | Session validation failed | reason (missing_token, session_not_found_or_expired), latency_ms |
| `logout_success` | Customer logged out | session_id, latency_ms |
| `logout_failure` | Logout failed | reason, latency_ms |

### Authorization Events

**Component**: `token-exchange`

| Event | Description | Key Fields |
|-------|-------------|------------|
| `token_exchange_attempt` | Token exchange initiated | grant_type, client_id, redirect_uri |
| `token_exchange_success` | Access token issued | client_id, customer_id, consent_id, scope, token_id, latency_ms |
| `token_exchange_failure` | Token exchange failed | reason, error, latency_ms |
| `client_validation_success` | Client credentials validated | client_id, latency_ms |
| `client_validation_failure` | Client validation failed | reason (client_not_found, client_inactive, invalid_secret), latency_ms |
| `code_validation_success` | Authorization code validated | client_id, customer_id, consent_id, scope, latency_ms |
| `code_validation_failure` | Code validation failed | reason (code_not_found, code_expired, code_reuse), latency_ms |
| `token_generation_success` | Tokens generated | token_id, customer_id, client_id, consent_id, expires_in, latency_ms |
| `token_verification_success` | Token verified | token_id, customer_id, client_id, use_count, latency_ms |
| `token_verification_failure` | Token verification failed | reason (token_not_found, token_revoked, token_expired, invalid_signature), latency_ms |

### Consent Events

**Component**: `consent-validation`, `consent-handler`

| Event | Description | Key Fields |
|-------|-------------|------------|
| `validation_success` | Consent validated | consent_id, customer_id, client_id, granted_scopes, expires_at, latency_ms |
| `validation_failure` | Consent validation failed | reason (missing_token, consent_not_found, consent_revoked, consent_expired, scope_mismatch), latency_ms |
| `page_request` | Consent page requested | auth_request_id, customer_id |
| `page_request_success` | Consent page loaded | client_id, requested_scopes, has_existing_consent, latency_ms |
| `decision_attempt` | Consent decision initiated | auth_request_id, customer_id, action (approve/deny) |
| `consent_approved` | Customer approved consent | consent_id, granted_scopes, reused_existing, ip_address, latency_ms |
| `consent_denied` | Customer denied consent | client_id, requested_scopes, ip_address, latency_ms |
| `revocation_attempt` | Consent revocation initiated | consent_id, customer_id, reason |
| `revocation_success` | Consent revoked | consent_id, client_id, revoked_at, revocation_reason, latency_ms |

### API Call Events

**Component**: `banking-api`

| Event | Description | Key Fields |
|-------|-------------|------------|
| `api_call` | API request completed | method, endpoint, status_code, latency_ms, customer_id, client_id |

Specific endpoints logged:
- `GET /api/v1/accounts` - List accounts
- `GET /api/v1/accounts/:id` - Get account details
- `GET /api/v1/accounts/:id/balance` - Get balance
- `GET /api/v1/accounts/:id/transactions` - Get transactions

## Log Format

All logs are output as structured JSON with the following standard fields:

```json
{
  "timestamp": "2026-08-13T16:00:00.000Z",
  "level": "info",
  "message": "Human-readable message",
  "component": "component-name",
  "correlation_id": "corr_abc123...",
  "event_type": "authentication|authorization|consent|api_call",
  "latency_ms": 45,
  ...additional context fields
}
```

### Log Levels

- **error**: System errors, exceptions, critical failures
- **warn**: Security violations, denied requests, suspicious activity
- **info**: Normal operations, successful requests
- **debug**: Detailed debugging information (disabled by default)

## Correlation ID Flow

```
1. Request arrives → Generate correlation_id
2. Attach to req.correlationId
3. Create logger: req.logger = new Logger('http', correlationId)
4. Pass through middleware chain
5. Child loggers inherit correlation_id
6. Return in response header: X-Correlation-ID
```

Example trace:
```
corr_a1b2c3d4... → Authentication → Token Exchange → Consent Check → API Call
```

## Security Features

### Secret Redaction

Sensitive data is automatically redacted in logs:

**Before redaction:**
```json
{
  "password": "secret123",
  "access_token": "eyJhbGci...",
  "client_secret": "very_secret_key"
}
```

**After redaction:**
```json
{
  "password": "[REDACTED]",
  "access_token": "[REDACTED_TOKEN]",
  "client_secret": "[REDACTED]"
}
```

### Redacted Fields

- Passwords: `password`, `Password`, `PASSWORD`
- Tokens: `token`, `access_token`, `refresh_token`, `bearer`
- Secrets: `secret`, `client_secret`, `api_key`, `apiKey`
- Headers: `authorization`, `Authorization`
- JWT format strings (3 dot-separated parts)
- Long random strings (>32 chars, alphanumeric)

## Usage Examples

### Basic Logging

```javascript
const { createLogger } = require('../utils/logger');

const logger = createLogger('my-component');

// Info logging
logger.info('Operation completed', {
  user_id: 'user123',
  action: 'update'
});

// Error logging
try {
  // ... operation
} catch (error) {
  logger.error('Operation failed', error, {
    user_id: 'user123'
  });
}
```

### With Correlation ID

```javascript
// In Express middleware
app.use(correlationMiddleware);

// In route handler
app.get('/api/resource', (req, res) => {
  const logger = req.logger.child('get-resource');
  const endTimer = logger.startTimer();
  
  // ... perform operation
  
  const latency = endTimer();
  logger.info('Resource fetched', {
    resource_id: 'res123',
    latency_ms: latency
  });
});
```

### Specialized Logging

```javascript
// Authentication
logger.logAuth('login_success', {
  customer_id: 'cust123',
  session_id: 'sess456',
  latency_ms: 45
});

// Authorization
logger.logAuthz('token_validation', {
  token_id: 'token789',
  valid: true,
  latency_ms: 12
});

// Consent
logger.logConsent('consent_granted', {
  consent_id: 'consent123',
  scopes: ['accounts:read'],
  latency_ms: 78
});

// API Call
logger.logApiCall('GET', '/api/v1/accounts', 200, 156, {
  customer_id: 'cust123',
  account_count: 3
});
```

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Authentication Failures**
   - Alert on: >10 failures/minute from same IP
   - Indicates: Brute force attack

2. **Token Validation Failures**
   - Alert on: Spike in `token_revoked` or `invalid_signature`
   - Indicates: Compromised tokens or security issue

3. **Consent Revocations**
   - Track: Revocation rate by client
   - Indicates: User trust issues

4. **API Latency**
   - Alert on: p95 latency >500ms
   - Indicates: Performance degradation

5. **Rate Limit Hits**
   - Track: Clients hitting rate limits
   - Indicates: Misbehaving clients

### Sample Queries

**Find all failed authentications in last hour:**
```javascript
{
  "event_type": "authentication",
  "auth_event": "login_failure",
  "timestamp": { "$gte": "2026-08-13T15:00:00Z" }
}
```

**Trace a specific request:**
```javascript
{
  "correlation_id": "corr_abc123..."
}
```

**Find slow API calls:**
```javascript
{
  "event_type": "api_call",
  "latency_ms": { "$gte": 500 }
}
```

## Testing

Run logging tests:
```bash
npm test tests/utils/logger.test.js
```

Tests verify:
- Correlation ID generation and propagation
- Secret redaction for all sensitive patterns
- Log level handling
- Specialized logging methods
- Latency tracking
- Component naming

## Production Deployment

### Environment Variables

```bash
# Log level (default: info)
LOG_LEVEL=info

# Enable debug logging
LOG_LEVEL=debug
```

### Log Aggregation

Recommended setup:
1. **Stdout/Stderr**: All logs output as JSON to stdout
2. **Log Shipper**: Filebeat, Fluentd, or CloudWatch agent
3. **Aggregation**: Elasticsearch, Splunk, or CloudWatch Logs
4. **Visualization**: Kibana, Splunk dashboards, or CloudWatch Insights

### Sample Filebeat Configuration

```yaml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/openbanking/*.log
  json.keys_under_root: true
  json.add_error_key: true
  
processors:
  - add_cloud_metadata: ~
  - add_host_metadata: ~

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "openbanking-logs-%{+yyyy.MM.dd}"
```

## Compliance

### Regulatory Requirements

✅ **PSD2 Compliance**
- Audit trail of all consent decisions
- Customer authentication events logged
- Token lifecycle tracked

✅ **GDPR Compliance**
- No PII in logs (customer IDs only)
- Consent revocations tracked
- Data access logged

✅ **Security Standards**
- All secrets redacted
- Failed authentication attempts logged
- Security violations flagged

### Audit Log Retention

Recommended retention periods:
- **Authentication logs**: 90 days
- **Authorization logs**: 1 year
- **Consent logs**: 5 years (regulatory requirement)
- **API access logs**: 90 days



**Made with Bob**