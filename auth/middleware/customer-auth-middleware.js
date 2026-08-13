/**
 * Customer Authentication Middleware
 * Enforces customer authentication before consent approval
 * 
 * This middleware ensures the authentication boundary is maintained:
 * - Customers must authenticate before seeing consent requests
 * - Fintech OAuth credentials do NOT authenticate customers
 * - Customer identity and fintech identity are separate
 */

const { verifyCustomerSession } = require('../customer-authentication');

/**
 * Middleware to require customer authentication
 * Blocks unauthenticated requests to protected resources
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function requireCustomerAuth(req, res, next) {
  // Extract session token from cookie or header
  const sessionToken = req.cookies?.customer_session || 
                      req.headers['x-customer-session'];
  
  if (!sessionToken) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Customer must be authenticated to access this resource',
      redirect_to: '/auth/login'
    });
  }
  
  // Verify session
  const verification = await verifyCustomerSession(sessionToken);
  
  if (!verification.valid) {
    return res.status(401).json({
      error: 'Invalid or expired session',
      message: verification.error,
      redirect_to: '/auth/login'
    });
  }
  
  // Attach customer info to request
  req.customer = {
    customer_id: verification.customer_id,
    customer_name: verification.customer_name,
    customer_email: verification.customer_email,
    session_id: verification.session_id,
    authentication_method: verification.authentication_method
  };
  
  next();
}

/**
 * Middleware to require customer authentication for OAuth authorization
 * Specifically for the OAuth authorization endpoint
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function requireCustomerAuthForAuthorization(req, res, next) {
  // Extract session token
  const sessionToken = req.cookies?.customer_session || 
                      req.headers['x-customer-session'];
  
  if (!sessionToken) {
    // Redirect to login with return URL
    const returnUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/login?return_to=${returnUrl}`);
  }
  
  // Verify session
  const verification = await verifyCustomerSession(sessionToken);
  
  if (!verification.valid) {
    // Redirect to login with return URL
    const returnUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/login?return_to=${returnUrl}&error=session_expired`);
  }
  
  // Attach customer info to request
  req.customer = {
    customer_id: verification.customer_id,
    customer_name: verification.customer_name,
    customer_email: verification.customer_email,
    session_id: verification.session_id,
    authentication_method: verification.authentication_method
  };
  
  // Store authorization context
  req.authorizationContext = {
    customer_authenticated: true,
    customer_id: verification.customer_id,
    authentication_method: verification.authentication_method,
    authenticated_at: new Date().toISOString()
  };
  
  next();
}

/**
 * Middleware to prevent OAuth client credentials from authenticating customers
 * Enforces the separation between fintech identity and customer identity
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function preventOAuthClientAuth(req, res, next) {
  // Check if request is trying to use OAuth credentials for customer auth
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Basic ')) {
    // This looks like OAuth client credentials
    return res.status(403).json({
      error: 'Invalid authentication method',
      message: 'OAuth client credentials cannot be used for customer authentication',
      reason: 'Fintech identity and customer identity are separate security domains',
      required_action: 'Use customer login endpoint instead'
    });
  }
  
  // Check for client_id/client_secret in body or query
  if (req.body?.client_id || req.query?.client_id ||
      req.body?.client_secret || req.query?.client_secret) {
    return res.status(403).json({
      error: 'Invalid authentication method',
      message: 'OAuth client credentials cannot be used for customer authentication',
      reason: 'Fintech identity and customer identity are separate security domains',
      required_action: 'Use customer login endpoint instead'
    });
  }
  
  next();
}

/**
 * Middleware to check if customer is authenticated (non-blocking)
 * Adds customer info to request if authenticated, but doesn't block
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function checkCustomerAuth(req, res, next) {
  const sessionToken = req.cookies?.customer_session || 
                      req.headers['x-customer-session'];
  
  if (sessionToken) {
    const verification = await verifyCustomerSession(sessionToken);
    
    if (verification.valid) {
      req.customer = {
        customer_id: verification.customer_id,
        customer_name: verification.customer_name,
        customer_email: verification.customer_email,
        session_id: verification.session_id,
        authentication_method: verification.authentication_method
      };
    }
  }
  
  next();
}

/**
 * Middleware to validate authorization request has customer authentication
 * Used to ensure authorization requests cannot skip customer authentication
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function validateAuthorizationContext(req, res, next) {
  if (!req.authorizationContext || !req.authorizationContext.customer_authenticated) {
    return res.status(403).json({
      error: 'Authorization context invalid',
      message: 'Customer authentication required before authorization',
      oauth_error: 'access_denied',
      oauth_error_description: 'Customer must authenticate before granting consent'
    });
  }
  
  // Verify customer ID matches
  if (req.customer && req.customer.customer_id !== req.authorizationContext.customer_id) {
    return res.status(403).json({
      error: 'Authorization context mismatch',
      message: 'Customer identity mismatch',
      oauth_error: 'access_denied'
    });
  }
  
  next();
}

module.exports = {
  requireCustomerAuth,
  requireCustomerAuthForAuthorization,
  preventOAuthClientAuth,
  checkCustomerAuth,
  validateAuthorizationContext
};

// Made with Bob
