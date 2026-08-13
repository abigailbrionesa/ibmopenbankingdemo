/**
 * Complete Authorization Middleware
 * Enforces the full authorization rule: valid token + correct scope + active consent
 * 
 * This module provides a unified middleware chain that validates:
 * 1. Token is valid and active (via introspection)
 * 2. Token has required scope for endpoint
 * 3. Consent is active and approved
 * 4. Consent belongs to customer, client, and includes required scope
 */

const { gatewayTokenIntrospection } = require('./token-introspection');
const { validateConsent, requireConsentScope } = require('./consent-validation');
const { enforceEndpointScopes, requireEndpointScope } = require('./scope-enforcement');
const { auditAllowedRequest } = require('./audit-logger');
const { rateLimitMiddleware } = require('./rate-limiter');

/**
 * Complete authorization middleware chain
 * Applies all authorization checks in the correct order
 * 
 * Order of execution:
 * 1. Token introspection - validates token is active
 * 2. Consent validation - validates consent is approved and active
 * 3. Scope enforcement - validates token has required scope
 * 
 * @returns {Function[]} Array of middleware functions
 */
function completeAuthorization() {
  return [
    gatewayTokenIntrospection,  // Step 1: Validate token
    rateLimitMiddleware,         // Step 2: Check rate limit
    validateConsent,             // Step 3: Validate consent
    enforceEndpointScopes,       // Step 4: Validate scope
    auditAllowedRequest          // Step 5: Log allowed request
  ];
}

/**
 * Complete authorization with explicit scope requirement
 * Use when you want to specify the required scope explicitly
 * 
 * @param {string|string[]} requiredScopes - Required scope(s)
 * @returns {Function[]} Array of middleware functions
 */
function completeAuthorizationWithScope(requiredScopes) {
  return [
    gatewayTokenIntrospection,           // Step 1: Validate token
    rateLimitMiddleware,                  // Step 2: Check rate limit
    validateConsent,                      // Step 3: Validate consent
    requireEndpointScope(requiredScopes), // Step 4: Validate specific scope
    requireConsentScope(Array.isArray(requiredScopes) ? requiredScopes[0] : requiredScopes), // Step 5: Validate consent has scope
    auditAllowedRequest                   // Step 6: Log allowed request
  ];
}

/**
 * Validate complete authorization context
 * Utility function to check if request has passed all authorization checks
 * 
 * @param {Object} req - Express request
 * @returns {Object} Validation result
 */
function validateAuthorizationContext(req) {
  const result = {
    valid: true,
    checks: {
      token: false,
      introspection: false,
      consent: false,
      scope: false
    },
    errors: []
  };
  
  // Check token
  if (!req.oauth_token) {
    result.valid = false;
    result.errors.push('Missing OAuth token');
  } else {
    result.checks.token = true;
  }
  
  // Check introspection
  if (!req.token_introspection) {
    result.valid = false;
    result.errors.push('Missing token introspection');
  } else {
    result.checks.introspection = true;
  }
  
  // Check consent
  if (!req.consent) {
    result.valid = false;
    result.errors.push('Missing consent validation');
  } else {
    result.checks.consent = true;
  }
  
  // Check scope (at least token should have scope)
  if (!req.oauth_token || !req.oauth_token.scope) {
    result.valid = false;
    result.errors.push('Missing scope information');
  } else {
    result.checks.scope = true;
  }
  
  return result;
}

/**
 * Middleware to attach authorization summary to request
 * Useful for logging and debugging
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function attachAuthorizationSummary(req, res, next) {
  if (req.oauth_token && req.consent) {
    req.authorization_summary = {
      customer_id: req.oauth_token.customer_id,
      client_id: req.oauth_token.client_id,
      consent_id: req.oauth_token.consent_id,
      token_scopes: req.oauth_token.scope ? req.oauth_token.scope.split(' ') : [],
      consent_scopes: req.consent.granted_scopes ? req.consent.granted_scopes.split(' ') : [],
      consent_status: req.consent.status,
      consent_expires_at: req.consent.expires_at,
      authorized_at: new Date().toISOString()
    };
  }
  
  next();
}

/**
 * Log successful authorization
 * Should be used after complete authorization chain
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function logAuthorization(req, res, next) {
  if (req.authorization_summary) {
    const logEntry = {
      event: 'authorization_success',
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      customer_id: req.authorization_summary.customer_id,
      client_id: req.authorization_summary.client_id,
      consent_id: req.authorization_summary.consent_id,
      scopes: req.authorization_summary.token_scopes,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent']
    };
    
    // In production, send to audit log
    console.log('Authorization Success:', JSON.stringify(logEntry));
  }
  
  next();
}

/**
 * Complete authorization with logging
 * Includes authorization summary and success logging
 * 
 * @returns {Function[]} Array of middleware functions
 */
function completeAuthorizationWithLogging() {
  return [
    gatewayTokenIntrospection,
    rateLimitMiddleware,
    validateConsent,
    enforceEndpointScopes,
    attachAuthorizationSummary,
    logAuthorization,
    auditAllowedRequest  // Add audit logging for allowed requests
  ];
}

/**
 * Verify authorization requirements are met
 * Throws error if any requirement is missing
 * 
 * @param {Object} req - Express request
 * @throws {Error} If authorization requirements not met
 */
function verifyAuthorizationRequirements(req) {
  const validation = validateAuthorizationContext(req);
  
  if (!validation.valid) {
    const error = new Error('Authorization requirements not met');
    error.name = 'AuthorizationError';
    error.details = validation;
    throw error;
  }
}

/**
 * Get authorization details from request
 * Returns structured authorization information
 * 
 * @param {Object} req - Express request
 * @returns {Object|null} Authorization details or null
 */
function getAuthorizationDetails(req) {
  if (!req.oauth_token || !req.consent) {
    return null;
  }
  
  return {
    customer_id: req.oauth_token.customer_id,
    client_id: req.oauth_token.client_id,
    consent_id: req.oauth_token.consent_id,
    token_id: req.oauth_token.token_id,
    token_scopes: req.oauth_token.scope ? req.oauth_token.scope.split(' ') : [],
    consent_scopes: req.consent.granted_scopes ? req.consent.granted_scopes.split(' ') : [],
    consent_status: req.consent.status,
    consent_expires_at: req.consent.expires_at,
    token_active: req.token_introspection ? req.token_introspection.active : false
  };
}

/**
 * Middleware to require specific authorization level
 * Validates that all authorization checks have been performed
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function requireCompleteAuthorization(req, res, next) {
  try {
    verifyAuthorizationRequirements(req);
    next();
  } catch (error) {
    console.error('Authorization verification failed:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Authorization verification failed',
      details: error.details
    });
  }
}

/**
 * Create custom authorization chain
 * Allows building custom middleware chains with specific requirements
 * 
 * @param {Object} options - Authorization options
 * @param {boolean} options.requireToken - Require token validation (default: true)
 * @param {boolean} options.requireConsent - Require consent validation (default: true)
 * @param {boolean} options.requireScope - Require scope enforcement (default: true)
 * @param {string|string[]} options.explicitScope - Explicit scope requirement
 * @param {boolean} options.logging - Enable authorization logging (default: false)
 * @returns {Function[]} Array of middleware functions
 */
function createAuthorizationChain(options = {}) {
  const {
    requireToken = true,
    requireRateLimit = true,
    requireConsent = true,
    requireScope = true,
    explicitScope = null,
    logging = false
  } = options;
  
  const chain = [];
  
  if (requireToken) {
    chain.push(gatewayTokenIntrospection);
  }
  
  if (requireRateLimit) {
    chain.push(rateLimitMiddleware);
  }
  
  if (requireConsent) {
    chain.push(validateConsent);
  }
  
  if (requireScope) {
    if (explicitScope) {
      chain.push(requireEndpointScope(explicitScope));
      // Also validate consent has the scope
      const scopeToCheck = Array.isArray(explicitScope) ? explicitScope[0] : explicitScope;
      chain.push(requireConsentScope(scopeToCheck));
    } else {
      chain.push(enforceEndpointScopes);
    }
  }
  
  if (logging) {
    chain.push(attachAuthorizationSummary);
    chain.push(logAuthorization);
  }
  
  // Always add audit logging at the end
  chain.push(auditAllowedRequest);
  
  return chain;
}

module.exports = {
  completeAuthorization,
  completeAuthorizationWithScope,
  completeAuthorizationWithLogging,
  validateAuthorizationContext,
  attachAuthorizationSummary,
  logAuthorization,
  verifyAuthorizationRequirements,
  getAuthorizationDetails,
  requireCompleteAuthorization,
  createAuthorizationChain
};

// Made with Bob
