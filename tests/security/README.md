# Security Boundary Tests

Comprehensive automated tests for the security boundary to prove token, scope, consent, revocation, and expiration behavior.

## Overview

This test suite validates all PRD-required negative authorization cases and ensures that valid tokens alone are not sufficient to access customer data.

## Test Files

### [`security-boundary.test.js`](./security-boundary.test.js)
Unit tests for individual security components:
- **Token validation**: Missing, invalid, expired, and revoked tokens
- **Scope enforcement**: Wrong scope, insufficient scope
- **Consent validation**: Revoked, expired, denied consents
- **Security layer integration**: Multiple security checks in sequence

### [`integration-security.test.js`](./integration-security.test.js)
End-to-end integration tests for complete authorization flows:
- **Complete authorization flow**: Full OAuth flow with various failure modes
- **Multi-endpoint security**: Different endpoints with different scope requirements
- **Consent revocation impact**: Immediate denial after consent revocation
- **Token expiration scenarios**: Token expiration during active sessions
- **Scope escalation prevention**: Preventing unauthorized scope expansion
- **Error response consistency**: Standardized error formats

### [`test-fixtures.js`](./test-fixtures.js)
Reusable test data and helper functions:
- Token generation utilities
- Test customer, client, and consent data
- Mock database responses
- Expected error responses

## PRD Requirements Coverage

### ✅ No token returns 401
- Missing Authorization header
- Missing Bearer prefix
- Empty token string
- All protected endpoints without token

### ✅ Invalid token returns 401
- Malformed JWT tokens
- Invalid signature
- Unknown issuer
- Revoked tokens

### ✅ Expired token returns 401
- Expired access tokens
- Tokens with past `exp` claim

### ✅ Wrong scope returns 403
- Accessing accounts endpoint without `accounts:read`
- Accessing transactions endpoint without `transactions:read`
- Valid token with insufficient scope (403, not 401)

### ✅ Revoked consent returns 403
- Consent explicitly revoked by user
- Consent denied by user
- Consent not found
- Consent expired

### ✅ Valid token alone is NOT enough
- Token valid but consent revoked → 403
- Token valid but scope insufficient → 403
- Success only when token, consent, AND scope are all valid

## Running Tests

### Run all security tests
```bash
npm test -- tests/security
```

### Run specific test file
```bash
npm test -- tests/security/security-boundary.test.js
npm test -- tests/security/integration-security.test.js
```

### Run with coverage
```bash
npm test -- --coverage tests/security
```

### Run in watch mode
```bash
npm test -- --watch tests/security
```

## Test Structure

Each test follows this pattern:

1. **Setup**: Mock dependencies and configure test environment
2. **Execute**: Make request to protected endpoint
3. **Assert**: Verify correct HTTP status code and error response
4. **Verify**: Confirm security layers were checked in correct order

## Security Test Principles

### 1. Deterministic Fixtures
All test data is deterministic and isolated from real credentials. No production data is used.

### 2. Negative Case Focus
Tests primarily focus on negative authorization cases to ensure security boundaries are enforced.

### 3. Layer Isolation
Each security layer (token, consent, scope) is tested independently and in combination.

### 4. Error Consistency
All error responses follow consistent format with `error` and `error_description` fields.

### 5. No Information Leakage
Tests verify that error messages don't leak sensitive information about valid tokens or internal systems.

## Test Coverage

The security test suite covers:

- ✅ Token validation (missing, invalid, expired, revoked)
- ✅ Scope validation (wrong scope, insufficient scope)
- ✅ Consent validation (revoked, expired, denied, not found)
- ✅ Token expiration handling
- ✅ Consent revocation impact
- ✅ Scope escalation prevention
- ✅ Multi-endpoint security enforcement
- ✅ Error response consistency
- ✅ Security boundary isolation

## Adding New Tests

When adding new security tests:

1. Use fixtures from [`test-fixtures.js`](./test-fixtures.js)
2. Follow existing test patterns
3. Test both positive and negative cases
4. Verify error response format
5. Ensure tests are isolated and deterministic
6. Add documentation for new test scenarios

## Example Test

```javascript
test('should return 401 for expired token', async () => {
  verifyAccessToken.mockResolvedValue({
    valid: false,
    error: 'token_expired',
    error_description: 'Token has expired'
  });
  
  const response = await request(app)
    .get('/api/v1/accounts')
    .set('Authorization', 'Bearer expired.token.here')
    .expect(401);
  
  expect(response.body.error).toBe('invalid_token');
  expect(response.body.error_description).toContain('expired');
});
```

## Continuous Integration

These tests are designed to run in CI/CD pipelines:

- Fast execution (< 5 seconds for full suite)
- No external dependencies
- Deterministic results
- Clear failure messages
