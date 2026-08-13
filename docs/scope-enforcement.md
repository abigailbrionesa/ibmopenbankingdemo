# Gateway Scope Enforcement

## Overview

The gateway scope enforcement system ensures that OAuth 2.0 access tokens have the appropriate scopes before allowing access to protected banking API endpoints. This provides fine-grained authorization control at the API gateway level.

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Fintech   │────────>│   Gateway    │────────>│  Banking    │
│     App     │  Token  │    Scope     │  Pass   │     API     │
└─────────────┘         │ Enforcement  │         └─────────────┘
                        └──────────────┘
                              │
                              │ Check Scopes
                              ▼
                        ┌──────────────┐
                        │   Endpoint   │
                        │    Scope     │
                        │   Mapping    │
                        └──────────────┘
                              │
                              │ Log Denial
                              ▼
                        ┌──────────────┐
                        │   Security   │
                        │  Monitoring  │
                        └──────────────┘
```

## Scope Definitions

### Standard Scopes

| Scope | Description | Grants Access To |
|-------|-------------|------------------|
| `accounts:read` | Read account information | Account list, account details, balances (fallback) |
| `transactions:read` | Read transaction history | Transaction list for accounts |
| `balances:read` | Read account balances | Account balance information |
| `profile:read` | Read customer profile | Customer profile data |

### Scope Format

Scopes follow the format: `resource:action`

- **Resource**: The type of data (accounts, transactions, balances, profile)
- **Action**: The operation (read, write)

Examples:
- ✅ `accounts:read` - Valid
- ✅ `transactions:read` - Valid
- ❌ `accounts` - Invalid (missing action)
- ❌ `ACCOUNTS:READ` - Invalid (must be lowercase)

## Endpoint Scope Mapping

### Account Endpoints

#### GET /api/v1/accounts
**Required Scope**: `accounts:read`

Lists all accounts for the authenticated customer.

```http
GET /api/v1/accounts HTTP/1.1
Authorization: Bearer <token-with-accounts:read>
```

#### GET /api/v1/accounts/:account_id
**Required Scope**: `accounts:read`

Retrieves details for a specific account.

```http
GET /api/v1/accounts/acc-123 HTTP/1.1
Authorization: Bearer <token-with-accounts:read>
```

### Balance Endpoints

#### GET /api/v1/accounts/:account_id/balance
**Required Scopes**: `balances:read` OR `accounts:read`

Retrieves the current balance for an account. Accepts either `balances:read` (preferred) or `accounts:read` (fallback).

```http
GET /api/v1/accounts/acc-123/balance HTTP/1.1
Authorization: Bearer <token-with-balances:read>
```

### Transaction Endpoints

#### GET /api/v1/accounts/:account_id/transactions
**Required Scope**: `transactions:read`

Retrieves transaction history for an account.

```http
GET /api/v1/accounts/acc-123/transactions HTTP/1.1
Authorization: Bearer <token-with-transactions:read>
```

### Profile Endpoints

#### GET /api/v1/profile
**Required Scope**: `profile:read`

Retrieves customer profile information.

```http
GET /api/v1/profile HTTP/1.1
Authorization: Bearer <token-with-profile:read>
```

## Enforcement Flow

### 1. Token Validation

Before scope enforcement, the token must pass:
- Format validation
- Signature verification
- Expiration check
- Revocation check

### 2. Endpoint Identification

The gateway normalizes the request path to match against the endpoint mapping:

```javascript
// Original path
GET /api/v1/accounts/550e8400-e29b-41d4-a716-446655440000

// Normalized path
GET /api/v1/accounts/:account_id
```

### 3. Scope Lookup

The gateway looks up required scopes for the normalized endpoint:

```javascript
const requiredScopes = getRequiredScopes('GET', '/api/v1/accounts/:account_id');
// Returns: ['accounts:read']
```

### 4. Scope Validation

The gateway checks if the token has any of the required scopes:

```javascript
const tokenScopes = ['accounts:read', 'profile:read'];
const requiredScopes = ['accounts:read'];

if (hasRequiredScope(tokenScopes, requiredScopes)) {
  // Allow access
} else {
  // Deny with 403
}
```

### 5. Authorization Decision

#### Access Granted (200 OK)
- Token has required scope
- Request forwarded to banking API
- Access logged for audit

#### Access Denied (403 Forbidden)
- Token lacks required scope
- Request blocked at gateway
- Denial logged for security monitoring

## Error Responses

### 403 Forbidden - Insufficient Scope

Returned when token is valid but lacks required scope:

```json
{
  "error": "insufficient_scope",
  "error_description": "This endpoint requires one of the following scopes: transactions:read",
  "required_scopes": ["transactions:read"],
  "granted_scopes": ["accounts:read", "profile:read"]
}
```

**Client Action**: Request new authorization with required scopes

### 500 Internal Server Error

Returned when scope enforcement fails:

```json
{
  "error": "server_error",
  "error_description": "Failed to enforce scope requirements"
}
```

**Client Action**: Retry request

## Usage Examples

### Automatic Enforcement

Apply to all routes automatically based on endpoint mapping:

```javascript
const { enforceEndpointScopes } = require('./gateway/policies/scope-enforcement');

// Apply globally
app.use(enforceEndpointScopes);

// Define routes - scopes enforced automatically
app.get('/api/v1/accounts', accountsController.list);
app.get('/api/v1/accounts/:account_id/transactions', transactionsController.list);
```

### Manual Enforcement

Explicitly specify required scopes for an endpoint:

```javascript
const { requireEndpointScope } = require('./gateway/policies/scope-enforcement');

// Single scope requirement
app.get('/api/v1/accounts',
  requireEndpointScope('accounts:read'),
  accountsController.list
);

// Multiple scope options (any one required)
app.get('/api/v1/accounts/:account_id/balance',
  requireEndpointScope(['balances:read', 'accounts:read']),
  balanceController.get
);
```

### Complete Protection Chain

Combine with token introspection and consent validation:

```javascript
const { gatewayProtection } = require('./gateway/policies/token-introspection');
const { enforceEndpointScopes } = require('./gateway/policies/scope-enforcement');

app.get('/api/v1/accounts',
  ...gatewayProtection(), // Format + Introspection + Consent
  enforceEndpointScopes,  // Scope enforcement
  accountsController.list
);
```

## Security Logging

### Authorization Denial Events

Every scope enforcement failure is logged with full context:

```json
{
  "event": "authorization_denied",
  "timestamp": "2026-08-13T15:00:00.000Z",
  "method": "GET",
  "path": "/api/v1/accounts/acc-123/transactions",
  "customer_id": "customer-456",
  "client_id": "fintech-app-123",
  "consent_id": "consent-789",
  "granted_scopes": ["accounts:read"],
  "required_scopes": ["transactions:read"],
  "ip_address": "192.168.1.100",
  "user_agent": "FintechApp/1.0",
  "reason": "insufficient_scope"
}
```

### Log Destinations

In production, denial events should be sent to:
- **SIEM System**: For security monitoring and threat detection
- **Audit Log**: For compliance and regulatory requirements
- **Metrics System**: For tracking denial rates and patterns

### Monitoring Alerts

Set up alerts for:
- **High Denial Rate**: >5% of requests denied
- **Repeated Denials**: Same client denied multiple times
- **Scope Escalation Attempts**: Requests for unauthorized scopes
- **Unusual Patterns**: Denials outside normal business hours

## Custom Endpoint Mapping

### Adding New Endpoints

Register custom endpoints with required scopes:

```javascript
const { addEndpointScopeMapping } = require('./gateway/policies/scope-enforcement');

// Add custom endpoint
addEndpointScopeMapping('POST', '/api/v1/payments', ['payments:write']);
addEndpointScopeMapping('GET', '/api/v1/statements', ['statements:read']);
```

### Retrieving Mappings

Get all endpoint mappings for documentation:

```javascript
const { getEndpointScopeMappings } = require('./gateway/policies/scope-enforcement');

const mappings = getEndpointScopeMappings();
console.log(mappings);
// {
//   'GET /api/v1/accounts': ['accounts:read'],
//   'GET /api/v1/accounts/:account_id/transactions': ['transactions:read'],
//   ...
// }
```

## Testing

### Unit Tests

Located in [`tests/gateway/scope-enforcement.test.js`](../tests/gateway/scope-enforcement.test.js):

- Endpoint path normalization
- Scope requirement lookup
- Scope validation logic
- Middleware behavior
- Error responses
- Logging functionality

### Running Tests

```bash
# Run all scope enforcement tests
npm test tests/gateway/scope-enforcement.test.js

# Run with coverage
npm test -- --coverage tests/gateway/scope-enforcement.test.js

# Run specific test suite
npm test -- --testNamePattern="enforceEndpointScopes middleware"
```

### Test Scenarios

Key test cases:
- ✅ Token with `accounts:read` can access account endpoints
- ✅ Token with only `accounts:read` cannot access transactions endpoint
- ✅ Token with `transactions:read` can access transactions endpoint
- ✅ Scope failure returns 403 Forbidden (not 401 Unauthorized)
- ✅ Multiple scopes allow access if any match
- ✅ Authorization denials are logged
- ✅ Endpoint path normalization works correctly

## Integration with Other Systems

### Token Introspection

Scope enforcement works with token introspection:

```javascript
// Token introspection validates token
// Scope enforcement validates permissions
app.get('/api/v1/accounts',
  gatewayTokenIntrospection,  // Validates token
  enforceEndpointScopes,       // Validates scopes
  accountsController.list
);
```

### Consent Validation

Scopes must be present in both token AND consent:

```javascript
// Complete validation chain
app.get('/api/v1/accounts',
  gatewayTokenIntrospection,  // Token valid?
  validateConsent,             // Consent approved?
  enforceEndpointScopes,       // Token has scope?
  requireConsentScope('accounts:read'), // Consent has scope?
  accountsController.list
);
```

### OAuth Middleware

Compatible with existing OAuth middleware:

```javascript
const { requireOAuthToken } = require('./gateway/policies/oauth-middleware');
const { enforceEndpointScopes } = require('./gateway/policies/scope-enforcement');

app.get('/api/v1/accounts',
  requireOAuthToken,        // Validate token
  enforceEndpointScopes,    // Enforce scopes
  accountsController.list
);
```

## Best Practices

### 1. Principle of Least Privilege

Grant only the minimum scopes needed:

```javascript
// ❌ Bad: Request all scopes
const scopes = 'accounts:read transactions:read balances:read profile:read';

// ✅ Good: Request only needed scopes
const scopes = 'accounts:read'; // For account list only
```

### 2. Scope Granularity

Use specific scopes rather than broad permissions:

```javascript
// ❌ Bad: Single scope for everything
'banking:read'

// ✅ Good: Granular scopes
'accounts:read transactions:read'
```

### 3. Fallback Scopes

Provide fallback scopes for backward compatibility:

```javascript
// Balance endpoint accepts either scope
requireEndpointScope(['balances:read', 'accounts:read'])
```

### 4. Consistent Error Responses

Always return 403 for scope issues (not 401):

```javascript
// ✅ Correct: 403 for insufficient scope
if (!hasRequiredScope(tokenScopes, requiredScopes)) {
  return res.status(403).json({ error: 'insufficient_scope' });
}

// ❌ Wrong: 401 is for authentication issues
if (!hasRequiredScope(tokenScopes, requiredScopes)) {
  return res.status(401).json({ error: 'unauthorized' });
}
```

### 5. Security Logging

Log all authorization denials:

```javascript
// Always log denials for security monitoring
logAuthorizationDenial({
  method: req.method,
  path: req.path,
  customer_id: req.oauth_token.customer_id,
  granted_scopes: tokenScopes,
  required_scopes: requiredScopes
});
```

## Troubleshooting

### Common Issues

#### Issue: 403 Forbidden on Valid Request

**Symptoms**: Request returns 403 even though token seems valid

**Diagnosis**:
1. Check token scopes: `jwt.io` or introspection endpoint
2. Verify endpoint mapping: `getRequiredScopes(method, path)`
3. Check consent scopes: Ensure consent includes required scope

**Solution**: Request new authorization with required scopes

#### Issue: Scope Enforcement Not Applied

**Symptoms**: Requests succeed without proper scopes

**Diagnosis**:
1. Verify middleware order: Scope enforcement must be after OAuth validation
2. Check endpoint mapping: Endpoint may not be in mapping
3. Verify middleware is applied: Check route definition

**Solution**: Apply `enforceEndpointScopes` middleware to routes

#### Issue: Wrong Error Code (401 vs 403)

**Symptoms**: Getting 401 when expecting 403

**Diagnosis**:
1. Check middleware order: Token validation before scope enforcement
2. Verify token is valid: May be authentication issue, not authorization

**Solution**: Ensure token is valid before scope check

## Performance Considerations

### Scope Checking Overhead

- **Typical Overhead**: <1ms per request
- **Path Normalization**: Regex-based, very fast
- **Scope Comparison**: Simple array operations

### Optimization Tips

1. **Cache Endpoint Mappings**: Mappings are static, no need to recompute
2. **Early Rejection**: Check format before expensive operations
3. **Efficient Logging**: Use async logging to avoid blocking

## Compliance and Regulations

### PSD2 Compliance

Scope enforcement helps meet PSD2 requirements:
- **Explicit Consent**: Scopes map to consent purposes
- **Granular Access**: Fine-grained permission control
- **Audit Trail**: All access attempts logged

### GDPR Compliance

Supports GDPR principles:
- **Data Minimization**: Only grant access to needed data
- **Purpose Limitation**: Scopes tied to specific purposes
- **Accountability**: Complete audit trail of access

## API Reference

### enforceEndpointScopes(req, res, next)

Middleware to automatically enforce scopes based on endpoint mapping.

**Usage**:
```javascript
app.use(enforceEndpointScopes);
```

### requireEndpointScope(scopes)

Middleware factory to enforce specific scope(s) for an endpoint.

**Parameters**:
- `scopes` (string|string[]): Required scope(s)

**Usage**:
```javascript
app.get('/api/v1/accounts',
  requireEndpointScope('accounts:read'),
  handler
);
```

### getRequiredScopes(method, path)

Get required scopes for an endpoint.

**Parameters**:
- `method` (string): HTTP method
- `path` (string): Request path

**Returns**: string[] | null

**Usage**:
```javascript
const scopes = getRequiredScopes('GET', '/api/v1/accounts');
// Returns: ['accounts:read']
```

### hasRequiredScope(tokenScopes, requiredScopes)

Check if token has any of the required scopes.

**Parameters**:
- `tokenScopes` (string[]): Scopes in token
- `requiredScopes` (string[]): Required scopes

**Returns**: boolean

**Usage**:
```javascript
const hasScope = hasRequiredScope(
  ['accounts:read'],
  ['accounts:read', 'balances:read']
);
// Returns: true
```

### logAuthorizationDenial(details)

Log an authorization denial event.

**Parameters**:
- `details` (Object): Denial details

**Usage**:
```javascript
logAuthorizationDenial({
  method: 'GET',
  path: '/api/v1/accounts',
  customer_id: 'cust-123',
  granted_scopes: ['profile:read'],
  required_scopes: ['accounts:read']
});
```

