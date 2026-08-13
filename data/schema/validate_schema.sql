-- Schema validation tests for Open Banking MVP
-- Run this script to verify all tables and constraints are properly created

-- Test 1: Verify all required tables exist
DO $$
DECLARE
    missing_tables TEXT[];
    required_tables TEXT[] := ARRAY['customers', 'accounts', 'transactions', 'consents', 'schema_migrations'];
    tbl TEXT;
BEGIN
    RAISE NOTICE 'Test 1: Checking required tables exist...';
    
    FOREACH tbl IN ARRAY required_tables
    LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
            missing_tables := array_append(missing_tables, tbl);
        END IF;
    END LOOP;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'Missing tables: %', array_to_string(missing_tables, ', ');
    ELSE
        RAISE NOTICE '✓ All required tables exist';
    END IF;
END $$;

-- Test 2: Verify customers table structure
DO $$
DECLARE
    required_columns TEXT[] := ARRAY['customer_id', 'name', 'email', 'status'];
    col TEXT;
BEGIN
    RAISE NOTICE 'Test 2: Validating customers table structure...';
    
    FOREACH col IN ARRAY required_columns
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'customers' AND column_name = col
        ) THEN
            RAISE EXCEPTION 'Missing column in customers table: %', col;
        END IF;
    END LOOP;
    
    RAISE NOTICE '✓ Customers table structure valid';
END $$;

-- Test 3: Verify accounts table structure and foreign keys
DO $$
DECLARE
    required_columns TEXT[] := ARRAY['account_id', 'customer_id', 'account_type', 'currency', 'balance'];
    col TEXT;
BEGIN
    RAISE NOTICE 'Test 3: Validating accounts table structure...';
    
    FOREACH col IN ARRAY required_columns
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'accounts' AND column_name = col
        ) THEN
            RAISE EXCEPTION 'Missing column in accounts table: %', col;
        END IF;
    END LOOP;
    
    -- Verify foreign key constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'accounts' 
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name = 'fk_accounts_customer'
    ) THEN
        RAISE EXCEPTION 'Missing foreign key constraint: fk_accounts_customer';
    END IF;
    
    RAISE NOTICE '✓ Accounts table structure valid';
END $$;

-- Test 4: Verify transactions table structure and foreign keys
DO $$
DECLARE
    required_columns TEXT[] := ARRAY['transaction_id', 'account_id', 'timestamp', 'amount', 'currency', 'description'];
    col TEXT;
BEGIN
    RAISE NOTICE 'Test 4: Validating transactions table structure...';
    
    FOREACH col IN ARRAY required_columns
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'transactions' AND column_name = col
        ) THEN
            RAISE EXCEPTION 'Missing column in transactions table: %', col;
        END IF;
    END LOOP;
    
    -- Verify foreign key constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'transactions' 
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name = 'fk_transactions_account'
    ) THEN
        RAISE EXCEPTION 'Missing foreign key constraint: fk_transactions_account';
    END IF;
    
    RAISE NOTICE '✓ Transactions table structure valid';
END $$;

-- Test 5: Verify consents table structure and foreign keys
DO $$
DECLARE
    required_columns TEXT[] := ARRAY['consent_id', 'customer_id', 'client_id', 'purpose', 'scopes', 'status', 'expires_at'];
    col TEXT;
BEGIN
    RAISE NOTICE 'Test 5: Validating consents table structure...';
    
    FOREACH col IN ARRAY required_columns
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'consents' AND column_name = col
        ) THEN
            RAISE EXCEPTION 'Missing column in consents table: %', col;
        END IF;
    END LOOP;
    
    -- Verify foreign key constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'consents' 
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name = 'fk_consents_customer'
    ) THEN
        RAISE EXCEPTION 'Missing foreign key constraint: fk_consents_customer';
    END IF;
    
    RAISE NOTICE '✓ Consents table structure valid';
END $$;

-- Test 6: Verify indexes exist
DO $$
BEGIN
    RAISE NOTICE 'Test 6: Validating indexes...';
    
    -- Check critical indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_accounts_customer_id') THEN
        RAISE EXCEPTION 'Missing index: idx_accounts_customer_id';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transactions_account_id') THEN
        RAISE EXCEPTION 'Missing index: idx_transactions_account_id';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_consents_customer_id') THEN
        RAISE EXCEPTION 'Missing index: idx_consents_customer_id';
    END IF;
    
    RAISE NOTICE '✓ Critical indexes exist';
END $$;

-- Test 7: Verify check constraints
DO $$
BEGIN
    RAISE NOTICE 'Test 7: Validating check constraints...';
    
    -- Verify account_type constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name LIKE '%account_type%'
    ) THEN
        RAISE EXCEPTION 'Missing check constraint for account_type';
    END IF;
    
    -- Verify status constraints
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name LIKE '%status%'
    ) THEN
        RAISE EXCEPTION 'Missing check constraint for status';
    END IF;
    
    RAISE NOTICE '✓ Check constraints valid';
END $$;

-- Summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Schema Validation Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'All schema validation tests passed!';
END $$;

-- Made with Bob
