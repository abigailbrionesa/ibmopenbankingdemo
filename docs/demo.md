# Open Banking MVP - Demo Guide

## Overview

This guide provides comprehensive instructions for demonstrating the Open Banking MVP through automated scenarios that validate all acceptance criteria. The demo scenarios cover the complete OAuth authorization flow, consent management, API access control, and security features.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Demo Scenarios](#demo-scenarios)
- [Running Demos](#running-demos)
- [Understanding Results](#understanding-results)
- [Manual Demo Walkthrough](#manual-demo-walkthrough)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

1. **Docker Desktop** (version 20.10+)
   - Download: https://www.docker.com/products/docker-desktop
   - Verify: `docker --version`

2. **Node.js** (version 18+)
   - Download: https://nodejs.org/
   - Verify: `node --version`

3. **Git**
   - Download: https://git-scm.com/
   - Verify: `git --version`

### System Requirements

- **RAM**: 4GB minimum, 8GB recommended
- **Disk Space**: 2GB free space
- **Network**: Internet connection for initial setup

## Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd ibmopenbankingdemo

# Install dependencies
npm install
cd tests/demo-scenarios
npm install
cd ../..
```

### 2. Start Environment

```bash
# Start all services with Docker Compose
docker-compose up -d

# Verify all services are running
docker-compose ps
```

Expected output:
```
NAME                        STATUS
openbanking-postgres        Up
openbanking-redis           Up
openbanking-vault           Up
openbanking-banking-api     Up
openbanking-consent         Up
openbanking-fintech-demo    Up
openbanking-gateway         Up
```

### 3. Initialize Database

```bash
# Run database migrations
npm run db:migrate

# Seed with demo data
npm run db:seed
```

### 4. Run All Demo Scenarios

```bash
# Execute all scenarios
npm run demo:all
```

This will run all 7 demo scenarios (A-G) and generate a comprehensive report.

## Demo Scenarios

### Scenario A: Happy Path (200 OK)

**Purpose**: Demonstrates the complete OAuth authorization flow with successful API access.

**What It Tests**:
- ✅ OAuth client registration
- ✅ Customer authentication
- ✅ Authorization request handling
- ✅ Consent approval process
- ✅ Authorization code issuance
- ✅ Token exchange
- ✅ API access with valid token
- ✅ Successful data retrieval (200 OK)
- ✅ Audit logging of allowed requests

**Flow**:
```
1. Register OAuth client
2. Customer authenticates (maria.garcia@example.com)
3. Customer approves consent for accounts:read and transactions:read
4. Authorization code issued
5. Fintech exchanges code for access token
6. Fintech calls GET /api/v1/accounts with token
7. Gateway validates: token ✓, consent ✓, scope ✓
8. API returns account data (200 OK)
9. Audit log records successful access
```

**Expected Result**: All steps succeed, API returns 200 OK with account data.

**Run Command**:
```bash
npm run demo:happy-path
```

---

### Scenario B: No Consent (403 Forbidden)

**Purpose**: Demonstrates that a valid token without consent cannot access APIs.

**What It Tests**:
- ✅ Token validation passes
- ✅ Consent validation fails (no consent exists)
- ✅ API access denied with 403 Forbidden
- ✅ Audit logging of denied requests

**Flow**:
```
1. Generate valid OAuth token
2. Skip consent approval step
3. Attempt API call with token
4. Gateway validates: token ✓, consent ✗
5. Access denied (403 Forbidden)
6. Audit log records denial with reason "missing_consent"
```

**Key Validation**: Valid token alone is NOT sufficient for API access. Consent is required.

**Expected Result**: API returns 403 Forbidden with error "no valid consent found".

**Run Command**:
```bash
npm run demo:no-consent
```

---

### Scenario C: Revoked Consent (403 Forbidden)

**Purpose**: Demonstrates immediate effect of consent revocation.

**What It Tests**:
- ✅ Initial API access succeeds with consent
- ✅ Consent revocation process
- ✅ Immediate enforcement of revocation
- ✅ Subsequent API access denied
- ✅ Audit logging of revocation and denial

**Flow**:
```
1. Complete happy path (consent approved, token issued)
2. Make successful API call (200 OK)
3. Customer revokes consent via POST /api/consent/revoke
4. Make another API call with same token
5. Gateway validates: token ✓, consent ✗ (revoked)
6. Access denied (403 Forbidden)
7. Audit log records revocation and denial
```

**Key Validation**: Consent revocation takes effect immediately with no grace period.

**Expected Result**:
- First call: 200 OK
- After revocation: 403 Forbidden

**Run Command**:
```bash
npm run demo:revoked-consent
```

---

### Scenario D: Wrong Scope (403 Forbidden)

**Purpose**: Demonstrates scope enforcement per endpoint.

**What It Tests**:
- ✅ Token with limited scope (accounts:read only)
- ✅ Access to matching endpoint succeeds
- ✅ Access to non-matching endpoint fails
- ✅ Scope validation at gateway
- ✅ Audit logging with scope details

**Flow**:
```
1. Customer approves consent for accounts:read only
2. Token issued with accounts:read scope
3. Call GET /api/v1/accounts (requires accounts:read)
   → Success (200 OK)
4. Call GET /api/v1/accounts/:id/transactions (requires transactions:read)
   → Gateway validates: token ✓, consent ✓, scope ✗
   → Denied (403 Forbidden)
5. Audit log records denial with reason "insufficient_scope"
```

**Key Validation**: Scope is checked per endpoint. Valid token + valid consent + wrong scope = 403.

**Expected Result**:
- Accounts API: 200 OK (correct scope)
- Transactions API: 403 Forbidden (insufficient scope)

**Run Command**:
```bash
npm run demo:wrong-scope
```

---

### Scenario E: Expired Token (401 Unauthorized)

**Purpose**: Demonstrates token expiration handling.

**What It Tests**:
- ✅ Token with short TTL (5 seconds)
- ✅ API access before expiration succeeds
- ✅ Token expiration enforcement
- ✅ API access after expiration fails
- ✅ Correct HTTP status (401, not 403)

**Flow**:
```
1. Generate token with 5-second expiration
2. Make API call immediately (within 5 seconds)
   → Success (200 OK)
3. Wait 6 seconds for token to expire
4. Make another API call with expired token
   → Gateway validates: token ✗ (expired)
   → Denied (401 Unauthorized)
5. Audit log records denial with reason "expired_token"
```

**Key Validation**: Token expiration is strictly enforced. Returns 401 (authentication issue), not 403 (authorization issue).

**Expected Result**:
- Before expiration: 200 OK
- After expiration: 401 Unauthorized

**Run Command**:
```bash
npm run demo:expired-token
```

---

### Scenario F: Rate Limit (429 Too Many Requests)

**Purpose**: Demonstrates per-client rate limiting.

**What It Tests**:
- ✅ Rate limit configuration (10 requests per 10 seconds in test mode)
- ✅ Successful requests within limit
- ✅ Rate limit enforcement
- ✅ 429 response with rate limit headers
- ✅ Audit logging of rate limit violations

**Flow**:
```
1. Make 10 successful API calls (within limit)
   → All return 200 OK
2. Make 11th API call (exceeds limit)
   → Gateway validates: rate limit ✗
   → Denied (429 Too Many Requests)
3. Response includes rate limit headers:
   - X-RateLimit-Limit: 10
   - X-RateLimit-Remaining: 0
   - X-RateLimit-Reset: <timestamp>
4. Audit log records denial with reason "rate_limit_exceeded"
```

**Key Validation**: Rate limiting protects backend resources and ensures fair usage across clients.

**Expected Result**:
- First 10 calls: 200 OK
- 11th call: 429 Too Many Requests
- Response includes rate limit headers

**Run Command**:
```bash
npm run demo:rate-limit
```

---

### Scenario G: Credential Protection

**Purpose**: Verifies that secrets are protected and not exposed.

**What It Tests**:
- ✅ No secrets in source code
- ✅ .env.example uses placeholders
- ✅ .env files in .gitignore
- ✅ Vault integration implemented
- ✅ No secrets in Git history
- ✅ API responses sanitized
- ✅ Frontend code clean

**Checks Performed**:

1. **Source Code Scan**
   - Searches for hardcoded passwords, API keys, tokens
   - Verifies no database credentials in code
   - Checks for JWT secrets in files

2. **Configuration Files**
   - Validates .env.example has placeholders
   - Confirms .env in .gitignore
   - Checks no real secrets in example files

3. **Vault Integration**
   - Verifies vault client exists
   - Confirms secrets loader implemented
   - Validates runtime secret loading

4. **Git History**
   - Scans commit history for secrets
   - Checks for accidentally committed credentials

5. **API Response Sanitization**
   - Verifies no secrets in error messages
   - Confirms no credentials in API responses

6. **Frontend Security**
   - Checks no secrets in client-side code
   - Validates no API keys in JavaScript

**Expected Result**: All checks pass, proving secrets are properly protected.

**Run Command**:
```bash
npm run demo:credential-protection
```

---

## Running Demos

### Run All Scenarios

Execute all demo scenarios in sequence:

```bash
npm run demo:all
```

This generates a comprehensive report showing results for all scenarios.

### Run Individual Scenarios

Run specific scenarios:

```bash
# Scenario A: Happy Path
npm run demo:happy-path

# Scenario B: No Consent
npm run demo:no-consent

# Scenario C: Revoked Consent
npm run demo:revoked-consent

# Scenario D: Wrong Scope
npm run demo:wrong-scope

# Scenario E: Expired Token
npm run demo:expired-token

# Scenario F: Rate Limit
npm run demo:rate-limit

# Scenario G: Credential Protection
npm run demo:credential-protection
```

### List Available Scenarios

```bash
npm run demo:list
```

## Understanding Results

### Successful Scenario Output

```
════════════════════════════════════════════════════════════════════════════════
  SCENARIO A: HAPPY PATH
  Complete OAuth flow with successful API access returning 200 OK
════════════════════════════════════════════════════════════════════════════════

━━━ Step 1: Register OAuth Client ━━━
✓ Client registered successfully
  Client ID: fintech-demo-client

━━━ Step 2: Customer Authentication ━━━
✓ Customer authenticated successfully
  Customer: Maria Garcia (CUST-001)
  Session expires: 2026-08-13T17:15:00.000Z

━━━ Step 3: Authorization Request ━━━
✓ Authorization request created
  Auth Request ID: authreq_abc123
  Requested scopes: accounts:read, transactions:read

━━━ Step 4: Consent Approval ━━━
✓ Consent approved by customer
  Consent ID: consent-xyz789
  Granted scopes: accounts:read, transactions:read

━━━ Step 5: Authorization Code Issuance ━━━
✓ Authorization code issued
  Code: authcode_def456

━━━ Step 6: Token Exchange ━━━
✓ Access token obtained
  Token type: Bearer
  Expires in: 3600 seconds
  Scopes: accounts:read, transactions:read

━━━ Step 7: API Call - Get Accounts ━━━
✓ API call successful
  Status: 200 OK
  Accounts returned: 2

━━━ Step 8: Audit Log Verification ━━━
✓ Audit log entry found
  Authorization: allowed
  Endpoint: /api/v1/accounts
  Method: GET

────────────────────────────────────────────────────────────────────────────────
  ✓ SCENARIO PASSED: Happy path completed successfully with 200 OK responses
  Duration: 1234ms
────────────────────────────────────────────────────────────────────────────────
```

### Failed Scenario Output

```
────────────────────────────────────────────────────────────────────────────────
  ✗ SCENARIO FAILED: Expected 403 but got 200
  
  Error Details:
  - Expected HTTP status: 403 Forbidden
  - Actual HTTP status: 200 OK
  - Reason: Consent validation not enforced
  
  Duration: 567ms
────────────────────────────────────────────────────────────────────────────────
```

### Final Report (All Scenarios)

```
════════════════════════════════════════════════════════════════════════════════
  FINAL REPORT
════════════════════════════════════════════════════════════════════════════════

Scenario Results:
  A. Happy Path (200 OK): ✓ PASSED (1234ms)
  B. No Consent (403 Forbidden): ✓ PASSED (567ms)
  C. Revoked Consent (403 Forbidden): ✓ PASSED (890ms)
  D. Wrong Scope (403 Forbidden): ✓ PASSED (456ms)
  E. Expired Token (401 Unauthorized): ✓ PASSED (6789ms)
  F. Rate Limit (429 Too Many Requests): ✓ PASSED (2345ms)
  G. Credential Protection: ✓ PASSED (1234ms)

────────────────────────────────────────────────────────────────────────────────
Total Scenarios: 7
Passed: 7
Failed: 0
────────────────────────────────────────────────────────────────────────────────

  ✓ ALL SCENARIOS PASSED (100.0%)
  MVP acceptance criteria validated successfully!

════════════════════════════════════════════════════════════════════════════════
```

## Manual Demo Walkthrough

For live demonstrations or deeper understanding, follow this manual walkthrough:

### Step 1: Start Services

```bash
# Start all services
docker-compose up -d

# Check service health
curl http://localhost:8080/health
curl http://localhost:3002/health
```

### Step 2: Customer Login

```bash
# Authenticate as Maria Garcia
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "maria.garcia@example.com",
    "password": "demo123"
  }'
```

Save the `session_token` from the response.

### Step 3: Initiate OAuth Flow

```bash
# Open in browser
http://localhost:8080/oauth/authorize?client_id=fintech-demo-client&redirect_uri=http://localhost:3000/callback&response_type=code&scope=accounts:read%20transactions:read&state=demo123
```

This redirects to the consent page.

### Step 4: Approve Consent

Use the consent UI at `http://localhost:3001` or make API call:

```bash
curl -X POST http://localhost:8080/api/consent/decision \
  -H "Content-Type: application/json" \
  -H "X-Customer-Session: <session_token>" \
  -d '{
    "auth_request_id": "<auth_request_id>",
    "action": "approve",
    "granted_scopes": ["accounts:read", "transactions:read"]
  }'
```

Save the `code` from the response.

### Step 5: Exchange Code for Token

```bash
curl -X POST http://localhost:8080/oauth/token \
  -H "Authorization: Basic $(echo -n 'fintech-demo-client:demo-secret-key-not-for-production' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=<authorization_code>&redirect_uri=http://localhost:3000/callback"
```

Save the `access_token` from the response.

### Step 6: Call Banking API

```bash
# Get accounts
curl http://localhost:8080/api/v1/accounts \
  -H "Authorization: Bearer <access_token>"

# Get transactions
curl http://localhost:8080/api/v1/accounts/acc-001/transactions \
  -H "Authorization: Bearer <access_token>"
```

### Step 7: Revoke Consent

```bash
curl -X POST http://localhost:8080/api/consent/revoke \
  -H "Content-Type: application/json" \
  -H "X-Customer-Session: <session_token>" \
  -d '{
    "consent_id": "<consent_id>",
    "reason": "Demo revocation"
  }'
```

### Step 8: Verify Revocation

```bash
# Try API call again - should fail with 403
curl http://localhost:8080/api/v1/accounts \
  -H "Authorization: Bearer <access_token>"
```

Expected: 403 Forbidden with "revoked_consent" error.

## Troubleshooting

### Services Not Starting

**Problem**: Docker containers fail to start

**Solution**:
```bash
# Check Docker is running
docker ps

# View container logs
docker-compose logs

# Restart services
docker-compose down
docker-compose up -d
```

### Database Not Initialized

**Problem**: API calls fail with database errors

**Solution**:
```bash
# Reset and reinitialize database
npm run db:reset
npm run db:migrate
npm run db:seed
```

### Port Conflicts

**Problem**: Services can't bind to ports

**Solution**:
```bash
# Check what's using the ports
# On Windows:
netstat -ano | findstr :3000
netstat -ano | findstr :8080

# On Mac/Linux:
lsof -i :3000
lsof -i :8080

# Either stop conflicting services or change ports in .env
```

### Demo Scenarios Failing

**Problem**: Scenarios fail unexpectedly

**Solution**:
```bash
# Verify services are healthy
docker-compose ps

# Check service logs
docker-compose logs banking-api
docker-compose logs gateway

# Verify database has data
docker-compose exec postgres psql -U openbanking -d openbanking_dev -c "SELECT COUNT(*) FROM customers;"

# Re-seed database
npm run db:seed

# Run scenarios with verbose output
npm run demo:happy-path -- --verbose
```

### Rate Limit Issues

**Problem**: Getting 429 errors during demos

**Solution**:
```bash
# Wait for rate limit window to reset (10 seconds in test mode)
sleep 15

# Or restart Redis to clear rate limits
docker-compose restart redis
```

### Token Expiration

**Problem**: Tokens expiring during manual walkthrough

**Solution**:
- Work faster through the steps
- Or modify token expiration in code (for demo purposes)
- Or generate a new token

## Demo Data

### Demo Customers

| Name | Email | Password | Customer ID | Accounts |
|------|-------|----------|-------------|----------|
| Maria Garcia | maria.garcia@example.com | demo123 | CUST-001 | 2 accounts |
| Carlos Rodriguez | carlos.rodriguez@example.com | demo123 | CUST-002 | 2 accounts |
| Ana Martinez | ana.martinez@example.com | demo123 | CUST-003 | 1 account |

### Demo OAuth Client

| Field | Value |
|-------|-------|
| Client ID | fintech-demo-client |
| Client Secret | demo-secret-key-not-for-production |
| Name | Budget Tracker Pro |
| Redirect URI | http://localhost:3000/callback |
| Allowed Scopes | accounts:read, transactions:read, balances:read, profile:read |

## Important Notes

### Demo Authentication Warning

⚠️ **CRITICAL**: The customer authentication in this demo is NOT production-ready and does NOT implement Strong Customer Authentication (SCA) required by PSD2 regulations.

**Current Implementation**:
- Simple email/password authentication
- No multi-factor authentication (MFA)
- No biometric authentication
- No device fingerprinting
- No risk-based authentication

**For Production**: Implement proper SCA compliant authentication before deploying to production.

### Security Reminders

1. **Never use demo credentials** in production
2. **Change all secrets** before production deployment
3. **Enable HTTPS** for all production endpoints
4. **Implement proper SCA** for customer authentication
5. **Monitor audit logs** for suspicious activity
6. **Rotate secrets regularly** in production
