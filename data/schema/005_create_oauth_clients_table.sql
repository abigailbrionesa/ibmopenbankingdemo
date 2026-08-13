-- Create OAuth clients table
-- This table stores registered OAuth client applications for Open Banking API access

CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id VARCHAR(255) PRIMARY KEY,
    client_secret_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    redirect_uris TEXT[] NOT NULL,
    allowed_scopes TEXT[] NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
    grant_types TEXT[] DEFAULT ARRAY['authorization_code', 'refresh_token'],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    last_used_at TIMESTAMP WITH TIME ZONE,
    description TEXT,
    contact_email VARCHAR(255),
    website_url VARCHAR(500)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_oauth_clients_status ON oauth_clients(status);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_created_at ON oauth_clients(created_at DESC);

-- Add comments to table
COMMENT ON TABLE oauth_clients IS 'Registered OAuth client applications for Open Banking API access';
COMMENT ON COLUMN oauth_clients.client_id IS 'Unique client identifier (e.g., fintech-demo-client)';
COMMENT ON COLUMN oauth_clients.client_secret_hash IS 'Bcrypt hash of the client secret (never store plaintext)';
COMMENT ON COLUMN oauth_clients.name IS 'Human-readable application name';
COMMENT ON COLUMN oauth_clients.redirect_uris IS 'Array of allowed redirect URIs for OAuth callbacks';
COMMENT ON COLUMN oauth_clients.allowed_scopes IS 'Array of scopes this client is permitted to request';
COMMENT ON COLUMN oauth_clients.status IS 'Client status: active, suspended, or revoked';
COMMENT ON COLUMN oauth_clients.grant_types IS 'OAuth grant types allowed for this client';

-- Made with Bob
