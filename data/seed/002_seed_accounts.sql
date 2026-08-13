-- Seed account data for Open Banking MVP demo
-- Demo account: ACC-001 for Maria Garcia (CUST-001)

INSERT INTO accounts (
    account_id,
    customer_id,
    account_type,
    currency,
    balance,
    available_balance,
    account_number,
    iban,
    swift_code,
    branch_code,
    status
) VALUES (
    'ACC-001',
    'CUST-001',
    'checking',
    'PEN',
    15750.50,
    15750.50,
    '191-1234567-0-01',
    'PE91191123456700001',
    'BCPLPEPL',
    'LIM001',
    'active'
);

-- Additional accounts for Maria Garcia
INSERT INTO accounts (
    account_id,
    customer_id,
    account_type,
    currency,
    balance,
    available_balance,
    account_number,
    iban,
    swift_code,
    branch_code,
    status
) VALUES 
(
    'ACC-002',
    'CUST-001',
    'savings',
    'PEN',
    42300.00,
    42300.00,
    '191-1234567-0-02',
    'PE91191123456700002',
    'BCPLPEPL',
    'LIM001',
    'active'
),
(
    'ACC-003',
    'CUST-001',
    'credit',
    'PEN',
    -2450.75,
    7549.25,
    '191-1234567-0-03',
    'PE91191123456700003',
    'BCPLPEPL',
    'LIM001',
    'active'
);

-- Accounts for other demo customers
INSERT INTO accounts (
    account_id,
    customer_id,
    account_type,
    currency,
    balance,
    available_balance,
    account_number,
    iban,
    swift_code,
    branch_code,
    status
) VALUES 
(
    'ACC-004',
    'CUST-002',
    'checking',
    'PEN',
    8920.30,
    8920.30,
    '191-2345678-0-01',
    'PE91191234567800001',
    'BCPLPEPL',
    'LIM002',
    'active'
),
(
    'ACC-005',
    'CUST-003',
    'savings',
    'PEN',
    25600.00,
    25600.00,
    '191-3456789-0-01',
    'PE91191345678900001',
    'BCPLPEPL',
    'LIM001',
    'active'
);

-- Made with Bob
