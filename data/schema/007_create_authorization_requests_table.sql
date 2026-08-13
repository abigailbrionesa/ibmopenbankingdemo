-- Create authorization requests table
-- This table stores OAuth authorization requests during the consent flow

CREATE TABLE IF NOT EXISTS authorization_requests (
    auth_request_id VARCHAR(255) PRIMARY KEY,
    client_id VARCHAR(255) NOT NULL,
    customer_id VARCHAR(50) NOT NULL,
    redirect_uri TEXT NOT NULL,
    response_type VARCHAR(50) NOT NULL,
    scope TEXT NOT NULL,
    state TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'used')),
    authorization_code VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    used_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_authorization_requests_client FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    CONSTRAINT fk_authorization_requests_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_authorization_requests_client_id ON authorization_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_authorization_requests_customer_id ON authorization_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_authorization_requests_status ON authorization_requests(status);
CREATE INDEX IF NOT EXISTS idx_authorization_requests_expires_at ON authorization_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_authorization_requests_code ON authorization_requests(authorization_code) WHERE authorization_code IS NOT NULL;

-- Add comments to table
COMMENT ON TABLE authorization_requests IS 'OAuth authorization requests during consent flow';
COMMENT ON COLUMN authorization_requests.auth_request_id IS 'Unique authorization request identifier';
COMMENT ON COLUMN authorization_requests.client_id IS 'OAuth client making the request';
COMMENT ON COLUMN authorization_requests.customer_id IS 'Customer who will approve/deny consent';
COMMENT ON COLUMN authorization_requests.redirect_uri IS 'URI to redirect after authorization';
COMMENT ON COLUMN authorization_requests.response_type IS 'OAuth response type (code)';
COMMENT ON COLUMN authorization_requests.scope IS 'Requested OAuth scopes (space-separated)';
COMMENT ON COLUMN authorization_requests.state IS 'CSRF protection state parameter';
COMMENT ON COLUMN authorization_requests.status IS 'Request status: pending, approved, denied, expired, or used';
COMMENT ON COLUMN authorization_requests.authorization_code IS 'Generated authorization code (after approval)';
COMMENT ON COLUMN authorization_requests.expires_at IS 'Request expiration timestamp';

-- Create function to cleanup expired authorization requests
CREATE OR REPLACE FUNCTION cleanup_expired_authorization_requests()
RETURNS void AS $$
BEGIN
    UPDATE authorization_requests
    SET status = 'expired'
    WHERE expires_at < CURRENT_TIMESTAMP 
      AND status = 'pending';
END;
$$ LANGUAGE plpgsql;

-- Add comment to function
COMMENT ON FUNCTION cleanup_expired_authorization_requests() IS 'Marks expired authorization requests';

-- Made with Bob
