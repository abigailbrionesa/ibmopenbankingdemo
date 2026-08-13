-- Access Tokens Table
-- Stores OAuth 2.0 access tokens and refresh tokens

CREATE TABLE IF NOT EXISTS access_tokens (
  -- Primary identifier
  token_id VARCHAR(255) PRIMARY KEY,
  
  -- Token value (hashed for security)
  access_token_hash VARCHAR(255) NOT NULL UNIQUE,
  
  -- Refresh token (hashed)
  refresh_token_hash VARCHAR(255) UNIQUE,
  
  -- Token type
  token_type VARCHAR(20) NOT NULL DEFAULT 'Bearer',
  
  -- Parties involved
  customer_id VARCHAR(50) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  
  -- Linked consent
  consent_id VARCHAR(255) NOT NULL,
  
  -- Scopes granted
  scope TEXT NOT NULL,
  
  -- Expiration
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  refresh_expires_at TIMESTAMP,
  
  -- Revocation
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP,
  
  -- Usage tracking
  last_used_at TIMESTAMP,
  use_count INTEGER DEFAULT 0,
  
  -- Metadata
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  -- Foreign key constraints
  CONSTRAINT fk_token_customer FOREIGN KEY (customer_id) 
    REFERENCES customers(customer_id) ON DELETE CASCADE,
  CONSTRAINT fk_token_client FOREIGN KEY (client_id) 
    REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  CONSTRAINT fk_token_consent FOREIGN KEY (consent_id) 
    REFERENCES consents(consent_id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX idx_tokens_customer ON access_tokens(customer_id);
CREATE INDEX idx_tokens_client ON access_tokens(client_id);
CREATE INDEX idx_tokens_consent ON access_tokens(consent_id);
CREATE INDEX idx_tokens_expires_at ON access_tokens(expires_at);
CREATE INDEX idx_tokens_access_hash ON access_tokens(access_token_hash);
CREATE INDEX idx_tokens_refresh_hash ON access_tokens(refresh_token_hash);

-- Index for finding active tokens
CREATE INDEX idx_tokens_active ON access_tokens(customer_id, client_id) 
  WHERE revoked = FALSE AND expires_at > CURRENT_TIMESTAMP;

-- Comments for documentation
COMMENT ON TABLE access_tokens IS 'OAuth 2.0 access tokens and refresh tokens';
COMMENT ON COLUMN access_tokens.token_id IS 'Unique identifier with token_ prefix';
COMMENT ON COLUMN access_tokens.access_token_hash IS 'SHA-256 hash of the access token';
COMMENT ON COLUMN access_tokens.refresh_token_hash IS 'SHA-256 hash of the refresh token';
COMMENT ON COLUMN access_tokens.consent_id IS 'Reference to the approved consent';
COMMENT ON COLUMN access_tokens.expires_at IS 'When the access token expires (typically 1 hour)';
COMMENT ON COLUMN access_tokens.refresh_expires_at IS 'When the refresh token expires (typically 30 days)';
COMMENT ON COLUMN access_tokens.revoked IS 'Whether the token has been revoked';
COMMENT ON COLUMN access_tokens.use_count IS 'Number of times the token has been used';

-- Made with Bob
