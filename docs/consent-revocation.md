# Consent Revocation

This document describes how consent revocation works in the Open Banking MVP and how it immediately blocks API access even when OAuth tokens are otherwise valid.

## Overview

Consent revocation is a critical security feature that allows customers to immediately terminate a fintech application's access to their banking data. When a consent is revoked:

1. The consent status changes to `revoked`
2. A revocation timestamp is recorded
3. All associated access tokens are invalidated
4. **API requests are blocked with 403 Forbidden**, even if the OAuth token hasn't expired

## Architecture

### Two-Layer Security

The system implements a two-layer security model:

```
┌─────────────────────────────────────────────────────────┐
│                    API Request                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  OAuth Token          │
         │  Validation           │
         │  (Layer 1)            │
         └───────────┬───────────┘
                     │
                     │ Token Valid?
                     ▼
         ┌───────────────────────┐
         │  Consent Status       │
         │  Validation           │
         │  (Layer 2)            │
         └───────────┬───────────┘
                     │
                     ├─ Approved → Allow (200 OK)
                     ├─ Revoked  → Block (403 Forbidden)
                     ├─ Expired  → Block (403 Forbidden)
                     └─ Denied   → Block (403 Forbidden)
```

**Key Principle**: A valid OAuth token is **necessary but not sufficient** for API access. The underlying consent must also be active.

## Revocation Flow

### Step 1: Customer Initiates Revocation

Customer can revoke consent through:
- Account settings dashboard
- Direct API call
- Customer support request

**API Endpoint:**
```http
POST /api/consents/{consent_id}/revoke
Authorization: Bearer {customer_session_token}
Content-Type: application/json

{
  "reason": "No longer using this application"
}
```

### Step 2: Consent Status Update

The system updates the consent record:

```sql
UPDATE consents 
SET 
  status = 'revoked',
  revoked_at = CURRENT_TIMESTAMP,
  revoked_by = 'CUST-001',
  revocation_reason = 'No longer using this application'
WHERE consent_id = 'consent_abc123';
```

**Response:**
```json
{
  "success": true,
  "consent_id": "consent_abc123",
  "revoked_at": "2026-08-13T14:30:00Z"
}
```

### Step 3: Token Invalidation

All access tokens associated with the consent are marked as revoked:

```sql
UPDATE access_tokens 
SET 
  revoked = true,
  revoked_at = CURRENT_TIMESTAMP 
WHERE consent_id = 'consent_abc123';
```

### Step 4: Immediate API Blocking

The next API request with the token is blocked by the consent validation middleware:

```javascript
// Gateway middleware checks consent status
const consent = await getConsent(token.consent_id);

if (consent.status === 'revoked') {
  return res.status(403).json({
    error: 'forbidden',
    error_description: 'Consent has been revoked',
    consent_id: consent.consent_id,
    status: 'revoked'
  });
}
```

## Implementation

### Revocation Endpoint

The revocation endpoint is implemented in [`auth/consent/consent-routes.js`](../auth/consent/consent-routes.js):

```javascript
router.post('/:consent_id/revoke', requireCustomerAuth, async (req, res) => {
  const { consent_id } = req.params;
  const { reason } = req.body;
  
  const result = await handleConsentRevocation(
    consent_id,
    req.customer_id,
    reason
  );
  
  if (!result.success) {
    const statusCode = result.error === 'not_found' ? 404 : 400;
    return res.status(statusCode).json(result);
  }
  
  res.json(result);
});
```

### Gateway Consent Validation

The gateway validates consent status on every API request in [`gateway/policies/consent-validation.js`](../gateway/policies/consent-validation.js):

```javascript
async function validateConsent(req, res, next) {
  const tokenPayload = req.oauth_token;
  const { consent_id } = tokenPayload;
  
  // Fetch consent from database
  const consent = await getConsent(consent_id);
  
  // Check if revoked
  if (consent.status === 'revoked') {
    return res.status(403).json({
      error: 'forbidden',
      error_description: 'Consent has been revoked',
      consent_id: consent_id,
      status: 'revoked'
    });
  }
  
  // Check other statuses and expiration...
  
  next();
}
```

## API Response Examples

### Before Revocation (200 OK)

```http
GET /api/accounts
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

HTTP/1.1 200 OK
Content-Type: application/json

{
  "accounts": [
    {
      "account_id": "ACC-001",
      "account_number": "****1234",
      "account_type": "checking",
      "balance": {
        "current": 5420.50,
        "available": 5420.50
      }
    }
  ]
}
```

### After Revocation (403 Forbidden)

```http
GET /api/accounts
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "forbidden",
  "error_description": "Consent has been revoked",
  "consent_id": "consent_abc123",
  "status": "revoked"
}
```

## Security Guarantees

### Immediate Effect

Revocation takes effect **immediately**:
- No grace period
- No cached consent status
- Every API request checks current consent status

### Token Independence

Revocation works independently of token expiration:
- Token may be valid for 1 hour
- Consent can be revoked at any time
- Revoked consent blocks access regardless of token validity

### Audit Trail

Every revocation is fully audited:

```sql
SELECT 
  consent_id,
  customer_id,
  client_id,
  status,
  revoked_at,
  revoked_by,
  revocation_reason
FROM consents
WHERE status = 'revoked';
```

**Example Record:**
```json
{
  "consent_id": "consent_abc123",
  "customer_id": "CUST-001",
  "client_id": "budget-tracker-app",
  "status": "revoked",
  "revoked_at": "2026-08-13T14:30:00Z",
  "revoked_by": "CUST-001",
  "revocation_reason": "No longer using this application"
}
```

## Testing

### Test Scenario: Valid Token → Revoke → Block

```javascript
// Step 1: Verify API access works
const response1 = await fetch('/api/accounts', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});
expect(response1.status).toBe(200);

// Step 2: Revoke consent
await fetch(`/api/consents/${consentId}/revoke`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${sessionToken}` },
  body: JSON.stringify({ reason: 'Test revocation' })
});

// Step 3: Verify API access is now blocked
const response2 = await fetch('/api/accounts', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});
expect(response2.status).toBe(403);
expect(await response2.json()).toMatchObject({
  error: 'forbidden',
  error_description: 'Consent has been revoked'
});
```

### Integration Tests

Comprehensive tests are available in [`tests/integration/consent-revocation.test.js`](../tests/integration/consent-revocation.test.js):

- API access before revocation (200 OK)
- Consent revocation process
- API access after revocation (403 Forbidden)
- Complete flow: Approve → Access → Revoke → Block
- Edge cases and error handling

Run tests:

```bash
npm test tests/integration/consent-revocation.test.js
```

## Customer Experience

### Revocation UI

Customers can revoke consent from their account dashboard:

```html
<div class="consent-card">
  <div class="consent-header">
    <img src="budget-tracker-logo.png" alt="Budget Tracker">
    <h3>Budget Tracker</h3>
  </div>
  
  <div class="consent-details">
    <p>Granted: August 13, 2026</p>
    <p>Expires: November 11, 2026</p>
    <p>Scopes: accounts:read, transactions:read</p>
  </div>
  
  <button class="btn-revoke" onclick="revokeConsent('consent_abc123')">
    Revoke Access
  </button>
</div>
```

### Revocation Confirmation

```javascript
async function revokeConsent(consentId) {
  if (!confirm('Are you sure you want to revoke access? The application will immediately lose access to your data.')) {
    return;
  }
  
  const response = await fetch(`/api/consents/${consentId}/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      reason: 'Customer requested revocation'
    })
  });
  
  if (response.ok) {
    alert('Access revoked successfully');
    location.reload();
  } else {
    alert('Failed to revoke access');
  }
}
```

## Fintech Application Handling

### Detecting Revocation

Fintech applications should handle 403 Forbidden responses:

```javascript
async function fetchAccounts(accessToken) {
  const response = await fetch('/api/accounts', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (response.status === 403) {
    const error = await response.json();
    
    if (error.error === 'forbidden' && error.status === 'revoked') {
      // Consent was revoked
      console.log('Customer revoked consent');
      
      // Clear local tokens
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      
      // Redirect to re-authorization
      window.location.href = '/reauthorize';
      
      return null;
    }
  }
  
  return await response.json();
}
```

### Graceful Degradation

```javascript
try {
  const accounts = await fetchAccounts(accessToken);
  displayAccounts(accounts);
} catch (error) {
  if (error.status === 403 && error.reason === 'revoked') {
    showMessage('Your consent has been revoked. Please re-authorize to continue.');
    showReauthorizeButton();
  } else {
    showError('Failed to load accounts');
  }
}
```

## Best Practices

### For Banking Providers

1. **Real-time validation**: Check consent status on every API request
2. **Clear error messages**: Provide specific revocation details in 403 responses
3. **Audit logging**: Log all revocation events for compliance
4. **Batch cleanup**: Periodically clean up revoked tokens
5. **Customer notifications**: Notify customers when consent is revoked

### For Fintech Applications

1. **Handle 403 gracefully**: Don't retry revoked requests
2. **Clear local state**: Remove tokens when consent is revoked
3. **Prompt re-authorization**: Guide users to re-authorize if needed
4. **Monitor revocation rates**: High rates may indicate UX issues
5. **Respect revocation**: Don't attempt to circumvent revoked consent

### For Customers

1. **Review regularly**: Check active consents periodically
2. **Revoke unused**: Remove access for applications no longer used
3. **Understand impact**: Revocation is immediate and permanent
4. **Re-authorize carefully**: Only re-authorize if you trust the application
5. **Report issues**: Contact support if you see unexpected behavior

## Compliance

### GDPR Right to Erasure

Consent revocation supports GDPR's "right to erasure":
- Customer can revoke consent at any time
- Revocation is immediate and effective
- Full audit trail maintained
- Application loses access immediately

### PSD2 Requirements

Meets PSD2 requirements for consent management:
- Explicit consent required
- Customer control over consent
- Immediate revocation capability
- Audit trail for regulatory review

