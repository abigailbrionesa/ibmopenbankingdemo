# Granular Consent Model

This document describes the purpose-driven consent model for the Open Banking MVP, which binds customer authorization to specific fintech applications with explicit scope approval.

## Overview

The consent model implements a granular, purpose-driven approach to customer authorization that:

- **Captures explicit customer approval** for each fintech application
- **Binds consent to specific scopes** (data access permissions)
- **Tracks consent lifecycle** (pending, approved, denied, revoked, expired)
- **Enables customer control** through revocation and expiration
- **Links authorization codes to approved consents** ensuring no code is issued without consent

## Consent Record Structure

### Database Schema

```sql
CREATE TABLE consents (
  consent_id VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(50) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  purpose TEXT NOT NULL,
  requested_scopes TEXT NOT NULL,
  granted_scopes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP,
  denied_at TIMESTAMP,
  revoked_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revocation_reason TEXT,
  revoked_by VARCHAR(50),
  ip_address VARCHAR(45),
  user_agent TEXT
);
```

### Consent States

| State | Description | Transitions To |
|-------|-------------|----------------|
| `pending` | Awaiting customer decision | `approved`, `denied`, `expired` |
| `approved` | Customer granted consent | `revoked`, `expired` |
| `denied` | Customer rejected consent | *(terminal state)* |
| `revoked` | Consent was revoked | *(terminal state)* |
| `expired` | Consent expired | *(terminal state)* |

### State Transition Diagram

```
┌─────────┐
│ pending │
└────┬────┘
     │
     ├──────────> approved ──────┐
     │                           │
     ├──────────> denied         ├──> revoked
     │                           │
     └──────────> expired <──────┘
```

## Consent Lifecycle

### 1. Consent Creation

Consents are created when a customer reaches the authorization endpoint:

```javascript
const consent = await createConsent({
  customer_id: 'CUST-001',
  client_id: 'fintech-demo-client',
  purpose: 'Budget Tracker - Access to banking data',
  requested_scopes: ['accounts:read', 'transactions:read'],
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0...',
  expiration_days: 90  // Default: 90 days
});
```

**Properties:**
- **consent_id**: Unique identifier with `consent_` prefix
- **purpose**: Human-readable explanation of why data access is needed
- **requested_scopes**: Scopes requested by the fintech application
- **status**: Initially set to `pending`
- **expires_at**: Set to 90 days from creation (configurable)

### 2. Customer Approval

Customer reviews the consent request and approves:

```javascript
const approved = await approveConsent(
  consent_id,
  customer_id,
  granted_scopes  // Optional: subset of requested scopes
);
```

**Approval Options:**
- **Full approval**: Grant all requested scopes
- **Partial approval**: Grant subset of requested scopes
- **Reuse existing**: If active consent exists with sufficient scopes, reuse it

**Result:**
- Status changes to `approved`
- `approved_at` timestamp set
- `granted_scopes` populated (may differ from `requested_scopes`)
- Authorization code issued and linked to consent

### 3. Customer Denial

Customer rejects the consent request:

```javascript
const denied = await denyConsent(consent_id, customer_id);
```

**Result:**
- Status changes to `denied`
- `denied_at` timestamp set
- No authorization code issued
- Customer redirected with `access_denied` error

### 4. Consent Revocation

Customer or system revokes an approved consent:

```javascript
const revoked = await revokeConsent(
  consent_id,
  revoked_by,  // customer_id or 'system'
  reason       // Optional reason
);
```

**Result:**
- Status changes to `revoked`
- `revoked_at` timestamp set
- `revoked_by` and `revocation_reason` recorded
- All associated access tokens invalidated

### 5. Consent Expiration

Consents automatically expire after the configured period (default: 90 days):

```javascript
const expiredCount = await expireOldConsents();
```

**Expiration Process:**
- Batch job runs periodically
- Approved consents past `expires_at` marked as `expired`
- Access tokens remain valid until their own expiration
- Customer must re-authorize for continued access

## Scope Management

### Supported Scopes

| Scope | Description | Data Access |
|-------|-------------|-------------|
| `accounts:read` | View accounts | Account numbers, types, basic info |
| `transactions:read` | View transactions | Transaction history and details |
| `balances:read` | View balances | Current and available balances |
| `profile:read` | View profile | Name, email, contact information |

### Scope Validation

Two-level validation ensures security:

1. **Server-level**: Scope must be in supported scopes list
2. **Client-level**: Scope must be in client's allowed scopes
3. **Consent-level**: Customer can grant subset of requested scopes

**Example:**

```javascript
// Client registration
allowed_scopes: ['accounts:read', 'balances:read']

// Authorization request
requested_scopes: ['accounts:read', 'transactions:read']
// ❌ Rejected: transactions:read not in client's allowed scopes

// Authorization request (corrected)
requested_scopes: ['accounts:read', 'balances:read']
// ✅ Accepted

// Customer approval
granted_scopes: ['accounts:read']
// ✅ Accepted: subset of requested scopes
```

## Authorization Code Linkage

Authorization codes are **always** linked to approved consents:

```sql
CREATE TABLE authorization_codes (
  code VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(50) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  consent_id VARCHAR(255) NOT NULL,  -- Required link
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  used BOOLEAN DEFAULT FALSE,
  CONSTRAINT fk_authcode_consent FOREIGN KEY (consent_id) 
    REFERENCES consents(consent_id) ON DELETE CASCADE
);
```

**Key Points:**
- Authorization code **cannot** be issued without approved consent
- Code inherits scopes from consent's `granted_scopes`
- Code expiration is independent (10 minutes)
- Consent expiration doesn't invalidate existing codes

## Consent Queries

### Find Active Consent

Check if customer has active consent for client with required scopes:

```javascript
const activeConsent = await findActiveConsent(
  customer_id,
  client_id,
  required_scopes
);

if (activeConsent) {
  // Reuse existing consent
} else {
  // Create new consent
}
```

**Active Criteria:**
- Status is `approved`
- Not expired (`expires_at > CURRENT_TIMESTAMP`)
- Granted scopes include all required scopes

### Get Customer Consents

Retrieve all consents for a customer:

```javascript
const consents = await getCustomerConsents(customer_id, {
  status: 'approved',      // Optional filter
  client_id: 'client-123', // Optional filter
  active_only: true        // Only active consents
});
```

### Get Client Consents

Retrieve all consents for a client:

```javascript
const consents = await getClientConsents(client_id, {
  status: 'approved',
  active_only: true
});
```

### Consent Statistics

Get consent statistics for a customer:

```javascript
const stats = await getConsentStatistics(customer_id);
// Returns: { total, active, pending, revoked, expired, denied }
```

## API Endpoints

### GET /api/consent/page

Load consent page data for customer approval.

**Query Parameters:**
- `auth_request_id` (required): Authorization request identifier

**Response:**
```json
{
  "success": true,
  "auth_request_id": "authreq_abc123",
  "client": {
    "client_id": "fintech-demo-client",
    "name": "Budget Tracker",
    "description": "Personal finance management",
    "logo_uri": "https://...",
    "policy_uri": "https://...",
    "tos_uri": "https://..."
  },
  "customer": {
    "customer_id": "CUST-001",
    "name": "Jane Doe",
    "email": "jane.doe@example.com"
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
  "existing_consent": {
    "consent_id": "consent_xyz789",
    "granted_scopes": ["accounts:read"],
    "approved_at": "2026-08-13T10:00:00Z",
    "expires_at": "2026-11-11T10:00:00Z"
  },
  "redirect_uri": "https://app.example.com/callback",
  "state": "random_state_123"
}
```

### POST /api/consent/decision

Submit customer's consent decision (approve or deny).

**Request Body:**
```json
{
  "auth_request_id": "authreq_abc123",
  "action": "approve",
  "granted_scopes": ["accounts:read"]  // Optional: subset of requested
}
```

**Success Response (Approval):**
```json
{
  "success": true,
  "code": "authcode_xyz789",
  "consent_id": "consent_abc123",
  "granted_scopes": ["accounts:read"],
  "redirect_uri": "https://app.example.com/callback",
  "state": "random_state_123"
}
```

**Error Response (Denial):**
```json
{
  "success": false,
  "error": "access_denied",
  "error_description": "Customer denied consent",
  "should_redirect": true,
  "redirect_uri": "https://app.example.com/callback",
  "state": "random_state_123"
}
```

### POST /api/consent/revoke

Revoke an approved consent.

**Request Body:**
```json
{
  "consent_id": "consent_abc123",
  "reason": "No longer using this application"
}
```

**Response:**
```json
{
  "success": true,
  "consent_id": "consent_abc123",
  "revoked_at": "2026-08-13T14:30:00Z"
}
```

### GET /api/consent/list

Get customer's consent list.

**Query Parameters:**
- `status` (optional): Filter by status
- `client_id` (optional): Filter by client
- `active_only` (optional): Only active consents

**Response:**
```json
{
  "success": true,
  "consents": [
    {
      "consent_id": "consent_abc123",
      "client": {
        "name": "Budget Tracker",
        "description": "Personal finance management",
        "logo_uri": "https://..."
      },
      "purpose": "Budget Tracker - Access to banking data",
      "granted_scopes": ["accounts:read", "transactions:read"],
      "status": "approved",
      "created_at": "2026-08-13T10:00:00Z",
      "approved_at": "2026-08-13T10:05:00Z",
      "expires_at": "2026-11-11T10:05:00Z",
      "revoked_at": null,
      "revocation_reason": null
    }
  ]
}
```

## Security Considerations

### Consent Binding

- Authorization codes **must** reference a consent
- Tokens inherit scopes from consent, not from authorization request
- Revoking consent invalidates all associated tokens

### Audit Trail

Every consent records:
- **Who**: `customer_id`, `client_id`
- **What**: `requested_scopes`, `granted_scopes`
- **When**: `created_at`, `approved_at`, `denied_at`, `revoked_at`
- **Where**: `ip_address`
- **How**: `user_agent`
- **Why**: `purpose`, `revocation_reason`

### Expiration Strategy

- **Consent expiration**: 90 days (configurable)
- **Authorization code expiration**: 10 minutes
- **Access token expiration**: 1 hour
- **Refresh token expiration**: 30 days

### Scope Minimization

Customers can grant **less** than requested:
- Fintech requests: `['accounts:read', 'transactions:read', 'balances:read']`
- Customer grants: `['accounts:read']`
- Result: Application receives only `accounts:read` scope

## Best Practices

### For Fintech Applications

1. **Request minimum scopes** needed for functionality
2. **Explain purpose clearly** in application description
3. **Handle partial approval** gracefully
4. **Monitor consent status** and prompt re-authorization before expiration
5. **Respect revocation** immediately

### For Banking Providers

1. **Display clear consent UI** with scope descriptions
2. **Enable easy revocation** through customer dashboard
3. **Send expiration reminders** to customers
4. **Audit consent usage** regularly
5. **Expire unused consents** proactively

### For Customers

1. **Review requested scopes** carefully before approving
2. **Grant minimum necessary** scopes
3. **Revoke unused consents** regularly
4. **Monitor active consents** in account settings
5. **Report suspicious activity** immediately

## Testing

Comprehensive test suites are available:

- [`tests/consent/consent-manager.test.js`](../tests/consent/consent-manager.test.js) - Consent lifecycle tests
- [`tests/consent/consent-handler.test.js`](../tests/consent/consent-handler.test.js) - API endpoint tests

Run tests:

```bash
npm test tests/consent/
```
