-- Create accounts table
-- This table stores customer bank accounts for the staging banking system

CREATE TABLE IF NOT EXISTS accounts (
    account_id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50) NOT NULL,
    account_type VARCHAR(50) NOT NULL CHECK (account_type IN ('checking', 'savings', 'credit', 'investment')),
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN',
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    available_balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    account_number VARCHAR(50) UNIQUE NOT NULL,
    iban VARCHAR(50),
    swift_code VARCHAR(11),
    branch_code VARCHAR(20),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed', 'frozen')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_accounts_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_customer_id ON accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts(currency);

-- Add comments to table
COMMENT ON TABLE accounts IS 'Staging bank account data for Open Banking MVP demo';
COMMENT ON COLUMN accounts.account_id IS 'Unique account identifier (e.g., ACC-001)';
COMMENT ON COLUMN accounts.account_type IS 'Type of account: checking, savings, credit, or investment';
COMMENT ON COLUMN accounts.currency IS 'ISO 4217 currency code (default: PEN for Peruvian Sol)';
COMMENT ON COLUMN accounts.balance IS 'Current account balance';
COMMENT ON COLUMN accounts.available_balance IS 'Available balance (excluding holds/pending transactions)';
COMMENT ON COLUMN accounts.status IS 'Account status: active, inactive, closed, or frozen';

-- Made with Bob
