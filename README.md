# Open Banking MVP

A demonstration implementation of Open Banking APIs showcasing secure data sharing between financial institutions and third-party applications through standardized APIs, OAuth 2.0 authentication, and customer consent management.

## Overview

This MVP demonstrates the core components of an Open Banking ecosystem:

- **Third-party Fintech Applications** - Request access to customer banking data
- **Customer Consent Management** - Customers control what data is shared
- **API Gateway** - Secure routing and policy enforcement
- **Banking APIs** - Provide account and transaction data
- **OAuth 2.0 Authentication** - Industry-standard authorization
- **Secrets Management** - Secure credential storage with HashiCorp Vault

## Architecture

### Key Actors

1. **Bank Customer** - Owns the banking data and grants/revokes consent
2. **Fintech Application** - Third-party app requesting access to customer data
3. **Bank** - Provides APIs to access customer account information
4. **API Gateway** - Enforces security policies and routes requests
5. **Consent Service** - Manages customer authorization decisions

### Path Flow

1. Fintech app redirects customer to bank's consent page
2. Customer authenticates and reviews requested data scopes
3. Customer grants consent for specific data access
4. OAuth authorization code is issued to fintech app
5. Fintech app exchanges code for access token
6. Fintech app calls banking APIs with access token
7. API gateway validates token and consent
8. Banking API returns requested customer data

## Repository Structure

```
├── apps/                      # Application services
│   ├── fintech-demo/         # Demo fintech application
│   ├── customer-consent/     # Consent management UI
│   └── banking-api/          # Core banking API
├── gateway/                   # API Gateway configuration
│   ├── api-definitions/      # API specs and routes
│   ├── policies/             # Gateway policies
│   └── security/             # Security configurations
├── auth/                      # Authentication & authorization
│   ├── oauth/                # OAuth 2.0 implementation
│   └── consent/              # Consent management logic
├── data/                      # Data layer
│   ├── schema/               # Database schemas
│   └── seed/                 # Sample data for development
├── vault/                     # Secrets management
│   └── configuration/        # Vault setup and policies
├── infrastructure/            # Infrastructure as Code
│   ├── docker/               # Docker configurations
│   └── terraform/            # Cloud infrastructure
├── tests/                     # Test suites
│   ├── auth/                 # Authentication tests
│   ├── consent/              # Consent flow tests
│   ├── gateway/              # Gateway tests
│   └── integration/          # End-to-end tests
└── docs/                      # Documentation
```

## Local Development Setup

### Prerequisites

- Docker Desktop (version 20.10+)
- Docker Compose (version 2.0+)
- Git
- Node.js 18+ (for running apps locally without Docker)
- Python 3.9+ (for banking API)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ibmopenbankingdemo
   ```

2. **Copy environment configuration**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure required values (see Configuration section below)

3. **Start the local environment**
   ```bash
   docker-compose up -d
   ```

4. **Initialize the database**
   ```bash
   docker-compose exec banking-api npm run db:migrate
   docker-compose exec banking-api npm run db:seed
   ```

5. **Access the applications**
   - Fintech Demo: http://localhost:3000
   - Consent UI: http://localhost:3001
   - Banking API: http://localhost:3002
   - API Gateway: http://localhost:8080
   - Vault UI: http://localhost:8200

### Configuration

The `.env.example` file contains all required configuration with placeholder values. Key settings include:

- **Database**: Connection strings for PostgreSQL
- **OAuth**: Client IDs and redirect URIs (secrets in Vault)
- **API Gateway**: Endpoint configurations
- **Vault**: Access tokens and paths (development only)
### Running Tests

```bash
# Run all tests
docker-compose exec banking-api npm test

# Run specific test suites
npm run test:auth
npm run test:consent
npm run test:gateway
npm run test:integration
npm run test:security
```

### Running Demo Scenarios

Automated end-to-end demo scenarios validate all MVP acceptance criteria:

```bash
# Run all demo scenarios
npm run demo:all

# Run individual scenarios
npm run demo:happy-path           # Scenario A: Happy path (200 OK)
npm run demo:no-consent           # Scenario B: No consent (403 Forbidden)
npm run demo:revoked-consent      # Scenario C: Revoked consent (403 Forbidden)
npm run demo:wrong-scope          # Scenario D: Wrong scope (403 Forbidden)
npm run demo:expired-token        # Scenario E: Expired token (401 Unauthorized)
npm run demo:rate-limit           # Scenario F: Rate limit (429 Too Many Requests)
npm run demo:credential-protection # Scenario G: Credential protection

# List all available scenarios
npm run demo:list
```

**See [`DEMO_GUIDE.md`](./DEMO_GUIDE.md) for complete demo documentation.**
