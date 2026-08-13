-- Create customer authentication sessions table
-- This table stores customer authentication sessions for the consent flow

CREATE TABLE IF NOT EXISTS customer_sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    customer_id VARCHAR(50) NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    authentication_method VARCHAR(50) DEFAULT 'demo',
    CONSTRAINT fk_customer_sessions_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer_id ON customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expires_at ON customer_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_active ON customer_sessions(is_active) WHERE is_active = true;

-- Add comments to table
COMMENT ON TABLE customer_sessions IS 'Customer authentication sessions for Open Banking consent flow';
COMMENT ON COLUMN customer_sessions.session_id IS 'Unique session identifier';
COMMENT ON COLUMN customer_sessions.customer_id IS 'Customer who owns this session';
COMMENT ON COLUMN customer_sessions.session_token IS 'Secure session token for authentication';
COMMENT ON COLUMN customer_sessions.expires_at IS 'Session expiration timestamp';
COMMENT ON COLUMN customer_sessions.is_active IS 'Whether session is currently active';
COMMENT ON COLUMN customer_sessions.authentication_method IS 'Authentication method used (demo, sca, etc.)';

-- Create function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    UPDATE customer_sessions
    SET is_active = false
    WHERE expires_at < CURRENT_TIMESTAMP AND is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Add comment to function
COMMENT ON FUNCTION cleanup_expired_sessions() IS 'Deactivates expired customer sessions';

-- Made with Bob
