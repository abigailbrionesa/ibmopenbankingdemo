/**
 * Rate Limiter
 * Per-client rate limiting for API gateway
 * 
 * Implements a sliding window rate limiter to prevent abuse and ensure
 * fair resource allocation across OAuth clients.
 */

const { logDeniedRequest, DENIAL_REASONS } = require('./audit-logger');

/**
 * Rate limit configuration
 * Can be overridden via environment variables
 */
const RATE_LIMIT_CONFIG = {
  // Default: 100 requests per minute per client
  DEFAULT_LIMIT: parseInt(process.env.RATE_LIMIT_REQUESTS || '100', 10),
  WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
  
  // Test-friendly override for lower limits
  TEST_LIMIT: parseInt(process.env.RATE_LIMIT_TEST_REQUESTS || '10', 10),
  TEST_WINDOW_MS: parseInt(process.env.RATE_LIMIT_TEST_WINDOW_MS || '10000', 10) // 10 seconds
};

/**
 * In-memory rate limit store
 * In production, use Redis or similar distributed cache
 * 
 * Structure: Map<client_id, Array<timestamp>>
 */
class RateLimitStore {
  constructor() {
    this.store = new Map();
    this.cleanupInterval = null;
    this.startCleanup();
  }

  /**
   * Record a request for a client
   * 
   * @param {string} clientId - OAuth client identifier
   * @param {number} timestamp - Request timestamp
   */
  recordRequest(clientId, timestamp = Date.now()) {
    if (!this.store.has(clientId)) {
      this.store.set(clientId, []);
    }
    
    const requests = this.store.get(clientId);
    requests.push(timestamp);
  }

  /**
   * Get request count for client within window
   * 
   * @param {string} clientId - OAuth client identifier
   * @param {number} windowMs - Time window in milliseconds
   * @returns {number} Number of requests in window
   */
  getRequestCount(clientId, windowMs) {
    if (!this.store.has(clientId)) {
      return 0;
    }

    const now = Date.now();
    const windowStart = now - windowMs;
    const requests = this.store.get(clientId);

    // Filter to only requests within the window
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    
    // Update store with filtered requests
    this.store.set(clientId, recentRequests);

    return recentRequests.length;
  }

  /**
   * Check if client has exceeded rate limit
   * 
   * @param {string} clientId - OAuth client identifier
   * @param {number} limit - Maximum requests allowed
   * @param {number} windowMs - Time window in milliseconds
   * @returns {boolean} True if limit exceeded
   */
  isLimitExceeded(clientId, limit, windowMs) {
    const count = this.getRequestCount(clientId, windowMs);
    return count >= limit;
  }

  /**
   * Get rate limit status for client
   * 
   * @param {string} clientId - OAuth client identifier
   * @param {number} limit - Maximum requests allowed
   * @param {number} windowMs - Time window in milliseconds
   * @returns {Object} Rate limit status
   */
  getStatus(clientId, limit, windowMs) {
    const count = this.getRequestCount(clientId, windowMs);
    const remaining = Math.max(0, limit - count);
    const resetTime = Date.now() + windowMs;

    return {
      limit,
      remaining,
      reset: new Date(resetTime).toISOString(),
      current: count
    };
  }

  /**
   * Clear all rate limit data for a client
   * 
   * @param {string} clientId - OAuth client identifier
   */
  clear(clientId) {
    this.store.delete(clientId);
  }

  /**
   * Clear all rate limit data
   */
  clearAll() {
    this.store.clear();
  }

  /**
   * Get total number of tracked clients
   * 
   * @returns {number} Number of clients
   */
  size() {
    return this.store.size;
  }

  /**
   * Start periodic cleanup of old entries
   */
  startCleanup() {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 300000);
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Remove old entries from all clients
   */
  cleanup() {
    const now = Date.now();
    const maxAge = RATE_LIMIT_CONFIG.WINDOW_MS * 2; // Keep 2x window for safety

    for (const [clientId, requests] of this.store.entries()) {
      const recentRequests = requests.filter(timestamp => now - timestamp < maxAge);
      
      if (recentRequests.length === 0) {
        this.store.delete(clientId);
      } else {
        this.store.set(clientId, recentRequests);
      }
    }
  }
}

// Global rate limit store
const rateLimitStore = new RateLimitStore();

/**
 * Get rate limit configuration
 * Allows for per-client overrides in the future
 * 
 * @param {string} clientId - OAuth client identifier
 * @returns {Object} Rate limit configuration
 */
function getRateLimitConfig(clientId) {
  // Check if test mode is enabled
  const isTestMode = process.env.NODE_ENV === 'test' || 
                     process.env.RATE_LIMIT_TEST_MODE === 'true';

  return {
    limit: isTestMode ? RATE_LIMIT_CONFIG.TEST_LIMIT : RATE_LIMIT_CONFIG.DEFAULT_LIMIT,
    windowMs: isTestMode ? RATE_LIMIT_CONFIG.TEST_WINDOW_MS : RATE_LIMIT_CONFIG.WINDOW_MS
  };
}

/**
 * Rate limiting middleware
 * Must be applied after OAuth token validation
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
async function rateLimitMiddleware(req, res, next) {
  try {
    // Ensure OAuth token is present
    if (!req.oauth_token || !req.oauth_token.client_id) {
      // If no client_id, skip rate limiting (will be caught by auth middleware)
      return next();
    }

    const clientId = req.oauth_token.client_id;
    const config = getRateLimitConfig(clientId);

    // Check if limit exceeded
    if (rateLimitStore.isLimitExceeded(clientId, config.limit, config.windowMs)) {
      const status = rateLimitStore.getStatus(clientId, config.limit, config.windowMs);

      // Log rate limit denial to audit
      await logDeniedRequest(req, DENIAL_REASONS.RATE_LIMIT_EXCEEDED, 429, {
        rate_limit: status,
        client_id: clientId
      });

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': status.limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': status.reset,
        'Retry-After': Math.ceil(config.windowMs / 1000).toString()
      });

      return res.status(429).json({
        error: 'rate_limit_exceeded',
        error_description: `Rate limit exceeded. Maximum ${config.limit} requests per ${config.windowMs / 1000} seconds.`,
        rate_limit: {
          limit: status.limit,
          remaining: 0,
          reset: status.reset
        }
      });
    }

    // Record this request
    rateLimitStore.recordRequest(clientId);

    // Get updated status and set headers
    const status = rateLimitStore.getStatus(clientId, config.limit, config.windowMs);
    res.set({
      'X-RateLimit-Limit': status.limit.toString(),
      'X-RateLimit-Remaining': status.remaining.toString(),
      'X-RateLimit-Reset': status.reset
    });

    next();

  } catch (error) {
    console.error('Rate limit middleware error:', error);
    // Don't block request on rate limiter errors
    next();
  }
}

/**
 * Create rate limiter with custom configuration
 * 
 * @param {Object} options - Rate limit options
 * @param {number} options.limit - Maximum requests allowed
 * @param {number} options.windowMs - Time window in milliseconds
 * @returns {Function} Express middleware
 */
function createRateLimiter(options = {}) {
  const { limit, windowMs } = options;

  return async (req, res, next) => {
    try {
      if (!req.oauth_token || !req.oauth_token.client_id) {
        return next();
      }

      const clientId = req.oauth_token.client_id;
      const effectiveLimit = limit || RATE_LIMIT_CONFIG.DEFAULT_LIMIT;
      const effectiveWindow = windowMs || RATE_LIMIT_CONFIG.WINDOW_MS;

      if (rateLimitStore.isLimitExceeded(clientId, effectiveLimit, effectiveWindow)) {
        const status = rateLimitStore.getStatus(clientId, effectiveLimit, effectiveWindow);

        await logDeniedRequest(req, DENIAL_REASONS.RATE_LIMIT_EXCEEDED, 429, {
          rate_limit: status,
          client_id: clientId
        });

        res.set({
          'X-RateLimit-Limit': status.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': status.reset,
          'Retry-After': Math.ceil(effectiveWindow / 1000).toString()
        });

        return res.status(429).json({
          error: 'rate_limit_exceeded',
          error_description: `Rate limit exceeded. Maximum ${effectiveLimit} requests per ${effectiveWindow / 1000} seconds.`,
          rate_limit: status
        });
      }

      rateLimitStore.recordRequest(clientId);
      const status = rateLimitStore.getStatus(clientId, effectiveLimit, effectiveWindow);
      
      res.set({
        'X-RateLimit-Limit': status.limit.toString(),
        'X-RateLimit-Remaining': status.remaining.toString(),
        'X-RateLimit-Reset': status.reset
      });

      next();

    } catch (error) {
      console.error('Rate limit middleware error:', error);
      next();
    }
  };
}

/**
 * Get rate limit status for a client
 * 
 * @param {string} clientId - OAuth client identifier
 * @returns {Object} Rate limit status
 */
function getRateLimitStatus(clientId) {
  const config = getRateLimitConfig(clientId);
  return rateLimitStore.getStatus(clientId, config.limit, config.windowMs);
}

/**
 * Reset rate limit for a client
 * 
 * @param {string} clientId - OAuth client identifier
 */
function resetRateLimit(clientId) {
  rateLimitStore.clear(clientId);
}

/**
 * Reset all rate limits
 */
function resetAllRateLimits() {
  rateLimitStore.clearAll();
}

/**
 * Get rate limit statistics
 * 
 * @returns {Object} Statistics
 */
function getRateLimitStats() {
  return {
    tracked_clients: rateLimitStore.size(),
    config: {
      default_limit: RATE_LIMIT_CONFIG.DEFAULT_LIMIT,
      window_ms: RATE_LIMIT_CONFIG.WINDOW_MS,
      test_limit: RATE_LIMIT_CONFIG.TEST_LIMIT,
      test_window_ms: RATE_LIMIT_CONFIG.TEST_WINDOW_MS
    }
  };
}

module.exports = {
  rateLimitMiddleware,
  createRateLimiter,
  getRateLimitStatus,
  resetRateLimit,
  resetAllRateLimits,
  getRateLimitStats,
  rateLimitStore, // Export for testing
  RATE_LIMIT_CONFIG
};

// Made with Bob