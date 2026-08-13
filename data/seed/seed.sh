#!/bin/bash
# Seed data loading script for Open Banking MVP
# This script loads all seed data files in order

set -e

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-openbanking_dev}"
DB_USER="${DB_USER:-postgres}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "Open Banking MVP - Seed Data Loading"
echo "=========================================="
echo "Database: ${DB_NAME}"
echo "Host: ${DB_HOST}:${DB_PORT}"
echo "User: ${DB_USER}"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "Error: psql command not found. Please install PostgreSQL client."
    exit 1
fi

# Test database connection
echo "Testing database connection..."
if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" > /dev/null 2>&1; then
    echo "Error: Cannot connect to database. Please check your credentials and ensure the database is running."
    exit 1
fi
echo "✓ Database connection successful"
echo ""

# Check if tables exist
echo "Checking if schema is initialized..."
if ! PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1 FROM customers LIMIT 1" > /dev/null 2>&1; then
    echo "Error: Schema not initialized. Please run migrations first."
    echo "Run: cd ../schema && ./migrate.sh"
    exit 1
fi
echo "✓ Schema is initialized"
echo ""

# Load seed data in order
echo "Loading seed data..."
for seed_file in "${SCRIPT_DIR}"/*.sql; do
    filename=$(basename "${seed_file}")
    
    # Skip validation scripts
    if [[ "${filename}" == "validate_seed_data.sql" ]]; then
        continue
    fi
    
    echo "→ Loading ${filename}..."
    if PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f "${seed_file}"; then
        echo "✓ Loaded ${filename}"
    else
        echo "✗ Failed to load ${filename}"
        exit 1
    fi
done

echo ""
echo "=========================================="
echo "Seed Data Loading Complete"
echo "=========================================="

# Show summary
echo ""
echo "Data Summary:"
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" <<EOF
SELECT 'Customers' as entity, COUNT(*) as count FROM customers
UNION ALL
SELECT 'Accounts', COUNT(*) FROM accounts
UNION ALL
SELECT 'Transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'Consents', COUNT(*) FROM consents
ORDER BY entity;
EOF

echo ""
echo "Demo customer ready: Maria Garcia (CUST-001)"
echo "Demo account ready: ACC-001 (Checking account in PEN)"

# Made with Bob
