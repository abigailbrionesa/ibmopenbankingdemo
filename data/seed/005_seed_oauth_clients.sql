-- Seed OAuth client data for Open Banking MVP demo
-- Demo OAuth client for fintech-demo application

-- Note: The client_secret_hash below is bcrypt hash of 'demo-secret-key-12345'
-- This is for DEMO purposes only. In production, secrets are generated during registration.

INSERT INTO oauth_clients (
    client_id,
    client_secret_hash,
    name,
    redirect_uris,
    allowed_scopes,
    status,
    description,
    contact_email,
    website_url
) VALUES (
    'fintech-demo-client',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIeWPyS4bO',
    'Fintech Demo Application',
    ARRAY[
        'http://localhost:3000/callback',
        'http://localhost:3000/oauth/callback',
        'https://demo.fintech.example.com/callback'
    ],
    ARRAY['accounts:read', 'transactions:read', 'balances:read'],
    'active',
    'Demo fintech application for Open Banking MVP showcase',
    'demo@fintech.example.com',
    'https://demo.fintech.example.com'
);

-- Additional test clients for different scenarios

-- Client with limited scopes (accounts only)
INSERT INTO oauth_clients (
    client_id,
    client_secret_hash,
    name,
    redirect_uris,
    allowed_scopes,
    status,
    description
) VALUES (
    'budget-tracker-app',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIeWPyS4bO',
    'Budget Tracker App',
    ARRAY['https://budget.example.com/callback'],
    ARRAY['accounts:read', 'balances:read'],
    'active',
    'Personal budget tracking application'
);

-- Client with full access
INSERT INTO oauth_clients (
    client_id,
    client_secret_hash,
    name,
    redirect_uris,
    allowed_scopes,
    status,
    description
) VALUES (
    'financial-advisor-app',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIeWPyS4bO',
    'Financial Advisor Platform',
    ARRAY[
        'https://advisor.example.com/callback',
        'https://advisor.example.com/oauth/redirect'
    ],
    ARRAY['accounts:read', 'transactions:read', 'balances:read', 'profile:read'],
    'active',
    'Comprehensive financial advisory platform'
);

-- Suspended client (for testing)
INSERT INTO oauth_clients (
    client_id,
    client_secret_hash,
    name,
    redirect_uris,
    allowed_scopes,
    status,
    description
) VALUES (
    'suspended-client',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIeWPyS4bO',
    'Suspended Test Client',
    ARRAY['https://suspended.example.com/callback'],
    ARRAY['accounts:read'],
    'suspended',
    'Client suspended for testing purposes'
);

-- Made with Bob
