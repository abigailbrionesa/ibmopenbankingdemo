set -e

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-openbanking_dev}"
DB_USER="${DB_USER:-postgres}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "Open Banking MVP - Database Migration"
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

# Create migrations table if it doesn't exist
echo "Creating migrations tracking table..."
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" <<EOF
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
EOF
echo "✓ Migrations table ready"
echo ""

# Run migrations in order
echo "Running migrations..."
for migration_file in "${SCRIPT_DIR}"/*.sql; do
    filename=$(basename "${migration_file}")
    
    # Skip if already applied
    already_applied=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM schema_migrations WHERE filename = '${filename}'")
    
    if [ "${already_applied}" -gt 0 ]; then
        echo "⊘ Skipping ${filename} (already applied)"
        continue
    fi
    
    echo "→ Applying ${filename}..."
    if PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f "${migration_file}"; then
        # Record successful migration
        PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "INSERT INTO schema_migrations (filename) VALUES ('${filename}')"
        echo "✓ Applied ${filename}"
    else
        echo "✗ Failed to apply ${filename}"
        exit 1
    fi
done

echo ""
echo "=========================================="
echo "Migration completed successfully!"
echo "=========================================="

# Show applied migrations
echo ""
echo "Applied migrations:"
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at"

# Made with Bob
