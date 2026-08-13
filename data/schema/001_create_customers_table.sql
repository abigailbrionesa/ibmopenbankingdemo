-- Create customers table
-- This table stores basic customer information for the staging banking system

CREATE TABLE IF NOT EXISTS customers (
    customer_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    date_of_birth DATE,
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended'))
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- Add comment to table
COMMENT ON TABLE customers IS 'Staging customer data for Open Banking MVP demo';
COMMENT ON COLUMN customers.customer_id IS 'Unique customer identifier (e.g., CUST-001)';
COMMENT ON COLUMN customers.status IS 'Customer account status: active, inactive, or suspended';

-- Made with Bob
