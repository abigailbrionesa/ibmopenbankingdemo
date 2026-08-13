# Banking APIs

This document describes the protected banking APIs for accessing customer account data in the Open Banking MVP.

## Overview

The Banking APIs provide secure, OAuth-protected access to customer banking data. All endpoints require:
- Valid OAuth access token
- Active consent
- Appropriate scopes
- Customer data isolation

## Base URL

```
https://api.openbanking.example.com/api/v1
```

## Authentication

All requests must include a valid OAuth Bearer token:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Endpoints

### List Accounts

Get all accounts for the authenticated customer.

```
GET /api/v1/accounts
```

**Required Scope:** `accounts:read`

**Response (200 OK):**
```json
{
  "accounts": [
    {
      "account_id": "ACC-001",
      "account_number": "****1234",
      "account_type": "checking",
      "currency": "USD",
      "balance": {
        "current": 5420.50,
        "available": 5420.50
      },
      "status": "active",
      "opened_date": "2020-01-15T00:00:00Z"
    },
    {
      "account_id": "ACC-002",
      "account_number": "****5678",
      "account_type": "savings",
      "currency": "USD",
      "balance": {
        "current": 12500.00,
        "available": 12500.00
      },
      "status": "active",
      "opened_date": "2020-03-20T00:00:00Z"
    }
  ],
  "total": 2
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `account_id` | string | Unique account identifier |
| `account_number` | string | Masked account number (last 4 digits) |
| `account_type` | string | Account type: checking, savings, credit |
| `currency` | string | ISO 4217 currency code |
| `balance.current` | number | Current balance |
| `balance.available` | number | Available balance |
| `status` | string | Account status: active, closed |
| `opened_date` | string | ISO 8601 date when account was opened |

**Error Responses:**

- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Insufficient scope or revoked consent
- `500 Internal Server Error` - Server error

### Get Account Details

Get detailed information for a specific account.

```
GET /api/v1/accounts/{account_id}
```

**Required Scope:** `accounts:read`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `account_id` | string | Account identifier |

**Response (200 OK):**
```json
{
  "account_id": "ACC-001",
  "account_number": "****1234",
  "account_type": "checking",
  "currency": "USD",
  "balance": {
    "current": 5420.50,
    "available": 5420.50
  },
  "status": "active",
  "opened_date": "2020-01-15T00:00:00Z",
  "closed_date": null,
  "transaction_count": 156
}
```

**Error Responses:**

- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Insufficient scope or revoked consent
- `404 Not Found` - Account not found or doesn't belong to customer
- `500 Internal Server Error` - Server error

### Get Account Balance

Get current balance for a specific account.

```
GET /api/v1/accounts/{account_id}/balance
```

**Required Scope:** `balances:read`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `account_id` | string | Account identifier |

**Response (200 OK):**
```json
{
  "account_id": "ACC-001",
  "currency": "USD",
  "balance": {
    "current": 5420.50,
    "available": 5420.50
  },
  "as_of": "2026-08-13T15:00:00Z"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `account_id` | string | Account identifier |
| `currency` | string | ISO 4217 currency code |
| `balance.current` | number | Current balance |
| `balance.available` | number | Available balance (current - holds) |
| `as_of` | string | ISO 8601 timestamp of balance |

### Get Account Transactions

Get transaction history for a specific account.

```
GET /api/v1/accounts/{account_id}/transactions
```

**Required Scope:** `transactions:read`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `account_id` | string | Account identifier |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | integer | No | Number of transactions to return (default: 50, max: 100) |
| `offset` | integer | No | Number of transactions to skip (default: 0) |
| `from_date` | string | No | ISO 8601 date - filter transactions from this date |
| `to_date` | string | No | ISO 8601 date - filter transactions to this date |

**Response (200 OK):**
```json
{
  "transactions": [
    {
      "id": "TXN-001",
      "account_id": "ACC-001",
      "date": "2026-08-13",
      "amount": -45.67,
      "currency": "USD",
      "type": "debit",
      "description": "Coffee Shop Purchase",
      "merchant": "Starbucks",
      "category": "food_and_drink",
      "status": "completed"
    },
    {
      "id": "TXN-002",
      "account_id": "ACC-001",
      "date": "2026-08-12",
      "amount": 2500.00,
      "currency": "USD",
      "type": "credit",
      "description": "Salary Deposit",
      "merchant": "Employer Inc",
      "category": "income",
      "status": "completed"
    }
  ],
  "pagination": {
    "total": 156,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

**Transaction Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique transaction identifier |
| `account_id` | string | Account identifier |
| `date` | string | Transaction date (YYYY-MM-DD) |
| `amount` | number | Transaction amount (negative for debits) |
| `currency` | string | ISO 4217 currency code |
| `type` | string | Transaction type: debit, credit |
| `description` | string | Transaction description |
| `merchant` | string | Merchant name (if applicable) |
| `category` | string | Transaction category |
| `status` | string | Transaction status: pending, completed, failed |

**Pagination Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `total` | integer | Total number of transactions |
| `limit` | integer | Number of transactions returned |
| `offset` | integer | Number of transactions skipped |
| `has_more` | boolean | Whether more transactions are available |

## Security

### Customer Data Isolation

All endpoints automatically filter data to the authenticated customer:

```javascript
// Customer ID extracted from OAuth token
const customer_id = req.oauth_token.customer_id;

// Query only returns data for this customer
const accounts = await query(
  'SELECT * FROM accounts WHERE customer_id = $1',
  [customer_id]
);
```

**Cross-Customer Access Prevention:**
- Attempting to access another customer's account returns `404 Not Found`
- No data leakage - error messages don't reveal account existence
- All queries include customer_id filter

### Scope Enforcement

Each endpoint requires specific scopes:

| Endpoint | Required Scope |
|----------|----------------|
| `GET /accounts` | `accounts:read` |
| `GET /accounts/{id}` | `accounts:read` |
| `GET /accounts/{id}/balance` | `balances:read` |
| `GET /accounts/{id}/transactions` | `transactions:read` |

**Insufficient Scope Response (403):**
```json
{
  "error": "insufficient_scope",
  "error_description": "This resource requires 'transactions:read' scope",
  "required_scope": "transactions:read",
  "granted_scopes": ["accounts:read", "balances:read"]
}
```

### Consent Validation

Every request validates consent status:

1. **Token Validation** - Verify JWT signature and expiration
2. **Consent Check** - Ensure consent is approved and not expired/revoked
3. **Scope Check** - Verify token scopes match endpoint requirements

**Revoked Consent Response (403):**
```json
{
  "error": "forbidden",
  "error_description": "Consent has been revoked",
  "consent_id": "consent_abc123",
  "status": "revoked"
}
```

### Account Number Masking

Account numbers are always masked in API responses:

```javascript
function maskAccountNumber(accountNumber) {
  const lastFour = accountNumber.slice(-4);
  return `****${lastFour}`;
}
```

**Example:**
- Full number: `1234567890`
- Masked: `****7890`

## Usage Examples

### Example 1: List All Accounts

```javascript
const response = await fetch('https://api.openbanking.example.com/api/v1/accounts', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const data = await response.json();

if (response.ok) {
  console.log(`Found ${data.total} accounts`);
  data.accounts.forEach(account => {
    console.log(`${account.account_type}: ${account.balance.current} ${account.currency}`);
  });
} else {
  console.error('Error:', data.error_description);
}
```

### Example 2: Get Account Details

```javascript
async function getAccountDetails(accountId, accessToken) {
  const response = await fetch(
    `https://api.openbanking.example.com/api/v1/accounts/${accountId}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );
  
  if (response.status === 404) {
    throw new Error('Account not found');
  }
  
  if (response.status === 403) {
    const error = await response.json();
    if (error.error === 'forbidden' && error.status === 'revoked') {
      throw new Error('Consent has been revoked. Please re-authorize.');
    }
  }
  
  return await response.json();
}
```

### Example 3: Get Recent Transactions

```javascript
async function getRecentTransactions(accountId, accessToken, days = 30) {
  const toDate = new Date().toISOString().split('T')[0];
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  
  const url = new URL(
    `https://api.openbanking.example.com/api/v1/accounts/${accountId}/transactions`
  );
  url.searchParams.set('from_date', fromDate);
  url.searchParams.set('to_date', toDate);
  url.searchParams.set('limit', '50');
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  return await response.json();
}
```

### Example 4: Paginate Through All Transactions

```javascript
async function getAllTransactions(accountId, accessToken) {
  const allTransactions = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;
  
  while (hasMore) {
    const response = await fetch(
      `https://api.openbanking.example.com/api/v1/accounts/${accountId}/transactions?limit=${limit}&offset=${offset}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    const data = await response.json();
    allTransactions.push(...data.transactions);
    
    hasMore = data.pagination.has_more;
    offset += limit;
  }
  
  return allTransactions;
}
```

## Error Handling

### Standard Error Response

```json
{
  "error": "error_code",
  "error_description": "Human-readable error description"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `unauthorized` | 401 | Missing or invalid token |
| `invalid_token` | 401 | Token expired or revoked |
| `forbidden` | 403 | Consent revoked or expired |
| `insufficient_scope` | 403 | Token lacks required scope |
| `not_found` | 404 | Resource not found or no access |
| `server_error` | 500 | Internal server error |

### Error Handling Best Practices

```javascript
async function makeApiCall(url, accessToken) {
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      
      switch (response.status) {
        case 401:
          // Token expired or invalid
          await refreshToken();
          return makeApiCall(url, newAccessToken);
          
        case 403:
          if (error.error === 'forbidden' && error.status === 'revoked') {
            // Consent revoked - need re-authorization
            redirectToAuthorization();
          } else if (error.error === 'insufficient_scope') {
            // Need additional scopes
            requestAdditionalScopes(error.required_scope);
          }
          break;
          
        case 404:
          // Resource not found
          console.log('Resource not found');
          break;
          
        case 500:
          // Server error - retry with backoff
          await retryWithBackoff(() => makeApiCall(url, accessToken));
          break;
      }
      
      throw new Error(error.error_description);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}
```

## Testing

Comprehensive tests are available in [`tests/banking-api/accounts-api.test.js`](../tests/banking-api/accounts-api.test.js):

- Account list endpoint
- Account detail endpoint
- Balance endpoint
- Transactions endpoint with pagination
- Cross-customer access denial
- Scope enforcement
- Token validation

Run tests:

```bash
npm test tests/banking-api/
```

## Rate Limiting

(To be implemented)

Recommended rate limits:
- 100 requests per minute per access token
- 1000 requests per hour per client
- Burst allowance: 20 requests

## Related Documentation

- [OAuth Authorization Flow](./oauth-authorization-flow.md)
- [Token Exchange](./token-exchange.md)
- [Consent Model](./consent-model.md)
- [Consent Revocation](./consent-revocation.md)

## References

- [Open Banking UK API Specifications](https://standards.openbanking.org.uk/)
- [PSD2 Regulatory Technical Standards](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32018R0389)