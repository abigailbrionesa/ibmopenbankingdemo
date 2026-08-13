-- Seed customer data for Open Banking MVP demo
-- Demo customer: Maria Garcia (CUST-001)

INSERT INTO customers (
    customer_id,
    name,
    email,
    phone,
    date_of_birth,
    address,
    city,
    country,
    postal_code,
    status
) VALUES (
    'CUST-001',
    'Maria Garcia',
    'maria.garcia@example.com',
    '+51-1-234-5678',
    '1985-03-15',
    'Av. Javier Prado Este 4200',
    'Lima',
    'Peru',
    '15023',
    'active'
);

-- Additional demo customers for testing
INSERT INTO customers (
    customer_id,
    name,
    email,
    phone,
    date_of_birth,
    address,
    city,
    country,
    postal_code,
    status
) VALUES 
(
    'CUST-002',
    'Carlos Rodriguez',
    'carlos.rodriguez@example.com',
    '+51-1-234-5679',
    '1990-07-22',
    'Av. Arequipa 2850',
    'Lima',
    'Peru',
    '15047',
    'active'
),
(
    'CUST-003',
    'Ana Martinez',
    'ana.martinez@example.com',
    '+51-1-234-5680',
    '1988-11-08',
    'Calle Las Begonias 475',
    'Lima',
    'Peru',
    '15036',
    'active'
);

-- Made with Bob
