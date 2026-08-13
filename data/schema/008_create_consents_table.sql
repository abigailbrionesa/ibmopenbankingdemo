-- Consent Records Table
-- Stores granular customer consent for fintech application access

CREATE TABLE IF NOT EXISTS consents (
  -- Primary identifier
  consent_id VARCHAR(255) PRIMARY KEY,
  
  -- Parties involved
  customer_id VARCHAR(50) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  
  -- Consent details
  purpose TEXT NOT NULL,
  requested_scopes TEXT NOT NULL, -- Space-separated list of scopes
  granted_scopes TEXT, -- Actual granted scopes (may be subset of requested)
  
  -- Approval state
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, denied, revoked, expired
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP,
  denied_at TIMESTAMP,
  revoked_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  
  -- Revocation details
  revocation_reason TEXT,
  revoked_by VARCHAR(50), -- customer_id or system identifier
  
  -- Metadata
  ip_address VARCHAR(45), -- IPv4 or IPv6
  user_agent TEXT,
  
  -- Foreign key constraints
  CONSTRAINT fk_consent_customer FOREIGN KEY (customer_id) 
    REFERENCES customers(customer_id) ON DELETE CASCADE,
  CONSTRAINT fk_consent_client FOREIGN KEY (client_id) 
    REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  
  -- Check constraints
  CONSTRAINT chk_consent_status CHECK (
    status IN ('pending', 'approved', 'denied', 'revoked', 'expired')
  )
);

-- Indexes for efficient queries
CREATE INDEX idx_consents_customer ON consents(customer_id);
CREATE INDEX idx_consents_client ON consents(client_id);
CREATE INDEX idx_consents_status ON consents(status);
CREATE INDEX idx_consents_expires_at ON consents(expires_at);
CREATE INDEX idx_consents_customer_client ON consents(customer_id, client_id);

-- Index for finding active consents
CREATE INDEX idx_consents_active ON consents(customer_id, client_id, status) 
  WHERE status = 'approved' AND expires_at > CURRENT_TIMESTAMP;

-- Comments for documentation
COMMENT ON TABLE consents IS 'Stores customer consent records for OAuth client access';
COMMENT ON COLUMN consents.consent_id IS 'Unique identifier with consent_ prefix';
COMMENT ON COLUMN consents.purpose IS 'Human-readable purpose for data access';
COMMENT ON COLUMN consents.requested_scopes IS 'Scopes requested by the client';
COMMENT ON COLUMN consents.granted_scopes IS 'Scopes actually granted by customer (may be subset)';
COMMENT ON COLUMN consents.status IS 'Current state: pending, approved, denied, revoked, expired';
COMMENT ON COLUMN consents.expires_at IS 'When this consent expires (typically 90 days from approval)';
COMMENT ON COLUMN consents.revocation_reason IS 'Why consent was revoked (if applicable)';
COMMENT ON COLUMN consents.revoked_by IS 'Who revoked the consent (customer or system)';

-- Made with Bob
