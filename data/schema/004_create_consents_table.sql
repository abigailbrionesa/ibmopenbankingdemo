-- Create consents table
-- This table stores customer consent records for Open Banking data sharing

CREATE TABLE IF NOT EXISTS consents (
    consent_id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50) NOT NULL,
    client_id VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    scopes TEXT[] NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'expired', 'revoked', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    access_count INTEGER DEFAULT 0,
    ip_address VARCHAR(45),
    user_agent TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_consents_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_consents_customer_id ON consents(customer_id);
CREATE INDEX IF NOT EXISTS idx_consents_client_id ON consents(client_id);
CREATE INDEX IF NOT EXISTS idx_consents_status ON consents(status);
CREATE INDEX IF NOT EXISTS idx_consents_expires_at ON consents(expires_at);
CREATE INDEX IF NOT EXISTS idx_consents_customer_client ON consents(customer_id, client_id);

-- Add comments to table
COMMENT ON TABLE consents IS 'Customer consent records for Open Banking data sharing';
COMMENT ON COLUMN consents.consent_id IS 'Unique consent identifier (e.g., CONSENT-001)';
COMMENT ON COLUMN consents.customer_id IS 'Customer who granted the consent';
COMMENT ON COLUMN consents.client_id IS 'OAuth client ID of the third-party application';
COMMENT ON COLUMN consents.purpose IS 'Human-readable description of why consent is requested';
COMMENT ON COLUMN consents.scopes IS 'Array of data scopes granted (e.g., accounts:read, transactions:read)';
COMMENT ON COLUMN consents.status IS 'Consent status: pending, active, expired, revoked, or rejected';
COMMENT ON COLUMN consents.expires_at IS 'Timestamp when consent expires';
COMMENT ON COLUMN consents.revoked_at IS 'Timestamp when consent was revoked by customer';
COMMENT ON COLUMN consents.access_count IS 'Number of times this consent has been used to access data';

-- Made with Bob
