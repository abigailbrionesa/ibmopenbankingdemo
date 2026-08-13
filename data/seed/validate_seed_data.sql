-- Seed data validation tests for Open Banking MVP
-- Run this script to verify all seed data was loaded correctly

-- Test 1: Verify demo customer CUST-001 exists
DO $$
DECLARE
    customer_count INTEGER;
BEGIN
    RAISE NOTICE 'Test 1: Checking demo customer CUST-001 exists...';
    
    SELECT COUNT(*) INTO customer_count 
    FROM customers 
    WHERE customer_id = 'CUST-001' AND name = 'Maria Garcia';
    
    IF customer_count = 0 THEN
        RAISE EXCEPTION 'Demo customer CUST-001 (Maria Garcia) not found';
    END IF;
    
    RAISE NOTICE '✓ Demo customer CUST-001 exists';
END $$;

-- Test 2: Verify demo account ACC-001 exists
DO $$
DECLARE
    account_count INTEGER;
    account_balance DECIMAL(15,2);
BEGIN
    RAISE NOTICE 'Test 2: Checking demo account ACC-001 exists...';
    
    SELECT COUNT(*), MAX(balance) INTO account_count, account_balance
    FROM accounts 
    WHERE account_id = 'ACC-001' 
    AND customer_id = 'CUST-001'
    AND currency = 'PEN';
    
    IF account_count = 0 THEN
        RAISE EXCEPTION 'Demo account ACC-001 not found';
    END IF;
    
    IF account_balance IS NULL OR account_balance <= 0 THEN
        RAISE EXCEPTION 'Demo account ACC-001 has invalid balance';
    END IF;
    
    RAISE NOTICE '✓ Demo account ACC-001 exists with balance: % PEN', account_balance;
END $$;

-- Test 3: Verify at least one transaction exists for ACC-001
DO $$
DECLARE
    transaction_count INTEGER;
BEGIN
    RAISE NOTICE 'Test 3: Checking transactions exist for ACC-001...';
    
    SELECT COUNT(*) INTO transaction_count 
    FROM transactions 
    WHERE account_id = 'ACC-001';
    
    IF transaction_count = 0 THEN
        RAISE EXCEPTION 'No transactions found for ACC-001';
    END IF;
    
    RAISE NOTICE '✓ Found % transactions for ACC-001', transaction_count;
END $$;

-- Test 4: Verify PEN-denominated transactions exist
DO $$
DECLARE
    pen_transaction_count INTEGER;
BEGIN
    RAISE NOTICE 'Test 4: Checking PEN-denominated transactions exist...';
    
    SELECT COUNT(*) INTO pen_transaction_count 
    FROM transactions 
    WHERE currency = 'PEN';
    
    IF pen_transaction_count = 0 THEN
        RAISE EXCEPTION 'No PEN-denominated transactions found';
    END IF;
    
    RAISE NOTICE '✓ Found % PEN-denominated transactions', pen_transaction_count;
END $$;

-- Test 5: Verify consent records exist
DO $$
DECLARE
    consent_count INTEGER;
BEGIN
    RAISE NOTICE 'Test 5: Checking consent records exist...';
    
    SELECT COUNT(*) INTO consent_count 
    FROM consents 
    WHERE customer_id = 'CUST-001';
    
    IF consent_count = 0 THEN
        RAISE EXCEPTION 'No consent records found for CUST-001';
    END IF;
    
    RAISE NOTICE '✓ Found % consent records for CUST-001', consent_count;
END $$;

-- Test 6: Verify data integrity - all accounts belong to valid customers
DO $$
DECLARE
    orphan_accounts INTEGER;
BEGIN
    RAISE NOTICE 'Test 6: Checking account-customer data integrity...';
    
    SELECT COUNT(*) INTO orphan_accounts
    FROM accounts a
    LEFT JOIN customers c ON a.customer_id = c.customer_id
    WHERE c.customer_id IS NULL;
    
    IF orphan_accounts > 0 THEN
        RAISE EXCEPTION 'Found % accounts without valid customers', orphan_accounts;
    END IF;
    
    RAISE NOTICE '✓ All accounts have valid customer references';
END $$;

-- Test 7: Verify data integrity - all transactions belong to valid accounts
DO $$
DECLARE
    orphan_transactions INTEGER;
BEGIN
    RAISE NOTICE 'Test 7: Checking transaction-account data integrity...';
    
    SELECT COUNT(*) INTO orphan_transactions
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.account_id
    WHERE a.account_id IS NULL;
    
    IF orphan_transactions > 0 THEN
        RAISE EXCEPTION 'Found % transactions without valid accounts', orphan_transactions;
    END IF;
    
    RAISE NOTICE '✓ All transactions have valid account references';
END $$;

-- Test 8: Verify data integrity - all consents belong to valid customers
DO $$
DECLARE
    orphan_consents INTEGER;
BEGIN
    RAISE NOTICE 'Test 8: Checking consent-customer data integrity...';
    
    SELECT COUNT(*) INTO orphan_consents
    FROM consents co
    LEFT JOIN customers c ON co.customer_id = c.customer_id
    WHERE c.customer_id IS NULL;
    
    IF orphan_consents > 0 THEN
        RAISE EXCEPTION 'Found % consents without valid customers', orphan_consents;
    END IF;
    
    RAISE NOTICE '✓ All consents have valid customer references';
END $$;

-- Test 9: Verify transaction types are valid
DO $$
DECLARE
    invalid_types INTEGER;
BEGIN
    RAISE NOTICE 'Test 9: Checking transaction types are valid...';
    
    SELECT COUNT(*) INTO invalid_types
    FROM transactions
    WHERE transaction_type NOT IN ('debit', 'credit', 'transfer', 'payment', 'withdrawal', 'deposit', 'fee', 'interest');
    
    IF invalid_types > 0 THEN
        RAISE EXCEPTION 'Found % transactions with invalid types', invalid_types;
    END IF;
    
    RAISE NOTICE '✓ All transaction types are valid';
END $$;

-- Test 10: Verify account balances are reasonable
DO $$
DECLARE
    invalid_balances INTEGER;
BEGIN
    RAISE NOTICE 'Test 10: Checking account balances are reasonable...';
    
    SELECT COUNT(*) INTO invalid_balances
    FROM accounts
    WHERE balance < -1000000 OR balance > 10000000;
    
    IF invalid_balances > 0 THEN
        RAISE WARNING 'Found % accounts with unusual balances (may be intentional)', invalid_balances;
    ELSE
        RAISE NOTICE '✓ All account balances are within reasonable range';
    END IF;
END $$;

-- Summary report
DO $$
DECLARE
    total_customers INTEGER;
    total_accounts INTEGER;
    total_transactions INTEGER;
    total_consents INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_customers FROM customers;
    SELECT COUNT(*) INTO total_accounts FROM accounts;
    SELECT COUNT(*) INTO total_transactions FROM transactions;
    SELECT COUNT(*) INTO total_consents FROM consents;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Seed Data Validation Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total Customers: %', total_customers;
    RAISE NOTICE 'Total Accounts: %', total_accounts;
    RAISE NOTICE 'Total Transactions: %', total_transactions;
    RAISE NOTICE 'Total Consents: %', total_consents;
    RAISE NOTICE '';
    RAISE NOTICE 'All seed data validation tests passed!';
    RAISE NOTICE 'Demo data ready for Maria Garcia (CUST-001)';
END $$;

-- Made with Bob
