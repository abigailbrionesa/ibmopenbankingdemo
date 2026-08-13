-- Seed transaction data for Open Banking MVP demo
-- Representative PEN-denominated transactions for ACC-001 (Maria Garcia)

-- Recent transactions (last 30 days)
INSERT INTO transactions (
    transaction_id,
    account_id,
    timestamp,
    amount,
    currency,
    transaction_type,
    description,
    merchant_name,
    merchant_category,
    balance_after,
    status
) VALUES 
-- Salary deposit
(
    'TXN-001',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '2 days',
    5500.00,
    'PEN',
    'credit',
    'Salary deposit - January 2026',
    'Employer Direct Deposit',
    'Income',
    15750.50,
    'completed'
),
-- Grocery shopping
(
    'TXN-002',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '3 days',
    -245.80,
    'PEN',
    'debit',
    'Grocery purchase',
    'Wong Supermercados',
    'Groceries',
    10250.50,
    'completed'
),
-- Utility bill payment
(
    'TXN-003',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '5 days',
    -180.50,
    'PEN',
    'payment',
    'Electricity bill payment',
    'Luz del Sur',
    'Utilities',
    10496.30,
    'completed'
),
-- Restaurant
(
    'TXN-004',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '6 days',
    -125.00,
    'PEN',
    'debit',
    'Restaurant payment',
    'Central Restaurante',
    'Dining',
    10676.80,
    'completed'
),
-- ATM withdrawal
(
    'TXN-005',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '7 days',
    -500.00,
    'PEN',
    'withdrawal',
    'ATM withdrawal',
    'BCP ATM - Miraflores',
    'Cash Withdrawal',
    10801.80,
    'completed'
),
-- Online shopping
(
    'TXN-006',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '10 days',
    -320.50,
    'PEN',
    'debit',
    'Online purchase',
    'Mercado Libre',
    'Shopping',
    11301.80,
    'completed'
),
-- Phone bill
(
    'TXN-007',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '12 days',
    -89.90,
    'PEN',
    'payment',
    'Mobile phone bill',
    'Movistar Peru',
    'Telecommunications',
    11622.30,
    'completed'
),
-- Gas station
(
    'TXN-008',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '14 days',
    -150.00,
    'PEN',
    'debit',
    'Fuel purchase',
    'Primax',
    'Transportation',
    11712.20,
    'completed'
),
-- Transfer received
(
    'TXN-009',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '15 days',
    800.00,
    'PEN',
    'transfer',
    'Transfer from savings account',
    'Internal Transfer',
    'Transfer',
    11862.20,
    'completed'
),
-- Pharmacy
(
    'TXN-010',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '18 days',
    -75.30,
    'PEN',
    'debit',
    'Pharmacy purchase',
    'Inkafarma',
    'Healthcare',
    11062.20,
    'completed'
),
-- Subscription payment
(
    'TXN-011',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '20 days',
    -45.90,
    'PEN',
    'payment',
    'Streaming service subscription',
    'Netflix',
    'Entertainment',
    11137.50,
    'completed'
),
-- Coffee shop
(
    'TXN-012',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '22 days',
    -28.50,
    'PEN',
    'debit',
    'Coffee and pastry',
    'Starbucks',
    'Dining',
    11183.40,
    'completed'
),
-- Bank fee
(
    'TXN-013',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '25 days',
    -15.00,
    'PEN',
    'fee',
    'Monthly account maintenance fee',
    'BCP',
    'Banking Fees',
    11211.90,
    'completed'
),
-- Interest earned
(
    'TXN-014',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '28 days',
    12.40,
    'PEN',
    'interest',
    'Monthly interest earned',
    'BCP',
    'Interest',
    11226.90,
    'completed'
),
-- Previous salary
(
    'TXN-015',
    'ACC-001',
    CURRENT_TIMESTAMP - INTERVAL '32 days',
    5500.00,
    'PEN',
    'credit',
    'Salary deposit - December 2025',
    'Employer Direct Deposit',
    'Income',
    11214.50,
    'completed'
);

-- Transactions for ACC-002 (Maria's savings account)
INSERT INTO transactions (
    transaction_id,
    account_id,
    timestamp,
    amount,
    currency,
    transaction_type,
    description,
    balance_after,
    status
) VALUES 
(
    'TXN-016',
    'ACC-002',
    CURRENT_TIMESTAMP - INTERVAL '15 days',
    -800.00,
    'PEN',
    'transfer',
    'Transfer to checking account',
    42300.00,
    'completed'
),
(
    'TXN-017',
    'ACC-002',
    CURRENT_TIMESTAMP - INTERVAL '30 days',
    150.00,
    'PEN',
    'interest',
    'Monthly interest earned',
    43100.00,
    'completed'
);

-- Transactions for ACC-003 (Maria's credit card)
INSERT INTO transactions (
    transaction_id,
    account_id,
    timestamp,
    amount,
    currency,
    transaction_type,
    description,
    merchant_name,
    merchant_category,
    balance_after,
    status
) VALUES 
(
    'TXN-018',
    'ACC-003',
    CURRENT_TIMESTAMP - INTERVAL '4 days',
    -450.75,
    'PEN',
    'debit',
    'Department store purchase',
    'Saga Falabella',
    'Shopping',
    -2450.75,
    'completed'
),
(
    'TXN-019',
    'ACC-003',
    CURRENT_TIMESTAMP - INTERVAL '8 days',
    -280.00,
    'PEN',
    'debit',
    'Electronics purchase',
    'Hiraoka',
    'Electronics',
    -2000.00,
    'completed'
);

-- Made with Bob
