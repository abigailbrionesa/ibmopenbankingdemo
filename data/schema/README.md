# Database Schema

This directory contains database schema definitions and migrations for the Open Banking MVP staging database.

## Purpose

Defines database structure for:
- **Customers** - Customer profile information
- **Accounts** - Bank accounts (checking, savings, credit, investment)
- **Transactions** - Transaction history with PEN currency support
- **Consents** - Customer consent records for Open Banking data sharing

## Schema Files

- [`001_create_customers_table.sql`](001_create_customers_table.sql:1) - Customer profiles
- [`002_create_accounts_table.sql`](002_create_accounts_table.sql:1) - Bank accounts
- [`003_create_transactions_table.sql`](003_create_transactions_table.sql:1) - Transaction history
- [`004_create_consents_table.sql`](004_create_consents_table.sql:1) - Consent management
- [`migrate.sh`](migrate.sh:1) - Migration script to apply all schemas
- [`validate_schema.sql`](validate_schema.sql:1) - Schema validation tests

## Running Migrations

```bash
# Set database credentials
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=openbanking_dev
export DB_USER=postgres
export DB_PASSWORD=your_password

# Run migrations
cd data/schema
chmod +x migrate.sh
./migrate.sh
```

## Validating Schema

```bash
# Run validation tests
psql -h localhost -U postgres -d openbanking_dev -f validate_schema.sql
```

## Schema Details

### Customers Table
- Primary key: `customer_id` (e.g., CUST-001)
- Fields: name, email, phone, address, status
- Indexes: email, status

### Accounts Table
- Primary key: `account_id` (e.g., ACC-001)
- Foreign key: `customer_id` → customers
- Fields: account_type, currency (default: PEN), balance, account_number
- Indexes: customer_id, account_number, status, currency

### Transactions Table
- Primary key: `transaction_id` (e.g., TXN-001)
- Foreign key: `account_id` → accounts
- Fields: timestamp, amount, currency, transaction_type, description
- Indexes: account_id, timestamp, type, status

### Consents Table
- Primary key: `consent_id` (e.g., CONSENT-001)
- Foreign key: `customer_id` → customers
- Fields: client_id, purpose, scopes (array), status, expires_at
- Indexes: customer_id, client_id, status, expires_at