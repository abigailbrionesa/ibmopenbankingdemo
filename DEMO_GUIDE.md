# Open Banking MVP - Demo Guide

Complete guide for running automated end-to-end demo scenarios that validate all MVP acceptance criteria.

## Overview

This guide provides step-by-step instructions for demonstrating the Open Banking MVP through automated scenarios that cover:

- ✅ Happy path with successful API access (200 OK)
- ✅ Authorization failures (403 Forbidden)
- ✅ Authentication failures (401 Unauthorized)
- ✅ Rate limiting (429 Too Many Requests)
- ✅ Credential protection verification

## Quick Start

### Prerequisites

1. **Docker Desktop** (version 20.10+)
2. **Node.js** (version 18+)
3. **Git**

### Setup

1. **Clone and navigate to the project:**
   ```bash
   git clone <repository-url>
   cd ibmopenbankingdemo
   ```

2. **Install dependencies:**
   ```bash
   npm install
   cd tests/demo-scenarios
   npm install
   cd ../..
   ```

3. **Start the environment:**
   ```bash
   docker-compose up -d
   ```

4. **Initialize the database:**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. **Verify services are running:**
   ```bash
   docker-compose ps
   ```

   All services should show status "Up":
   - openbanking-postgres
   - openbanking-redis
   - openbanking-vault
   - openbanking-banking-api
   - openbanking-consent
   - openbanking-fintech-demo
   - openbanking-gateway

## Running Demo Scenarios

### Run All Scenarios

Execute all demo scenarios in sequence:

```bash
npm run demo:all
```

This will run all 7 scenarios (A-G) and generate a comprehensive report.

### Run Individual Scenarios

Run specific scenarios using these commands:

```bash
# Scenario A: Happy Path (200 OK)
npm run demo:happy-path

# Scenario B: No Consent (403 Forbidden)
npm run demo:no-consent

# Scenario C: Revoked Consent (403 Forbidden)
npm run demo:revoked-consent

# Scenario D: Wrong Scope (403 Forbidden)
npm run demo:wrong-scope

# Scenario E: Expired Token (401 Unauthorized)
npm run demo:expired-token

# Scenario F: Rate Limit (429 Too Many Requests)
npm run demo:rate-limit

# Scenario G: Credential Protection
npm run demo:credential-protection
```

### List Available Scenarios

```bash
npm run demo:list
```

## Scenario Details

### Scenario A: Happy Path (200 OK)

**Purpose:** Demonstrates the complete OAuth authorization flow with successful API access.

**Steps:**
1. Client registration
2. Customer authentication
3. Authorization request
4. Consent approval
5. Authorization code issuance
6. Token exchange
7. API call with valid token
8. Data return (200 OK)
9. Audit logging verification

**Expected Result:** All steps succeed, API returns 200 OK with account data.

**Command:**
```bash
npm run demo:happy-path
```

---

### Scenario B: No Consent (403 Forbidden)

**Purpose:** Demonstrates that a valid token without consent cannot access APIs.

**Steps:**
1. Valid token generated
2. No consent record exists
3. API call attempted
4. Access denied (403 Forbidden)

**Expected Result:** API returns 403 Forbidden with error "no valid consent found".

**Key Validation:** Valid token alone is NOT sufficient for API access.

**Command:**
```bash
npm run demo:no-consent
```

---

### Scenario C: Revoked Consent (403 Forbidden)

**Purpose:** Demonstrates immediate effect of consent revocation.

**Steps:**
1. Initial API call succeeds (200 OK)
2. Customer revokes consent
3. Subsequent API call fails (403 Forbidden)

**Expected Result:** 
- First call: 200 OK
- After revocation: 403 Forbidden

**Key Validation:** Consent revocation takes effect immediately with no grace period.

**Command:**
```bash
npm run demo:revoked-consent
```

---

### Scenario D: Wrong Scope (403 Forbidden)

**Purpose:** Demonstrates scope enforcement per endpoint.

**Steps:**
1. Token with `accounts:read` scope
2. Access accounts endpoint (succeeds - 200 OK)
3. Access transactions endpoint (fails - 403 Forbidden)

**Expected Result:**
- Accounts API: 200 OK (correct scope)
- Transactions API: 403 Forbidden (insufficient scope)

**Key Validation:** Scope is checked per endpoint; valid token + valid consent + wrong scope = 403.

**Command:**
```bash
npm run demo:wrong-scope
```

---

### Scenario E: Expired Token (401 Unauthorized)

**Purpose:** Demonstrates token expiration handling.

**Steps:**
1. Token generated with short TTL (5 seconds)
2. API call before expiration (succeeds - 200 OK)
3. Wait for expiration
4. API call after expiration (fails - 401 Unauthorized)

**Expected Result:**
- Before expiration: 200 OK
- After expiration: 401 Unauthorized

**Key Validation:** Token expiration is strictly enforced; returns 401 (not 403).

**Command:**
```bash
npm run demo:expired-token
```

---

### Scenario F: Rate Limit (429 Too Many Requests)

**Purpose:** Demonstrates per-client rate limiting.

**Steps:**
1. Make 10 successful API calls (within limit)
2. Make 11th call (exceeds limit)
3. Receive 429 Too Many Requests

**Expected Result:**
- First 10 calls: 200 OK
- 11th call: 429 Too Many Requests
- Response includes rate limit headers

**Key Validation:** Rate limiting protects backend resources and ensures fair usage.

**Command:**
```bash
npm run demo:rate-limit
```

---

### Scenario G: Credential Protection

**Purpose:** Verifies that secrets are protected and not exposed.

**Checks:**
1. ✅ No secrets in source code
2. ✅ .env.example uses placeholders
3. ✅ .env files in .gitignore
4. ✅ Vault integration implemented
5. ✅ No secrets in Git history
6. ✅ API responses sanitized
7. ✅ Frontend code clean

**Expected Result:** All checks pass, proving secrets are properly protected.

**Command:**
```bash
npm run demo:credential-protection
```

## Understanding the Output

### Successful Scenario Output

```
════════════════════════════════════════════════════════════════════════════════
  SCENARIO A: HAPPY PATH
  Complete OAuth flow with successful API access returning 200 OK
════════════════════════════════════════════════════════════════════════════════

━━━ Step 1: Register OAuth Client ━━━
✓ Client registered successfully

━━━ Step 2: Customer Authentication ━━━
✓ Customer authenticated successfully

[... more steps ...]

────────────────────────────────────────────────────────────────────────────────
  ✓ SCENARIO PASSED: Happy path completed successfully with 200 OK responses
────────────────────────────────────────────────────────────────────────────────
```

### Failed Scenario Output

```
────────────────────────────────────────────────────────────────────────────────
  ✗ SCENARIO FAILED: Expected 403 but got 200
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
────────────────────────────────────────────────────────────────────────────────

  ✓ ALL SCENARIOS PASSED (100.0%)
  MVP acceptance criteria validated successfully!

════════════════════════════════════════════════════════════════════════════════
```
