# End-to-End Demo Scenarios

Automated demo scenarios for the Open Banking MVP, covering all acceptance criteria from the MVP definition of done.

## Overview

This directory contains automated scripts and documentation for demonstrating the complete Open Banking flow, including both happy path and negative scenarios.

## Scenarios

### Scenario A:  (200 OK)
**File**: [`scenario-a-happy-path.js`](./scenario-a-happy-path.js)

Demonstrates the complete OAuth authorization flow with successful API access:
1. Client registration
2. Customer authentication
3. Consent approval
4. Authorization code exchange
5. Token acquisition
6. API call with valid token
7. Data return (200 OK)
8. Audit logging verification

**Run**: `npm run demo:happy-path`

### Scenario B: No Consent (403 Forbidden)
**File**: [`scenario-b-no-consent.js`](./scenario-b-no-consent.js)

Demonstrates API access attempt without consent:
- Valid token but no consent record
- Returns 403 Forbidden
- Audit log records denial

**Run**: `npm run demo:no-consent`

### Scenario C: Revoked Consent (403 Forbidden)
**File**: [`scenario-c-revoked-consent.js`](./scenario-c-revoked-consent.js)

Demonstrates consent revocation impact:
1. Initial successful API call (200 OK)
2. Customer revokes consent
3. Subsequent API call fails (403 Forbidden)
4. Audit log records revocation and denial

**Run**: `npm run demo:revoked-consent`

### Scenario D: Wrong Scope (403 Forbidden)
**File**: [`scenario-d-wrong-scope.js`](./scenario-d-wrong-scope.js)

Demonstrates scope enforcement:
- Valid token with `accounts:read` scope
- Attempt to access transactions endpoint (requires `transactions:read`)
- Returns 403 Forbidden
- Audit log records insufficient scope

**Run**: `npm run demo:wrong-scope`

### Scenario E: Expired Token (401 Unauthorized)
**File**: [`scenario-e-expired-token.js`](./scenario-e-expired-token.js)

Demonstrates token expiration handling:
- Generate token with short TTL
- Wait for expiration
- Attempt API call with expired token
- Returns 401 Unauthorized
- Audit log records expired token

**Run**: `npm run demo:expired-token`

### Scenario F: Rate Limit (429 Too Many Requests)
**File**: [`scenario-f-rate-limit.js`](./scenario-f-rate-limit.js)

Demonstrates rate limiting:
- Make multiple rapid API calls
- Exceed rate limit threshold
- Returns 429 Too Many Requests
- Response includes rate limit headers
- Audit log records rate limit violation

**Run**: `npm run demo:rate-limit`

### Scenario G: Credential Protection
**File**: [`scenario-g-credential-protection.js`](./scenario-g-credential-protection.js)

Demonstrates credential protection:
1. Verify no secrets in source code
2. Verify no secrets in `.env` files
3. Verify secrets loaded from Vault
4. Verify no secrets in Git history
5. Verify no secrets in API responses
6. Verify no secrets in frontend code

**Run**: `npm run demo:credential-protection`

## Running All Scenarios

Run all demo scenarios in sequence:

```bash
npm run demo:all
```

## Master Demo Runner

The master demo runner ([`run-all-demos.js`](./run-all-demos.js)) executes all scenarios and generates a comprehensive report.

## Prerequisites

Before running demos:

1. Start the development environment:
   ```bash
   docker-compose up -d
   ```

2. Initialize the database:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

3. Verify all services are running:
   ```bash
   docker-compose ps
   ```

## Output

Each scenario produces:
- Console output with step-by-step progress
- HTTP request/response details
- Success/failure indicators
- Audit log verification
- Summary report

## Test Data

Demo scenarios use deterministic test data from:
- [`test-data.js`](./test-data.js) - Customer, client, and consent data
- [`demo-helpers.js`](./demo-helpers.js) - Utility functions for API calls

## Continuous Integration

These demos can be run in CI/CD pipelines:

```bash
# Run demos with JSON output for CI
npm run demo:all -- --format=json > demo-results.json
```

## Troubleshooting

### Services Not Running
```bash
docker-compose up -d
docker-compose ps
```

### Database Not Initialized
```bash
npm run db:reset
npm run db:migrate
npm run db:seed
```

### Port Conflicts
Check `.env` file and ensure ports are available:
- 3000: Fintech Demo
- 3001: Consent UI
- 3002: Banking API
- 8080: API Gateway
- 8200: Vault
- 5432: PostgreSQL
- 6379: Redis

## Documentation

For detailed flow documentation, see:
- [OAuth Authorization Flow](../../docs/oauth-authorization-flow.md)
- [Consent Model](../../docs/consent-model.md)
- [Rate Limiting](../../docs/rate-limiting.md)
- [Secret Management](../../docs/secret-management.md)
- [Audit Logging](../../docs/audit-logging.md)