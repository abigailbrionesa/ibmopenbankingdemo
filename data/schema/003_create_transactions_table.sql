-- Create transactions table
-- This table stores transaction history for bank accounts

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id VARCHAR(50) PRIMARY KEY,
    account_id VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'PEN',
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('debit', 'credit', 'transfer', 'payment', 'withdrawal', 'deposit', 'fee', 'interest')),
    description TEXT NOT NULL,
    merchant_name VARCHAR(255),
    merchant_category VARCHAR(100),
    reference_number VARCHAR(100),
    balance_after DECIMAL(15, 2),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_transactions_account FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
);

-- Create indexes for faster lookups and queries
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_account_timestamp ON transactions(account_id, timestamp DESC);

-- Add comments to table
COMMENT ON TABLE transactions IS 'Staging transaction history for Open Banking MVP demo';
COMMENT ON COLUMN transactions.transaction_id IS 'Unique transaction identifier (e.g., TXN-001)';
COMMENT ON COLUMN transactions.amount IS 'Transaction amount (positive for credits, negative for debits)';
COMMENT ON COLUMN transactions.currency IS 'ISO 4217 currency code (default: PEN for Peruvian Sol)';
COMMENT ON COLUMN transactions.transaction_type IS 'Type of transaction: debit, credit, transfer, payment, withdrawal, deposit, fee, or interest';
COMMENT ON COLUMN transactions.description IS 'Human-readable transaction description';
COMMENT ON COLUMN transactions.balance_after IS 'Account balance after this transaction was applied';
COMMENT ON COLUMN transactions.status IS 'Transaction status: pending, completed, failed, or reversed';

-- Made with Bob
