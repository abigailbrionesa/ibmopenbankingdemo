/**
 * Gateway Token Introspection
 * Validates OAuth tokens before forwarding requests to protected APIs
 */

const { verifyAccessToken } = require('../../auth/oauth/token-exchange');
const { logDeniedRequest, DENIAL_REASONS } = require('./audit-logger');

/**
 * In-memory cache for token introspection results
 * In production, use Redis or similar distributed cache
 */
class TokenCache {
  constructor(ttl = 300000) { // 5 minutes default TTL
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  set(token, result) {
    const expiresAt = Date.now() + this.ttl;
    this.cache.set(token, { result, expiresAt });
  }
  
  get(token) {
    const cached = this.cache.get(token);
    if (!cached) return null;
    
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(token);
      return null;
    }
    
    return cached.result;
  }
  
  delete(token) {
    this.cache.delete(token);
  }
  
  clear() {
    this.cache.clear();
  }
  
  size() {
    return this.cache.size;
  }
}

// Global cache instance
const tokenCache = new TokenCache();

/**
 * Introspect OAuth access token
 * Validates token and returns introspection result
 * 
 * @param {string} token - Access token to introspect
 * @param {boolean} useCache - Whether to use cache (default: true)
 * @returns {Promise<Object>} Introspection result
 */
async function introspectToken(token, useCache = true) {
  try {
    // Check cache first
    if (useCache) {
      const cached = tokenCache.get(token);
      if (cached) {
        return cached;
      }
    }
    
    // Verify token
    const verification = await verifyAccessToken(token);
    
    if (!verification.valid) {
      const result = {
        active: false,
        error: verification.error,
        error_description: verification.error_description
      };
      
      // Don't cache negative results for as long
      if (useCache) {
        tokenCache.set(token, result);
      }
      
      return result;
    }
    
    // Token is valid - build introspection response
    const payload = verification.payload;
    const tokenMetadata = verification.token;
    
    const result = {
      active: true,
      scope: payload.scope,
      client_id: payload.client_id,
      token_type: 'Bearer',
      exp: payload.exp,
      iat: payload.iat,
      sub: payload.customer_id,
      customer_id: payload.customer_id,
      consent_id: payload.consent_id,
      token_id: payload.token_id
    };
    
    // Cache positive result
    if (useCache) {
      tokenCache.set(token, result);
    }
    
    return result;
    
  } catch (error) {
    console.error('Token introspection error:', error);
    return {
      active: false,
      error: 'server_error',
      error_description: 'Failed to introspect token'
    };
  }
}

/**
 * Gateway middleware for token introspection
 * Validates token before forwarding to protected APIs
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
async function gatewayTokenIntrospection(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      await logDeniedRequest(req, DENIAL_REASONS.MISSING_TOKEN, 401);
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Authorization header required'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      await logDeniedRequest(req, DENIAL_REASONS.MISSING_TOKEN, 401);
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Bearer token required'
      });
    }
    
    const token = authHeader.substring(7);
    
    if (!token || token.trim() === '') {
      await logDeniedRequest(req, DENIAL_REASONS.MISSING_TOKEN, 401);
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Token cannot be empty'
      });
    }
    
    // Introspect token
    const introspection = await introspectToken(token);
    
    if (!introspection.active) {
      // Determine specific denial reason
      let denialReason = DENIAL_REASONS.INVALID_TOKEN;
      if (introspection.error === 'token_expired') {
        denialReason = DENIAL_REASONS.EXPIRED_TOKEN;
      }
      
      await logDeniedRequest(req, denialReason, 401, {
        error: introspection.error,
        error_description: introspection.error_description
      });
      
      return res.status(401).json({
        error: 'invalid_token',
        error_description: introspection.error_description || 'Token is not active'
      });
    }
    
    // Attach introspection result to request
    req.token_introspection = introspection;
    req.oauth_token = {
      customer_id: introspection.customer_id,
      client_id: introspection.client_id,
      consent_id: introspection.consent_id,
      scope: introspection.scope,
      token_id: introspection.token_id
    };
    
    next();
    
  } catch (error) {
    console.error('Gateway introspection error:', error);
    await logDeniedRequest(req, DENIAL_REASONS.UNAUTHORIZED, 500, {
      error: error.message
    });
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to validate token'
    });
  }
}

/**
 * Invalidate cached token
 * Called when token is revoked or consent is revoked
 * 
 * @param {string} token - Token to invalidate
 */
function invalidateToken(token) {
  tokenCache.delete(token);
}

/**
 * Clear all cached tokens
 * Useful for testing or emergency invalidation
 */
function clearTokenCache() {
  tokenCache.clear();
}

/**
 * Get cache statistics
 * 
 * @returns {Object} Cache stats
 */
function getCacheStats() {
  return {
    size: tokenCache.size(),
    ttl: tokenCache.ttl
  };
}

/**
 * Validate token format
 * Quick check before attempting full introspection
 * 
 * @param {string} token - Token to validate
 * @returns {Object} Validation result
 */
function validateTokenFormat(token) {
  if (!token || typeof token !== 'string') {
    return {
      valid: false,
      error: 'Token must be a non-empty string'
    };
  }
  
  // JWT tokens have 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {
    return {
      valid: false,
      error: 'Invalid JWT format'
    };
  }
  
  // Check each part is base64url encoded
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;
  for (const part of parts) {
    if (!base64urlRegex.test(part)) {
      return {
        valid: false,
        error: 'Invalid base64url encoding'
      };
    }
  }
  
  return { valid: true };
}

/**
 * Middleware to validate token format before introspection
 * Provides fast rejection of malformed tokens
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function validateTokenFormatMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await logDeniedRequest(req, DENIAL_REASONS.MISSING_TOKEN, 401);
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'Bearer token required'
    });
  }
  
  const token = authHeader.substring(7);
  const validation = validateTokenFormat(token);
  
  if (!validation.valid) {
    await logDeniedRequest(req, DENIAL_REASONS.MALFORMED_TOKEN, 401, {
      validation_error: validation.error
    });
    return res.status(401).json({
      error: 'invalid_token',
      error_description: validation.error
    });
  }
  
  next();
}

/**
 * Complete gateway protection chain
 * Validates token format, introspects token, validates consent
 * 
 * @returns {Function[]} Array of middleware functions
 */
function gatewayProtection() {
  const { validateConsent } = require('./consent-validation');
  
  return [
    validateTokenFormatMiddleware,
    gatewayTokenIntrospection,
    validateConsent
  ];
}

module.exports = {
  introspectToken,
  gatewayTokenIntrospection,
  invalidateToken,
  clearTokenCache,
  getCacheStats,
  validateTokenFormat,
  validateTokenFormatMiddleware,
  gatewayProtection,
  tokenCache // Export for testing
};

// Made with Bob
