# Open Banking MVP - API Documentation

## Overview

This document provides comprehensive API specifications for the Open Banking MVP, including all endpoints, required scopes, request/response examples, and error handling.

## Base URLs

| Environment | Base URL |
|-------------|----------|
| Local Development | `http://localhost:8080` |
| Production | `https://api.openbanking.example.com` |

## Authentication

All protected API endpoints require OAuth 2.0 Bearer token authentication:

```http
Authorization: Bearer <access_token>
```

Tokens are obtained through the OAuth 2.0 Authorization Code flow (see [OAuth Endpoints](#oauth-endpoints)).

## API Endpoints

### OAuth Endpoints

#### 1. Authorization Request

Initiates the OAuth 2.0 authorization flow.

**Endpoint**: `GET /oauth/authorize`

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `client_id` | string | Yes | OAuth client identifier |
| `redirect_uri` | string | Yes | Callback URI (must match registration) |
| `response_type` | string | Yes | Must be `code` |
| `scope` | string | Yes | Space-separated list of scopes |
| `state` | string | Recommended | CSRF protection token |

**Supported Scopes**:
- `accounts:read` - Read account information
- `transactions:read` - Read transaction history
- `balances:read` - Read account balances
- `profile:read` - Read customer profile

**Example Request**:
```http
GET /oauth/authorize?client_id=fintech-demo-client&redirect_uri=http://localhost:3000/callback&response_type=code&scope=accounts:read%20transactions:read&state=xyz123 HTTP/1.1
Host: localhost:8080
```

**Success Response** (after customer approval):
```http
HTTP/1.1 302 Found
Location: http://localhost:3000/callback?code=authcode_abc123&state=xyz123
```

**Error Response** (customer denies):
```http
HTTP/1.1 302 Found
Location: http://localhost:3000/callback?error=access_denied&error_description=Customer+denied+consent&state=xyz123
```

---

#### 2. Token Exchange

Exchanges authorization code for access token.

**Endpoint**: `POST /oauth/token`

**Authentication**: Basic Auth with `client_id:client_secret`

**Headers**:
```http
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded
```

**Request Body**:
```
grant_type=authorization_code&
code=authcode_abc123&
redirect_uri=http://localhost:3000/callback
```

**Example Request**:
```http
POST /oauth/token HTTP/1.1
Host: localhost:8080
Authorization: Basic ZmludGVjaC1kZW1vLWNsaWVudDpzZWNyZXQ=
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=authcode_abc123&redirect_uri=http://localhost:3000/callback
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjdXN0b21lcl9pZCI6IkNVU1QtMDAxIiwiY2xpZW50X2lkIjoiZmludGVjaC1kZW1vLWNsaWVudCIsInNjb3BlIjoiYWNjb3VudHM6cmVhZCB0cmFuc2FjdGlvbnM6cmVhZCIsImlhdCI6MTYyNjE4MDAwMCwiZXhwIjoxNjI2MTgzNjAwfQ.signature",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "accounts:read transactions:read"
}
```

**Error Response** (invalid code):
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_grant",
  "error_description": "Authorization code is invalid or expired"
}
```

---

### Banking API Endpoints

All banking API endpoints require:
1. Valid OAuth access token
2. Active customer consent
3. Appropriate scope in token and consent

#### 3. List Accounts

Retrieves all accounts for the authenticated customer.

**Endpoint**: `GET /api/v1/accounts`

**Required Scope**: `accounts:read`

**Headers**:
```http
Authorization: Bearer <access_token>
```

**Example Request**:
```http
GET /api/v1/accounts HTTP/1.1
Host: localhost:8080
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "accounts": [
    {
      "account_id": "acc-001",
      "account_number": "****1234",
      "account_type": "checking",
      "currency": "USD",
      "balance": {
        "current": 5420.50,
        "available": 5420.50
      },
      "status": "active",
      "opened_date": "2023-01-15T00:00:00.000Z"
    },
    {
      "account_id": "acc-002",
      "account_number": "****5678",
      "account_type": "savings",
      "currency": "USD",
      "balance": {
        "current": 12500.00,
        "available": 12500.00
      },
      "status": "active",
      "opened_date": "2023-03-20T00:00:00.000Z"
    }
  ],
  "total": 2
}
```

**Error Response** (insufficient scope):
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "insufficient_scope",
  "error_description": "This endpoint requires one of the following scopes: accounts:read",
  "required_scopes": ["accounts:read"],
  "granted_scopes": ["transactions:read"]
}
```

**Error Response** (no consent):
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "consent_required",
  "error_description": "No valid consent found for this request"
}
```

**Error Response** (expired token):
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "invalid_token",
  "error_description": "Token has expired"
}
```

---

#### 4. Get Account Details

Retrieves details for a specific account.

**Endpoint**: `GET /api/v1/accounts/:account_id`

**Required Scope**: `accounts:read`

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `account_id` | string | Account identifier |

**Headers**:
```http
Authorization: Bearer <access_token>
```

**Example Request**:
```http
GET /api/v1/accounts/acc-001 HTTP/1.1
Host: localhost:8080
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "account_id": "acc-001",
  "account_number": "****1234",
  "account_type": "checking",
  "currency": "USD",
  "balance": {
    "current": 5420.50,
    "available": 5420.50
  },
  "status": "active",
  "opened_date": "2023-01-15T00:00:00.000Z"
}
```

**Error Response** (account not found):
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "not_found",
  "error_description": "Account not found or not accessible"
}
```

---

#### 5. Get Account Balance

Retrieves the current balance for a specific account.

**Endpoint**: `GET /api/v1/accounts/:account_id/balance`

**Required Scope**: `balances:read` OR `accounts:read` (fallback)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `account_id` | string | Account identifier |

**Headers**:
```http
Authorization: Bearer <access_token>
```

**Example Request**:
```http
GET /api/v1/accounts/acc-001/balance HTTP/1.1
Host: localhost:8080
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "account_id": "acc-001",
  "currency": "USD",
  "balance": {
    "current": 5420.50,
    "available": 5420.50
  },
  "as_of": "2026-08-13T16:45:00.000Z"
}
```

---

#### 6. List Transactions

Retrieves transaction history for a specific account.

**Endpoint**: `GET /api/v1/accounts/:account_id/transactions`

**Required Scope**: `transactions:read`

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `account_id` | string | Account identifier |

**Query Parameters** (optional):

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `from_date` | string | Start date (ISO 8601) | 30 days ago |
| `to_date` | string | End date (ISO 8601) | Today |
| `limit` | integer | Max results | 100 |

**Headers**:
```http
Authorization: Bearer <access_token>
```

**Example Request**:
```http
GET /api/v1/accounts/acc-001/transactions?from_date=2026-07-01&to_date=2026-08-13&limit=50 HTTP/1.1
Host: localhost:8080
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "account_id": "acc-001",
  "transactions": [
    {
      "transaction_id": "txn-001",
      "date": "2026-08-12T14:30:00.000Z",
      "description": "Online Purchase - Amazon",
      "amount": -89.99,
      "currency": "USD",
      "type": "debit",
      "category": "shopping",
      "balance_after": 5420.50
    },
    {
      "transaction_id": "txn-002",
      "date": "2026-08-10T09:15:00.000Z",
      "description": "Salary Deposit",
      "amount": 3500.00,
      "currency": "USD",
      "type": "credit",
      "category": "income",
      "balance_after": 5510.49
    },
    {
      "transaction_id": "txn-003",
      "date": "2026-08-08T16:45:00.000Z",
      "description": "ATM Withdrawal",
      "amount": -200.00,
      "currency": "USD",
      "type": "debit",
      "category": "cash",
      "balance_after": 2010.49
    }
  ],
  "total": 3,
  "from_date": "2026-07-01T00:00:00.000Z",
  "to_date": "2026-08-13T23:59:59.999Z"
}
```

**Error Response** (insufficient scope):
```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "insufficient_scope",
  "error_description": "This endpoint requires one of the following scopes: transactions:read",
  "required_scopes": ["transactions:read"],
  "granted_scopes": ["accounts:read"]
}
```

---

#### 7. Get Customer Profile

Retrieves profile information for the authenticated customer.

**Endpoint**: `GET /api/v1/profile`

**Required Scope**: `profile:read`

**Headers**:
```http
Authorization: Bearer <access_token>
```

**Example Request**:
```http
GET /api/v1/profile HTTP/1.1
Host: localhost:8080
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "customer_id": "CUST-001",
  "name": "Maria Garcia",
  "email": "maria.garcia@example.com",
  "phone": "+1-555-0123",
  "address": {
    "street": "123 Main Street",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94102",
    "country": "US"
  },
  "customer_since": "2023-01-15T00:00:00.000Z"
}
```

---

### Consent Management Endpoints

#### 8. Get Consent Page Data

Loads consent page data for customer approval (used by consent UI).

**Endpoint**: `GET /api/consent/page`

**Authentication**: Customer session token

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `auth_request_id` | string | Yes | Authorization request identifier |

**Headers**:
```http
X-Customer-Session: <session_token>
```

**Example Request**:
```http
GET /api/consent/page?auth_request_id=authreq_abc123 HTTP/1.1
Host: localhost:8080
X-Customer-Session: dGhpc19pc19hX3Nlc3Npb25fdG9rZW4...
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "auth_request_id": "authreq_abc123",
  "client": {
    "client_id": "fintech-demo-client",
    "name": "Budget Tracker Pro",
    "description": "Personal finance management application",
    "logo_uri": "https://example.com/logo.png",
    "policy_uri": "https://example.com/privacy",
    "tos_uri": "https://example.com/terms"
  },
  "customer": {
    "customer_id": "CUST-001",
    "name": "Maria Garcia",
    "email": "maria.garcia@example.com"
  },
  "requested_scopes": ["accounts:read", "transactions:read"],
  "scope_descriptions": {
    "accounts:read": {
      "title": "View your accounts",
      "description": "Read your account numbers, types, and basic information"
    },
    "transactions:read": {
      "title": "View your transactions",
      "description": "Read your transaction history and details"
    }
  },
  "redirect_uri": "http://localhost:3000/callback",
  "state": "xyz123"
}
```

---

#### 9. Submit Consent Decision

Submits customer's consent decision (approve or deny).

**Endpoint**: `POST /api/consent/decision`

**Authentication**: Customer session token

**Headers**:
```http
X-Customer-Session: <session_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "auth_request_id": "authreq_abc123",
  "action": "approve",
  "granted_scopes": ["accounts:read", "transactions:read"]
}
```

**Example Request**:
```http
POST /api/consent/decision HTTP/1.1
Host: localhost:8080
X-Customer-Session: dGhpc19pc19hX3Nlc3Npb25fdG9rZW4...
Content-Type: application/json

{
  "auth_request_id": "authreq_abc123",
  "action": "approve",
  "granted_scopes": ["accounts:read", "transactions:read"]
}
```

**Success Response** (approval):
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "code": "authcode_xyz789",
  "consent_id": "consent-abc123",
  "granted_scopes": ["accounts:read", "transactions:read"],
  "redirect_uri": "http://localhost:3000/callback",
  "state": "xyz123"
}
```

**Success Response** (denial):
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": false,
  "error": "access_denied",
  "error_description": "Customer denied consent",
  "should_redirect": true,
  "redirect_uri": "http://localhost:3000/callback",
  "state": "xyz123"
}
```

---

#### 10. Revoke Consent

Revokes an approved consent.

**Endpoint**: `POST /api/consent/revoke`

**Authentication**: Customer session token

**Headers**:
```http
X-Customer-Session: <session_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "consent_id": "consent-abc123",
  "reason": "No longer using this application"
}
```

**Example Request**:
```http
POST /api/consent/revoke HTTP/1.1
Host: localhost:8080
X-Customer-Session: dGhpc19pc19hX3Nlc3Npb25fdG9rZW4...
Content-Type: application/json

{
  "consent_id": "consent-abc123",
  "reason": "No longer using this application"
}
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "consent_id": "consent-abc123",
  "revoked_at": "2026-08-13T16:45:00.000Z"
}
```

---

#### 11. List Customer Consents

Retrieves list of customer's consents.

**Endpoint**: `GET /api/consent/list`

**Authentication**: Customer session token

**Query Parameters** (optional):

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (approved, revoked, expired) |
| `client_id` | string | Filter by client |
| `active_only` | boolean | Only active consents |

**Headers**:
```http
X-Customer-Session: <session_token>
```

**Example Request**:
```http
GET /api/consent/list?active_only=true HTTP/1.1
Host: localhost:8080
X-Customer-Session: dGhpc19pc19hX3Nlc3Npb25fdG9rZW4...
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "consents": [
    {
      "consent_id": "consent-abc123",
      "client": {
        "name": "Budget Tracker Pro",
        "description": "Personal finance management",
        "logo_uri": "https://example.com/logo.png"
      },
      "purpose": "Budget Tracker - Access to banking data",
      "granted_scopes": ["accounts:read", "transactions:read"],
      "status": "approved",
      "created_at": "2026-08-13T10:00:00.000Z",
      "approved_at": "2026-08-13T10:05:00.000Z",
      "expires_at": "2026-11-11T10:05:00.000Z",
      "revoked_at": null,
      "revocation_reason": null
    }
  ]
}
```

---

### Customer Authentication Endpoints

**Note**: These endpoints use DEMO authentication and are NOT production-ready. They do NOT implement Strong Customer Authentication (SCA) required by PSD2.

#### 12. Customer Login

Authenticates a customer and creates a session.

**Endpoint**: `POST /auth/login`

**Request Body**:
```json
{
  "email": "maria.garcia@example.com",
  "password": "demo123"
}
```

**Example Request**:
```http
POST /auth/login HTTP/1.1
Host: localhost:8080
Content-Type: application/json

{
  "email": "maria.garcia@example.com",
  "password": "demo123"
}
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "customer_id": "CUST-001",
  "customer_name": "Maria Garcia",
  "session_token": "dGhpc19pc19hX3Nlc3Npb25fdG9rZW4...",
  "expires_at": "2026-08-13T17:15:00.000Z",
  "authentication_method": "demo",
  "warning": "DEMO AUTHENTICATION - Not SCA compliant"
}
```

**Error Response** (invalid credentials):
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "invalid_credentials",
  "error_description": "Email or password is incorrect"
}
```

---

#### 13. Verify Session

Verifies a customer session token.

**Endpoint**: `GET /auth/verify`

**Headers**:
```http
X-Customer-Session: <session_token>
```

**Example Request**:
```http
GET /auth/verify HTTP/1.1
Host: localhost:8080
X-Customer-Session: dGhpc19pc19hX3Nlc3Npb25fdG9rZW4...
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "valid": true,
  "customer_id": "CUST-001",
  "customer_name": "Maria Garcia",
  "expires_at": "2026-08-13T17:15:00.000Z"
}
```

**Error Response** (invalid session):
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "valid": false,
  "error": "invalid_session",
  "error_description": "Session is invalid or expired"
}
```

---

#### 14. Customer Logout

Terminates a customer session.

**Endpoint**: `POST /auth/logout`

**Headers**:
```http
X-Customer-Session: <session_token>
```

**Example Request**:
```http
POST /auth/logout HTTP/1.1
Host: localhost:8080
X-Customer-Session: dGhpc19pc19hX3Nlc3Npb25fdG9rZW4...
```

**Success Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Error Responses

### Standard Error Format

All error responses follow this format:

```json
{
  "error": "error_code",
  "error_description": "Human-readable description"
}
```

### HTTP Status Codes

| Status Code | Meaning | When Used |
|-------------|---------|-----------|
| 200 OK | Success | Successful request |
| 400 Bad Request | Invalid request | Malformed request, missing parameters |
| 401 Unauthorized | Authentication failed | Invalid/expired token, missing token |
| 403 Forbidden | Authorization failed | Insufficient scope, no consent, revoked consent |
| 404 Not Found | Resource not found | Account/resource doesn't exist |
| 429 Too Many Requests | Rate limit exceeded | Client exceeded rate limit |
| 500 Internal Server Error | Server error | Unexpected server error |

### Common Error Codes

#### Authentication Errors (401)
- `invalid_token` - Token is invalid or malformed
- `expired_token` - Token has expired
- `missing_token` - No token provided
- `invalid_credentials` - Login credentials incorrect
- `invalid_session` - Session token invalid or expired

#### Authorization Errors (403)
- `insufficient_scope` - Token lacks required scope
- `consent_required` - No valid consent found
- `revoked_consent` - Consent has been revoked
- `expired_consent` - Consent has expired
- `access_denied` - Customer denied consent

#### Rate Limiting Errors (429)
- `rate_limit_exceeded` - Too many requests

#### Client Errors (400)
- `invalid_request` - Malformed request
- `invalid_grant` - Authorization code invalid
- `unsupported_grant_type` - Grant type not supported

### Rate Limit Headers

Rate-limited responses include these headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1626183600
```

---

## Scope Requirements Summary

| Endpoint | Required Scope | Alternative Scope |
|----------|----------------|-------------------|
| GET /api/v1/accounts | `accounts:read` | - |
| GET /api/v1/accounts/:id | `accounts:read` | - |
| GET /api/v1/accounts/:id/balance | `balances:read` | `accounts:read` |
| GET /api/v1/accounts/:id/transactions | `transactions:read` | - |
| GET /api/v1/profile | `profile:read` | - |

---

## Rate Limiting

### Default Limits

- **Per Client**: 100 requests per minute
- **Test Mode**: 10 requests per 10 seconds

### Rate Limit Response

When rate limit is exceeded:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1626183600

{
  "error": "rate_limit_exceeded",
  "error_description": "Rate limit exceeded. Please retry after the reset time.",
  "retry_after": 60
}
```

---

## Security Considerations

### Token Security

1. **Never expose tokens** in URLs or logs
2. **Use HTTPS** in production (required)
3. **Store tokens securely** on client side
4. **Implement token refresh** before expiration
5. **Revoke tokens** when no longer needed

### Scope Minimization

1. **Request minimum scopes** needed for functionality
2. **Explain scope usage** to customers clearly
3. **Handle partial approval** gracefully
4. **Re-request scopes** if requirements change

### Error Handling

1. **Don't expose sensitive data** in error messages
2. **Log errors** for debugging (server-side only)
3. **Provide actionable errors** to clients
4. **Handle rate limits** with exponential backoff

---

## Demo Credentials

For testing purposes only:

### Demo Customers

| Name | Email | Password | Customer ID |
|------|-------|----------|-------------|
| Maria Garcia | maria.garcia@example.com | demo123 | CUST-001 |
| Carlos Rodriguez | carlos.rodriguez@example.com | demo123 | CUST-002 |
| Ana Martinez | ana.martinez@example.com | demo123 | CUST-003 |

### Demo OAuth Client

| Field | Value |
|-------|-------|
| Client ID | fintech-demo-client |
| Client Secret | demo-secret-key-not-for-production |
| Redirect URI | http://localhost:3000/callback |
| Allowed Scopes | accounts:read, transactions:read, balances:read, profile:read |

**Warning**: These credentials are for DEMO purposes only and must NOT be used in production.

