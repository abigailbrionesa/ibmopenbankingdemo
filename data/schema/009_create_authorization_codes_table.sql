-- Authorization Codes Table
-- Stores single-use authorization codes for OAuth token exchange

CREATE TABLE IF NOT EXISTS authorization_codes (
  -- Primary identifier
  code VARCHAR(255) PRIMARY KEY,
  
  -- Parties involved
  customer_id VARCHAR(50) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  
  -- Authorization details
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  
  -- Linked consent
  consent_id VARCHAR(255) NOT NULL,
  
  -- Code lifecycle
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  used BOOLEAN DEFAULT FALSE,
  
  -- Foreign key constraints
  CONSTRAINT fk_authcode_customer FOREIGN KEY (customer_id) 
    REFERENCES customers(customer_id) ON DELETE CASCADE,
  CONSTRAINT fk_authcode_client FOREIGN KEY (client_id) 
    REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  CONSTRAINT fk_authcode_consent FOREIGN KEY (consent_id) 
    REFERENCES consents(consent_id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX idx_authcodes_customer ON authorization_codes(customer_id);
CREATE INDEX idx_authcodes_client ON authorization_codes(client_id);
CREATE INDEX idx_authcodes_consent ON authorization_codes(consent_id);
CREATE INDEX idx_authcodes_expires_at ON authorization_codes(expires_at);

-- Index for finding unused, non-expired codes
CREATE INDEX idx_authcodes_valid ON authorization_codes(code) 
  WHERE used = FALSE AND expires_at > CURRENT_TIMESTAMP;

-- Comments for documentation
COMMENT ON TABLE authorization_codes IS 'Single-use authorization codes for OAuth token exchange';
COMMENT ON COLUMN authorization_codes.code IS 'Unique authorization code with authcode_ prefix';
COMMENT ON COLUMN authorization_codes.consent_id IS 'Reference to the approved consent';
COMMENT ON COLUMN authorization_codes.used IS 'Whether the code has been exchanged for tokens';
COMMENT ON COLUMN authorization_codes.used_at IS 'When the code was used (if applicable)';

-- Made with Bob
