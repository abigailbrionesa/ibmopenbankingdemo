/**
 * OAuth Middleware
 * Validates OAuth access tokens and enforces scope requirements
 */

const { verifyAccessToken } = require('../../auth/oauth/token-exchange');
const { validateConsent, requireConsentScope } = require('./consent-validation');

/**
 * Extract Bearer token from Authorization header
 * 
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null
 */
function extractBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.substring(7);
}

/**
 * Middleware to require OAuth authentication
 * Validates access token and attaches token payload to request
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
async function requireOAuthToken(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = extractBearerToken(authHeader);
    
    if (!token) {
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Bearer token required'
      });
    }
    
    // Verify token
    const verification = await verifyAccessToken(token);
    
    if (!verification.valid) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: verification.error_description || 'Invalid or expired token'
      });
    }
    
    // Attach token payload and metadata to request
    req.oauth_token = verification.payload;
    req.token_metadata = verification.token;
    
    next();
  } catch (error) {
    console.error('OAuth middleware error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to validate token'
    });
  }
}

/**
 * Middleware to require specific OAuth scope
 * Must be used after requireOAuthToken
 * 
 * @param {string} requiredScope - Required scope (e.g., 'accounts:read')
 * @returns {Function} Express middleware
 */
function requireScope(requiredScope) {
  return (req, res, next) => {
    if (!req.oauth_token) {
      return res.status(500).json({
        error: 'server_error',
        error_description: 'OAuth middleware not applied'
      });
    }
    
    const tokenScopes = req.oauth_token.scope ? req.oauth_token.scope.split(' ') : [];
    
    if (!tokenScopes.includes(requiredScope)) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `This resource requires '${requiredScope}' scope`,
        required_scope: requiredScope,
        granted_scopes: tokenScopes
      });
    }
    
    next();
  };
}

/**
 * Middleware to require any of multiple scopes
 * Must be used after requireOAuthToken
 * 
 * @param {string[]} requiredScopes - Array of acceptable scopes
 * @returns {Function} Express middleware
 */
function requireAnyScope(requiredScopes) {
  return (req, res, next) => {
    if (!req.oauth_token) {
      return res.status(500).json({
        error: 'server_error',
        error_description: 'OAuth middleware not applied'
      });
    }
    
    const tokenScopes = req.oauth_token.scope ? req.oauth_token.scope.split(' ') : [];
    const hasRequiredScope = requiredScopes.some(scope => tokenScopes.includes(scope));
    
    if (!hasRequiredScope) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `This resource requires one of: ${requiredScopes.join(', ')}`,
        required_scopes: requiredScopes,
        granted_scopes: tokenScopes
      });
    }
    
    next();
  };
}

/**
 * Complete OAuth protection middleware chain
 * Validates token, consent status, and required scope
 * 
 * @param {string} requiredScope - Required scope
 * @returns {Function[]} Array of middleware functions
 */
function protectWithScope(requiredScope) {
  return [
    requireOAuthToken,
    validateConsent,
    requireScope(requiredScope)
  ];
}

/**
 * Complete OAuth protection with multiple acceptable scopes
 * 
 * @param {string[]} requiredScopes - Array of acceptable scopes
 * @returns {Function[]} Array of middleware functions
 */
function protectWithAnyScope(requiredScopes) {
  return [
    requireOAuthToken,
    validateConsent,
    requireAnyScope(requiredScopes)
  ];
}

/**
 * Middleware to log API access for auditing
 * Should be used after OAuth middleware
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function logApiAccess(req, res, next) {
  if (req.oauth_token) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      customer_id: req.oauth_token.customer_id,
      client_id: req.oauth_token.client_id,
      consent_id: req.oauth_token.consent_id,
      scopes: req.oauth_token.scope,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent']
    };
    
    // In production, send to logging service
    console.log('API Access:', JSON.stringify(logEntry));
  }
  
  next();
}

/**
 * Error handler for OAuth-protected routes
 * Provides consistent error responses
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function oauthErrorHandler(err, req, res, next) {
  console.error('OAuth route error:', err);
  
  // Check if response already sent
  if (res.headersSent) {
    return next(err);
  }
  
  // Handle specific error types
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: err.message
    });
  }
  
  if (err.name === 'ForbiddenError') {
    return res.status(403).json({
      error: 'forbidden',
      error_description: err.message
    });
  }
  
  // Generic error response
  res.status(500).json({
    error: 'server_error',
    error_description: 'An unexpected error occurred'
  });
}

module.exports = {
  requireOAuthToken,
  requireScope,
  requireAnyScope,
  protectWithScope,
  protectWithAnyScope,
  logApiAccess,
  oauthErrorHandler,
  extractBearerToken
};

// Made with Bob
