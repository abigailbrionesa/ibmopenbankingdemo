# Open Banking MVP - System Architecture

## Overview

This document describes the architecture of the Open Banking MVP, a demonstration implementation showcasing secure data sharing between financial institutions and third-party applications through standardized APIs, OAuth 2.0 authentication, and customer consent management.

## Actors

The system involves five primary actors:

### 1. Bank Customer
- **Role**: Owner of banking data
- **Responsibilities**: 
  - Authenticates with the bank
  - Reviews and grants/revokes consent for data sharing
  - Controls what data third-party applications can access
- **Authentication**: Customer credentials (email/password in demo)
- **Session**: 30-minute customer session tokens

### 2. Fintech Application (Third-Party Provider)
- **Role**: Requests access to customer banking data
- **Responsibilities**:
  - Registers as OAuth client with the bank
  - Initiates OAuth authorization flow
  - Requests specific data scopes
  - Uses access tokens to call banking APIs
- **Authentication**: OAuth 2.0 client credentials
- **Authorization**: OAuth 2.0 access tokens with scopes

### 3. Bank (Account Servicing Payment Service Provider - ASPSP)
- **Role**: Provides APIs to access customer account information
- **Responsibilities**:
  - Hosts banking APIs
  - Manages customer authentication
  - Issues OAuth tokens
  - Enforces consent and scope policies
- **Components**: Banking API, OAuth server, consent service

### 4. API Gateway
- **Role**: Central enforcement point for all security policies
- **Responsibilities**:
  - Validates OAuth access tokens
  - Enforces consent requirements
  - Validates scope permissions
  - Applies rate limiting
  - Logs all authorization events
- **Position**: Between fintech applications and banking APIs

### 5. Consent Service
- **Role**: Manages customer authorization decisions
- **Responsibilities**:
  - Records consent approvals and denials
  - Tracks consent lifecycle (pending, approved, revoked, expired)
  - Links consents to authorization codes and tokens
  - Provides consent revocation capabilities

## Target Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FINTECH APPLICATION                         │
│                    (Third-Party Service Provider)                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ 1. OAuth Authorization Request
                             │    (client_id, redirect_uri, scope)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CUSTOMER AUTHENTICATION                        │
│                         (Bank Login Page)                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ 2. Customer Authenticates
                             │    (email + password - DEMO ONLY)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CONSENT SERVICE                             │
│                    (Customer Approval Interface)                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ 3. Customer Grants Consent
                             │    (approves specific scopes)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      OAUTH AUTHORIZATION SERVER                     │
│                   (Issues authorization codes & tokens)             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ 4. Authorization Code → Access Token
                             │    (client authenticates with secret)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY                               │
│                    *** ENFORCEMENT POINT ***                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  1. Token Introspection    - Validate token signature        │  │
│  │                            - Check expiration                 │  │
│  │                            - Verify not revoked               │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  2. Rate Limiting          - Per-client request limits        │  │
│  │                            - Sliding window algorithm         │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  3. Consent Validation     - Check consent exists             │  │
│  │                            - Verify consent approved          │  │
│  │                            - Ensure not revoked/expired       │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  4. Scope Enforcement      - Map endpoint to required scope   │  │
│  │                            - Validate token has scope         │  │
│  │                            - Validate consent has scope       │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  5. Audit Logging          - Log all allowed requests         │  │
│  │                            - Log all denied requests          │  │
│  │                            - Record denial reasons            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ 5. Authorized Request
                             │    (if all checks pass)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          BANKING APIs                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐       │
│  │   Accounts     │  │  Transactions  │  │    Balances    │       │
│  │      API       │  │      API       │  │      API       │       │
│  └────────────────┘  └────────────────┘  └────────────────┘       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ 6. Query Customer Data
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          DATABASE LAYER                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐       │
│  │   Customers    │  │    Accounts    │  │  Transactions  │       │
│  │   Consents     │  │  OAuth Clients │  │  Audit Logs    │       │
│  └────────────────┘  └────────────────┘  └────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                            │
├─────────────────────────────────────────────────────────────────────┤
│  apps/fintech-demo/        │  Demo fintech application             │
│  apps/customer-consent/    │  Consent management UI                │
│  apps/banking-api/         │  Core banking API services            │
│  apps/developer-portal/    │  API documentation & testing          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         GATEWAY LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│  gateway/policies/         │  Security policy enforcement          │
│    - token-introspection   │  - Token validation                   │
│    - rate-limiter          │  - Request throttling                 │
│    - consent-validation    │  - Consent checking                   │
│    - scope-enforcement     │  - Permission validation              │
│    - audit-logger          │  - Event logging                      │
│    - complete-authorization│  - Unified auth chain                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION & AUTHORIZATION                   │
├─────────────────────────────────────────────────────────────────────┤
│  auth/oauth/               │  OAuth 2.0 implementation             │
│    - authorization-request │  - Authorization endpoint             │
│    - token-exchange        │  - Token endpoint                     │
│    - client-registration   │  - Client management                  │
│  auth/consent/             │  Consent management                   │
│    - consent-manager       │  - Consent lifecycle                  │
│    - consent-handler       │  - Consent API endpoints              │
│  auth/middleware/          │  Authentication middleware            │
│    - customer-auth         │  - Customer session validation        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        SECRETS MANAGEMENT                           │
├─────────────────────────────────────────────────────────────────────┤
│  vault/configuration/      │  Vault integration                    │
│    - vault-client          │  - Backend abstraction                │
│    - secrets-loader        │  - Runtime secret loading             │
│  Supported Backends:       │                                       │
│    - Environment variables │  - Development                        │
│    - HashiCorp Vault       │  - Production (recommended)           │
│    - AWS Secrets Manager   │  - AWS deployments                    │
│    - Azure Key Vault       │  - Azure deployments                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                 │
├─────────────────────────────────────────────────────────────────────┤
│  data/schema/              │  Database schema definitions          │
│  data/seed/                │  Sample data for development          │
│  Database: PostgreSQL      │  Relational data storage              │
│  Cache: Redis              │  Rate limiting & sessions             │
└─────────────────────────────────────────────────────────────────────┘
```

## Golden Path (Happy Path Flow)

The golden path represents the successful end-to-end flow from authorization request to API access:

### Step 1: Authorization Request
```
Fintech App → Authorization Endpoint
GET /oauth/authorize?
  client_id=fintech-demo-client&
  redirect_uri=http://localhost:3000/callback&
  response_type=code&
  scope=accounts:read transactions:read&
  state=random_state_123
```

### Step 2: Customer Authentication
```
Customer → Login Page
POST /auth/login
{
  "email": "maria.garcia@example.com",
  "password": "demo123"
}

Response: Customer session token (30-minute validity)
```

### Step 3: Consent Approval
```
Customer → Consent Page
- Reviews fintech application details
- Reviews requested scopes (accounts:read, transactions:read)
- Approves consent

POST /api/consent/decision
{
  "auth_request_id": "authreq_abc123",
  "action": "approve",
  "granted_scopes": ["accounts:read", "transactions:read"]
}

Response: Authorization code issued
```

### Step 4: Token Exchange
```
Fintech App → Token Endpoint
POST /oauth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=authcode_xyz789&
redirect_uri=http://localhost:3000/callback

Response:
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "accounts:read transactions:read"
}
```

### Step 5: API Access
```
Fintech App → API Gateway → Banking API
GET /api/v1/accounts
Authorization: Bearer eyJhbGc...

Gateway Enforcement:
✓ Token valid and not expired
✓ Rate limit not exceeded
✓ Consent exists and approved
✓ Token scope matches endpoint requirement
✓ Audit log recorded

Response: 200 OK with account data
```

## Security Model

### Defense in Depth

The architecture implements multiple layers of security:

1. **Authentication Layer**
   - Customer authentication (session-based)
   - OAuth client authentication (client credentials)
   - Token-based API authentication (Bearer tokens)

2. **Authorization Layer**
   - Consent-based authorization (customer approval required)
   - Scope-based authorization (granular permissions)
   - Token introspection (validation at gateway)

3. **Enforcement Layer**
   - API Gateway as single enforcement point
   - Rate limiting (per-client throttling)
   - Audit logging (complete event trail)

4. **Data Protection Layer**
   - Secrets management (Vault integration)
   - Encrypted credentials (no hardcoded secrets)
   - Secure token storage (database-backed)

### Identity Separation

The system maintains strict separation between two identity domains:

**Customer Identity** (Bank customer)
- Purpose: Consent approval, account access
- Authentication: Customer credentials
- Session: Customer session tokens (30 min)
- Scope: Customer-facing operations

**Fintech Identity** (OAuth client)
- Purpose: API access after consent
- Authentication: OAuth client credentials
- Session: OAuth access tokens (1 hour)
- Scope: API operations on behalf of customer

**Critical Rule**: OAuth client credentials CANNOT be used to authenticate customers.

## Consent and Scope Enforcement

### Consent Model

Consents are granular, purpose-driven authorizations that:

1. **Bind to specific clients**: Each consent is for one fintech application
2. **Specify scopes**: Explicit list of data access permissions
3. **Have lifecycle**: pending → approved/denied → revoked/expired
4. **Link to tokens**: Authorization codes and access tokens reference consents
5. **Enable revocation**: Customers can revoke at any time

### Consent States

```
pending ──┬──> approved ──┬──> revoked
          │               │
          ├──> denied     └──> expired
          │
          └──> expired
```

### Scope Definitions

| Scope | Grants Access To | Required For |
|-------|------------------|--------------|
| `accounts:read` | Account list, account details, balances (fallback) | GET /api/v1/accounts |
| `transactions:read` | Transaction history | GET /api/v1/accounts/:id/transactions |
| `balances:read` | Account balances | GET /api/v1/accounts/:id/balance |
| `profile:read` | Customer profile | GET /api/v1/profile |

### Enforcement Flow

```
Request → Gateway
    ↓
1. Token Introspection
   - Valid signature?
   - Not expired?
   - Not revoked?
   → DENY: 401 Unauthorized
    ↓
2. Rate Limiting
   - Within limit?
   → DENY: 429 Too Many Requests
    ↓
3. Consent Validation
   - Consent exists?
   - Consent approved?
   - Not revoked?
   - Not expired?
   → DENY: 403 Forbidden (no/revoked/expired consent)
    ↓
4. Scope Enforcement
   - Token has required scope?
   - Consent has required scope?
   → DENY: 403 Forbidden (insufficient scope)
    ↓
5. Audit Logging
   - Log allowed request
    ↓
6. Forward to Banking API
   → SUCCESS: 200 OK
```

## Vault-Backed Backend Access

### Secret Management Architecture

All backend credentials are retrieved at runtime from a secure vault backend. **No secrets are hardcoded** in source code, configuration files, or environment files committed to version control.

### Supported Vault Backends

1. **Environment Variables** (Development)
   - Simple setup for local development
   - Secrets in process environment
   - Not suitable for production

2. **HashiCorp Vault** (Production - Recommended)
   - Industry-standard secret management
   - Dynamic secrets support
   - Audit logging and access control
   - Secret rotation capabilities

3. **AWS Secrets Manager** (AWS Deployments)
   - Native AWS integration
   - IAM-based access control
   - Automatic rotation support

4. **Azure Key Vault** (Azure Deployments)
   - Native Azure integration
   - Azure AD authentication
   - HSM support

### Runtime Secret Loading

```javascript
// Application startup
await initializeSecrets();

// Secrets loaded from vault
const dbUrl = getDatabaseUrl();
const jwtSecret = getJwtSecret();
const encryptionKey = getEncryptionKey();

// Application starts with secrets
await startServer();
```

### Fail-Closed Behavior

The application **fails to start** if any required secret is missing, ensuring it never runs with incomplete configuration.

### Secret Categories

| Category | Examples | Required |
|----------|----------|----------|
| Database | `database/url` | Yes |
| JWT | `jwt/secret` | Yes |
| Encryption | `encryption/data-encryption` | Yes |
| OAuth | `oauth/fintech-client-secret` | Yes |
| Redis | `redis/password` | No |
| Monitoring | `monitoring/sentry-dsn` | No |

## Audit Logging

### Comprehensive Event Trail

Every authorization event is logged with complete context:

**Allowed Requests**:
```json
{
  "timestamp": "2026-08-13T10:30:00Z",
  "endpoint": "/api/v1/accounts",
  "method": "GET",
  "client_id": "fintech-app-123",
  "customer_id": "CUST-001",
  "consent_id": "consent-789",
  "scope": "accounts:read",
  "authorization": "allowed",
  "http_status": 200
}
```

**Denied Requests**:
```json
{
  "timestamp": "2026-08-13T10:35:00Z",
  "endpoint": "/api/v1/transactions",
  "method": "GET",
  "client_id": "fintech-app-123",
  "customer_id": "CUST-001",
  "authorization": "denied",
  "reason": "insufficient_scope",
  "http_status": 403,
  "metadata": {
    "granted_scopes": ["accounts:read"],
    "required_scopes": ["transactions:read"]
  }
}
```

### Denial Reasons

- `invalid_token` - Token validation failed
- `expired_token` - Token has expired
- `missing_token` - No token provided
- `missing_consent` - No consent found
- `revoked_consent` - Consent revoked by customer
- `expired_consent` - Consent expired
- `insufficient_scope` - Token lacks required scope
- `rate_limit_exceeded` - Rate limit hit

### Audit Storage

- **Database**: PostgreSQL table `audit_logs`
- **Retention**: Configurable (default: 90 days)
- **Queryable**: Full-text search and filtering
- **Compliance**: Supports PSD2, GDPR, SOC 2 requirements

## Non-Goals

This MVP explicitly does NOT implement:

### 1. Production-Grade Customer Authentication
- **Current**: Demo authentication with email/password
- **Not Implemented**: 
  - Strong Customer Authentication (SCA) per PSD2
  - Multi-factor authentication (MFA)
  - Biometric authentication
  - Device fingerprinting
  - Risk-based authentication
- **Note**: Current authentication is for DEMONSTRATION ONLY

### 2. Advanced Token Management
- **Not Implemented**:
  - Refresh token rotation
  - Token revocation lists
  - Dynamic token expiration
  - Token binding to client certificates

### 3. Advanced API Features
- **Not Implemented**:
  - Pagination for large result sets
  - Filtering and sorting
  - Bulk operations
  - Webhooks for event notifications
  - API versioning strategy

### 4. Production Infrastructure
- **Not Implemented**:
  - High availability setup
  - Load balancing
  - Auto-scaling
  - Disaster recovery
  - Multi-region deployment

### 5. Advanced Security Features
- **Not Implemented**:
  - Certificate pinning
  - Request signing
  - Mutual TLS (mTLS)
  - Advanced threat detection
  - DDoS protection

### 6. Regulatory Compliance
- **Not Implemented**:
  - Full PSD2 compliance
  - GDPR data portability
  - Right to be forgotten automation
  - Regulatory reporting

### 7. Production Monitoring
- **Not Implemented**:
  - Distributed tracing
  - Advanced metrics
  - Alerting and paging
  - Performance monitoring
  - Business intelligence

## Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL 14+
- **Cache**: Redis 7+
- **Secrets**: HashiCorp Vault (production)

### Security
- **OAuth**: OAuth 2.0 Authorization Code Grant
- **Tokens**: JWT (JSON Web Tokens)
- **Encryption**: bcrypt (password hashing)
- **Secrets**: Vault integration

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **IaC**: Terraform (cloud deployments)
- **Development**: Local Docker environment

### Testing
- **Framework**: Jest
- **Coverage**: Unit, integration, end-to-end
- **Demo Scenarios**: Automated acceptance tests

## Deployment Architecture

### Local Development
```
Docker Compose
├── PostgreSQL (port 5432)
├── Redis (port 6379)
├── Vault (port 8200)
├── Banking API (port 3002)
├── Consent UI (port 3001)
├── Fintech Demo (port 3000)
└── API Gateway (port 8080)
```

### Production (Recommended)
```
Cloud Provider (AWS/Azure/GCP)
├── Load Balancer
├── Application Tier (Auto-scaled)
│   ├── API Gateway instances
│   ├── Banking API instances
│   └── OAuth server instances
├── Data Tier
│   ├── PostgreSQL (managed service)
│   ├── Redis (managed service)
│   └── Vault (managed service)
└── Monitoring & Logging
    ├── Application logs
    ├── Audit logs
    └── Metrics
```

