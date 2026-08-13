/**
 * Gateway Scope Enforcement
 * Maps OAuth scopes to API endpoints and enforces access control
 */

/**
 * Scope definitions for Open Banking API
 */
const SCOPES = {
  ACCOUNTS_READ: 'accounts:read',
  TRANSACTIONS_READ: 'transactions:read',
  BALANCES_READ: 'balances:read',
  PROFILE_READ: 'profile:read'
};

/**
 * Endpoint to scope mapping
 * Defines which scopes are required for each API endpoint
 */
const ENDPOINT_SCOPE_MAP = {
  // Account endpoints - require accounts:read
  'GET /api/v1/accounts': [SCOPES.ACCOUNTS_READ],
  'GET /api/v1/accounts/:account_id': [SCOPES.ACCOUNTS_READ],
  
  // Balance endpoint - requires balances:read (or accounts:read as fallback)
  'GET /api/v1/accounts/:account_id/balance': [SCOPES.BALANCES_READ, SCOPES.ACCOUNTS_READ],
  
  // Transaction endpoints - require transactions:read
  'GET /api/v1/accounts/:account_id/transactions': [SCOPES.TRANSACTIONS_READ],
  
  // Profile endpoint - requires profile:read
  'GET /api/v1/profile': [SCOPES.PROFILE_READ]
};

/**
 * Normalize endpoint path by replacing route parameters with :param
 * 
 * @param {string} path - Request path
 * @returns {string} Normalized path
 */
function normalizeEndpointPath(path) {
  // Replace UUIDs and numeric IDs with :account_id, :transaction_id, etc.
  return path
    .replace(/\/[a-f0-9-]{36}/gi, '/:account_id') // UUID format
    .replace(/\/acc-[a-zA-Z0-9]+/g, '/:account_id') // acc-xxx format
    .replace(/\/txn-[a-zA-Z0-9]+/g, '/:transaction_id') // txn-xxx format
    .replace(/\/\d+/g, '/:id'); // Numeric IDs
}

/**
 * Get required scopes for an endpoint
 * 
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - Request path
 * @returns {string[]|null} Required scopes or null if endpoint not found
 */
function getRequiredScopes(method, path) {
  const normalizedPath = normalizeEndpointPath(path);
  const endpointKey = `${method.toUpperCase()} ${normalizedPath}`;
  
  return ENDPOINT_SCOPE_MAP[endpointKey] || null;
}

/**
 * Check if token has any of the required scopes
 * 
 * @param {string[]} tokenScopes - Scopes granted to token
 * @param {string[]} requiredScopes - Scopes required for endpoint
 * @returns {boolean} True if token has at least one required scope
 */
function hasRequiredScope(tokenScopes, requiredScopes) {
  if (!requiredScopes || requiredScopes.length === 0) {
    return true; // No scope required
  }
  
  return requiredScopes.some(scope => tokenScopes.includes(scope));
}

/**
 * Log authorization denial event
 * 
 * @param {Object} details - Denial details
 */
function logAuthorizationDenial(details) {
  const logEntry = {
    event: 'authorization_denied',
    timestamp: new Date().toISOString(),
    method: details.method,
    path: details.path,
    customer_id: details.customer_id,
    client_id: details.client_id,
    consent_id: details.consent_id,
    granted_scopes: details.granted_scopes,
    required_scopes: details.required_scopes,
    ip_address: details.ip_address,
    user_agent: details.user_agent,
    reason: 'insufficient_scope'
  };
  
  // In production, send to security monitoring/SIEM
  console.warn('Authorization Denied:', JSON.stringify(logEntry));
}

/**
 * Middleware to enforce endpoint-specific scope requirements
 * Must be used after OAuth token validation
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function enforceEndpointScopes(req, res, next) {
  try {
    // Ensure OAuth token is present
    if (!req.oauth_token) {
      return res.status(500).json({
        error: 'server_error',
        error_description: 'OAuth middleware not applied before scope enforcement'
      });
    }
    
    // Get required scopes for this endpoint
    const requiredScopes = getRequiredScopes(req.method, req.path);
    
    // If endpoint not in map, allow (no scope requirement)
    if (!requiredScopes) {
      return next();
    }
    
    // Parse token scopes
    const tokenScopes = req.oauth_token.scope ? req.oauth_token.scope.split(' ') : [];
    
    // Check if token has required scope
    if (!hasRequiredScope(tokenScopes, requiredScopes)) {
      // Log denial event
      logAuthorizationDenial({
        method: req.method,
        path: req.path,
        customer_id: req.oauth_token.customer_id,
        client_id: req.oauth_token.client_id,
        consent_id: req.oauth_token.consent_id,
        granted_scopes: tokenScopes,
        required_scopes: requiredScopes,
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.headers['user-agent']
      });
      
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `This endpoint requires one of the following scopes: ${requiredScopes.join(', ')}`,
        required_scopes: requiredScopes,
        granted_scopes: tokenScopes
      });
    }
    
    // Scope check passed
    next();
    
  } catch (error) {
    console.error('Scope enforcement error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to enforce scope requirements'
    });
  }
}

/**
 * Middleware factory to enforce specific scope for an endpoint
 * Alternative to automatic endpoint mapping
 * 
 * @param {string|string[]} requiredScopes - Required scope(s)
 * @returns {Function} Express middleware
 */
function requireEndpointScope(requiredScopes) {
  const scopes = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];
  
  return (req, res, next) => {
    if (!req.oauth_token) {
      return res.status(500).json({
        error: 'server_error',
        error_description: 'OAuth middleware not applied'
      });
    }
    
    const tokenScopes = req.oauth_token.scope ? req.oauth_token.scope.split(' ') : [];
    
    if (!hasRequiredScope(tokenScopes, scopes)) {
      // Log denial
      logAuthorizationDenial({
        method: req.method,
        path: req.path,
        customer_id: req.oauth_token.customer_id,
        client_id: req.oauth_token.client_id,
        consent_id: req.oauth_token.consent_id,
        granted_scopes: tokenScopes,
        required_scopes: scopes,
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.headers['user-agent']
      });
      
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `This endpoint requires one of: ${scopes.join(', ')}`,
        required_scopes: scopes,
        granted_scopes: tokenScopes
      });
    }
    
    next();
  };
}

/**
 * Add scope mapping for custom endpoint
 * Useful for dynamically registered endpoints
 * 
 * @param {string} method - HTTP method
 * @param {string} path - Endpoint path
 * @param {string[]} scopes - Required scopes
 */
function addEndpointScopeMapping(method, path, scopes) {
  const endpointKey = `${method.toUpperCase()} ${path}`;
  ENDPOINT_SCOPE_MAP[endpointKey] = scopes;
}

/**
 * Get all endpoint scope mappings
 * Useful for documentation and testing
 * 
 * @returns {Object} Endpoint scope map
 */
function getEndpointScopeMappings() {
  return { ...ENDPOINT_SCOPE_MAP };
}

/**
 * Validate scope format
 * 
 * @param {string} scope - Scope to validate
 * @returns {boolean} True if valid
 */
function isValidScope(scope) {
  // Scope format: resource:action (e.g., accounts:read)
  const scopeRegex = /^[a-z]+:[a-z]+$/;
  return scopeRegex.test(scope);
}

/**
 * Parse scope string into array
 * 
 * @param {string} scopeString - Space-separated scopes
 * @returns {string[]} Array of scopes
 */
function parseScopes(scopeString) {
  if (!scopeString || typeof scopeString !== 'string') {
    return [];
  }
  
  return scopeString.split(' ').filter(s => s.trim() !== '');
}

/**
 * Check if scope grants access to resource
 * 
 * @param {string} scope - Scope to check
 * @param {string} resource - Resource name (e.g., 'accounts')
 * @returns {boolean} True if scope grants access
 */
function scopeGrantsAccessTo(scope, resource) {
  const [scopeResource] = scope.split(':');
  return scopeResource === resource;
}

module.exports = {
  SCOPES,
  ENDPOINT_SCOPE_MAP,
  enforceEndpointScopes,
  requireEndpointScope,
  getRequiredScopes,
  hasRequiredScope,
  logAuthorizationDenial,
  addEndpointScopeMapping,
  getEndpointScopeMappings,
  normalizeEndpointPath,
  isValidScope,
  parseScopes,
  scopeGrantsAccessTo
};

// Made with Bob
