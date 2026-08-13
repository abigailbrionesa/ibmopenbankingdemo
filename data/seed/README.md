# Database Seed Data

This directory contains seed data for local development and testing of the Open Banking MVP.

## Purpose

Provides sample data for:
- **Demo customer**: Maria Garcia (CUST-001)
- **Bank accounts**: Checking, savings, and credit accounts in PEN
- **Transactions**: Representative PEN-denominated transaction history
- **Consents**: Active, expired, and revoked consent records

## Seed Files

- [`001_seed_customers.sql`](001_seed_customers.sql:1) - Demo customers including Maria Garcia
- [`002_seed_accounts.sql`](002_seed_accounts.sql:1) - Bank accounts (ACC-001 and others)
- [`003_seed_transactions.sql`](003_seed_transactions.sql:1) - PEN-denominated transactions
- [`004_seed_consents.sql`](004_seed_consents.sql:1) - Consent records for testing
- [`seed.sh`](seed.sh:1) - Script to load all seed data
- [`validate_seed_data.sql`](validate_seed_data.sql:1) - Seed data validation tests

## Loading Seed Data

```bash
# Set database credentials
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=openbanking_dev
export DB_USER=postgres
export DB_PASSWORD=your_password

# Load seed data
cd data/seed
chmod +x seed.sh
./seed.sh
```

## Validating Seed Data

```bash
# Run validation tests
psql -h localhost -U postgres -d openbanking_dev -f validate_seed_data.sql
```

## Demo Data Details

### Maria Garcia (CUST-001)
- **Email**: maria.garcia@example.com
- **Location**: Lima, Peru
- **Accounts**: 3 accounts (checking, savings, credit)

### Account ACC-001 (Checking)
- **Type**: Checking account
- **Currency**: PEN (Peruvian Sol)
- **Balance**: 15,750.50 PEN
- **Account Number**: 191-1234567-0-01
- **Transactions**: 15+ recent transactions including salary deposits, purchases, and bill payments

### Transaction History
- Salary deposits (5,500 PEN monthly)
- Grocery shopping at Wong Supermercados
- Utility payments (Luz del Sur, Movistar)
- Restaurant and dining expenses
- ATM withdrawals
- Online shopping (Mercado Libre)
- Banking fees and interest

### Consent Records
- **CONSENT-001**: Active consent for fintech-demo-client
  - Scopes: accounts:read, transactions:read, balances:read
  - Expires in 75 days
- Additional consents for testing expired and revoked states

## Important Notes

- All seed data uses **placeholder values only**
- No real customer data or credentials are included
- PEN (Peruvian Sol) is the primary currency for demo transactions
- Data supports the happy-path demo for Maria Garcia
- External APIs have no direct database access (must go through Banking API)