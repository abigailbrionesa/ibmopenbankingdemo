-- Audit Logs Table
-- Records all authorization events for protected API requests

CREATE TABLE IF NOT EXISTS audit_logs (
  -- Primary identifier
  audit_id SERIAL PRIMARY KEY,
  
  -- Timestamp
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Request details
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  
  -- Authorization parties
  client_id VARCHAR(255),
  customer_id VARCHAR(50),
  consent_id VARCHAR(255),
  
  -- Scope information
  scope TEXT,
  required_scope TEXT,
  
  -- Authorization outcome
  authorization VARCHAR(20) NOT NULL CHECK (authorization IN ('allowed', 'denied')),
  reason VARCHAR(100),
  
  -- Additional context
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  -- Token information (optional)
  token_id VARCHAR(255),
  
  -- Response status
  http_status INTEGER,
  
  -- Metadata for additional context
  metadata JSONB,
  
  -- Indexes for efficient querying
  CONSTRAINT chk_authorization_reason CHECK (
    (authorization = 'allowed' AND reason IS NULL) OR
    (authorization = 'denied' AND reason IS NOT NULL)
  )
);

-- Indexes for efficient queries
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_customer ON audit_logs(customer_id);
CREATE INDEX idx_audit_client ON audit_logs(client_id);
CREATE INDEX idx_audit_consent ON audit_logs(consent_id);
CREATE INDEX idx_audit_authorization ON audit_logs(authorization);
CREATE INDEX idx_audit_endpoint ON audit_logs(endpoint);
CREATE INDEX idx_audit_reason ON audit_logs(reason) WHERE reason IS NOT NULL;

-- Composite index for common queries
CREATE INDEX idx_audit_customer_timestamp ON audit_logs(customer_id, timestamp DESC);
CREATE INDEX idx_audit_client_timestamp ON audit_logs(client_id, timestamp DESC);
CREATE INDEX idx_audit_denied_events ON audit_logs(authorization, timestamp DESC) 
  WHERE authorization = 'denied';

-- Comments for documentation
COMMENT ON TABLE audit_logs IS 'Audit trail for all protected API authorization events';
COMMENT ON COLUMN audit_logs.audit_id IS 'Unique sequential identifier for audit event';
COMMENT ON COLUMN audit_logs.timestamp IS 'When the authorization event occurred';
COMMENT ON COLUMN audit_logs.endpoint IS 'API endpoint that was accessed';
COMMENT ON COLUMN audit_logs.authorization IS 'Whether access was allowed or denied';
COMMENT ON COLUMN audit_logs.reason IS 'Reason for denial (required when authorization=denied)';
COMMENT ON COLUMN audit_logs.scope IS 'Scopes granted in the token';
COMMENT ON COLUMN audit_logs.required_scope IS 'Scopes required for the endpoint';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context in JSON format';

-- Made with Bob