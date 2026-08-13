-- Seed consent data for Open Banking MVP demo
-- Demo consents for Maria Garcia (CUST-001)

-- Active consent for fintech demo app
INSERT INTO consents (
    consent_id,
    customer_id,
    client_id,
    purpose,
    scopes,
    status,
    created_at,
    expires_at,
    access_count
) VALUES (
    'CONSENT-001',
    'CUST-001',
    'fintech-demo-client',
    'Access account information and transaction history for personal finance management',
    ARRAY['accounts:read', 'transactions:read', 'balances:read'],
    'active',
    CURRENT_TIMESTAMP - INTERVAL '15 days',
    CURRENT_TIMESTAMP + INTERVAL '75 days',
    42
);

-- Recently expired consent (for testing)
INSERT INTO consents (
    consent_id,
    customer_id,
    client_id,
    purpose,
    scopes,
    status,
    created_at,
    expires_at,
    access_count
) VALUES (
    'CONSENT-002',
    'CUST-001',
    'budget-tracker-app',
    'Track spending and create budgets',
    ARRAY['accounts:read', 'transactions:read'],
    'expired',
    CURRENT_TIMESTAMP - INTERVAL '120 days',
    CURRENT_TIMESTAMP - INTERVAL '30 days',
    156
);

-- Revoked consent (for testing)
INSERT INTO consents (
    consent_id,
    customer_id,
    client_id,
    purpose,
    scopes,
    status,
    created_at,
    expires_at,
    revoked_at,
    access_count
) VALUES (
    'CONSENT-003',
    'CUST-001',
    'loan-comparison-app',
    'Compare loan offers based on financial profile',
    ARRAY['accounts:read', 'balances:read'],
    'revoked',
    CURRENT_TIMESTAMP - INTERVAL '60 days',
    CURRENT_TIMESTAMP + INTERVAL '30 days',
    CURRENT_TIMESTAMP - INTERVAL '10 days',
    23
);

-- Pending consent (awaiting customer approval)
INSERT INTO consents (
    consent_id,
    customer_id,
    client_id,
    purpose,
    scopes,
    status,
    created_at,
    expires_at,
    access_count
) VALUES (
    'CONSENT-004',
    'CUST-001',
    'investment-advisor-app',
    'Provide investment recommendations based on financial situation',
    ARRAY['accounts:read', 'transactions:read', 'balances:read', 'profile:read'],
    'pending',
    CURRENT_TIMESTAMP - INTERVAL '2 hours',
    CURRENT_TIMESTAMP + INTERVAL '90 days',
    0
);

-- Consents for other customers (for testing)
INSERT INTO consents (
    consent_id,
    customer_id,
    client_id,
    purpose,
    scopes,
    status,
    created_at,
    expires_at,
    access_count
) VALUES 
(
    'CONSENT-005',
    'CUST-002',
    'fintech-demo-client',
    'Access account information and transaction history for personal finance management',
    ARRAY['accounts:read', 'transactions:read'],
    'active',
    CURRENT_TIMESTAMP - INTERVAL '30 days',
    CURRENT_TIMESTAMP + INTERVAL '60 days',
    78
),
(
    'CONSENT-006',
    'CUST-003',
    'fintech-demo-client',
    'Access account information and transaction history for personal finance management',
    ARRAY['accounts:read', 'transactions:read', 'balances:read'],
    'active',
    CURRENT_TIMESTAMP - INTERVAL '45 days',
    CURRENT_TIMESTAMP + INTERVAL '45 days',
    112
);

-- Made with Bob
