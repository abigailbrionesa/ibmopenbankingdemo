/**
 * Rate Limiter Tests
 * Tests for per-client rate limiting functionality
 */

const {
  rateLimitMiddleware,
  createRateLimiter,
  getRateLimitStatus,
  resetRateLimit,
  resetAllRateLimits,
  getRateLimitStats,
  rateLimitStore,
  RATE_LIMIT_CONFIG
} = require('../../gateway/policies/rate-limiter');
const { logDeniedRequest, DENIAL_REASONS } = require('../../gateway/policies/audit-logger');

// Mock audit logger
jest.mock('../../gateway/policies/audit-logger');

describe('Rate Limiter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllRateLimits();
    // Set test mode
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_TEST_MODE = 'true';
  });

  afterEach(() => {
    resetAllRateLimits();
  });

  describe('RateLimitStore', () => {
    it('should record requests for a client', () => {
      const clientId = 'client-123';
      rateLimitStore.recordRequest(clientId);
      rateLimitStore.recordRequest(clientId);
      
      const count = rateLimitStore.getRequestCount(clientId, 60000);
      expect(count).toBe(2);
    });

    it('should only count requests within the window', () => {
      const clientId = 'client-123';
      const now = Date.now();
      
      // Record old request (outside window)
      rateLimitStore.recordRequest(clientId, now - 70000);
      // Record recent requests (inside window)
      rateLimitStore.recordRequest(clientId, now - 5000);
      rateLimitStore.recordRequest(clientId, now);
      
      const count = rateLimitStore.getRequestCount(clientId, 60000);
      expect(count).toBe(2); // Only the 2 recent requests
    });

    it('should check if limit is exceeded', () => {
      const clientId = 'client-123';
      const limit = 5;
      
      // Add requests up to limit
      for (let i = 0; i < limit; i++) {
        rateLimitStore.recordRequest(clientId);
      }
      
      expect(rateLimitStore.isLimitExceeded(clientId, limit, 60000)).toBe(true);
    });

    it('should not exceed limit when under threshold', () => {
      const clientId = 'client-123';
      const limit = 10;
      
      // Add requests below limit
      for (let i = 0; i < 5; i++) {
        rateLimitStore.recordRequest(clientId);
      }
      
      expect(rateLimitStore.isLimitExceeded(clientId, limit, 60000)).toBe(false);
    });

    it('should provide rate limit status', () => {
      const clientId = 'client-123';
      const limit = 10;
      
      rateLimitStore.recordRequest(clientId);
      rateLimitStore.recordRequest(clientId);
      rateLimitStore.recordRequest(clientId);
      
      const status = rateLimitStore.getStatus(clientId, limit, 60000);
      
      expect(status.limit).toBe(10);
      expect(status.current).toBe(3);
      expect(status.remaining).toBe(7);
      expect(status.reset).toBeTruthy();
    });

    it('should clear rate limit for specific client', () => {
      const clientId = 'client-123';
      
      rateLimitStore.recordRequest(clientId);
      rateLimitStore.recordRequest(clientId);
      
      expect(rateLimitStore.getRequestCount(clientId, 60000)).toBe(2);
      
      rateLimitStore.clear(clientId);
      
      expect(rateLimitStore.getRequestCount(clientId, 60000)).toBe(0);
    });

    it('should clear all rate limits', () => {
      rateLimitStore.recordRequest('client-1');
      rateLimitStore.recordRequest('client-2');
      rateLimitStore.recordRequest('client-3');
      
      expect(rateLimitStore.size()).toBe(3);
      
      rateLimitStore.clearAll();
      
      expect(rateLimitStore.size()).toBe(0);
    });

    it('should isolate rate limits per client', () => {
      const client1 = 'client-1';
      const client2 = 'client-2';
      
      // Client 1 makes 5 requests
      for (let i = 0; i < 5; i++) {
        rateLimitStore.recordRequest(client1);
      }
      
      // Client 2 makes 2 requests
      for (let i = 0; i < 2; i++) {
        rateLimitStore.recordRequest(client2);
      }
      
      expect(rateLimitStore.getRequestCount(client1, 60000)).toBe(5);
      expect(rateLimitStore.getRequestCount(client2, 60000)).toBe(2);
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should allow requests under the limit', async () => {
      const req = {
        oauth_token: {
          client_id: 'client-123'
        }
      };
      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await rateLimitMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
        'X-RateLimit-Limit': expect.any(String),
        'X-RateLimit-Remaining': expect.any(String),
        'X-RateLimit-Reset': expect.any(String)
      }));
    });

    it('should block requests when limit exceeded', async () => {
      const clientId = 'client-123';
      const limit = RATE_LIMIT_CONFIG.TEST_LIMIT;

      // Exhaust the limit
      for (let i = 0; i < limit; i++) {
        rateLimitStore.recordRequest(clientId);
      }

      const req = {
        oauth_token: {
          client_id: clientId
        },
        path: '/api/v1/accounts',
        method: 'GET'
      };
      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await rateLimitMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'rate_limit_exceeded'
      }));
      expect(logDeniedRequest).toHaveBeenCalledWith(
        req,
        DENIAL_REASONS.RATE_LIMIT_EXCEEDED,
        429,
        expect.any(Object)
      );
    });

    it('should set rate limit headers', async () => {
      const req = {
        oauth_token: {
          client_id: 'client-123'
        }
      };
      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await rateLimitMiddleware(req, res, next);

      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
        'X-RateLimit-Limit': expect.any(String),
        'X-RateLimit-Remaining': expect.any(String),
        'X-RateLimit-Reset': expect.any(String)
      }));
    });

    it('should set Retry-After header when limit exceeded', async () => {
      const clientId = 'client-123';
      const limit = RATE_LIMIT_CONFIG.TEST_LIMIT;

      for (let i = 0; i < limit; i++) {
        rateLimitStore.recordRequest(clientId);
      }

      const req = {
        oauth_token: {
          client_id: clientId
        }
      };
      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await rateLimitMiddleware(req, res, next);

      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
        'Retry-After': expect.any(String)
      }));
    });

    it('should skip rate limiting if no client_id', async () => {
      const req = {
        oauth_token: {}
      };
      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await rateLimitMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should isolate rate limits between clients', async () => {
      const limit = RATE_LIMIT_CONFIG.TEST_LIMIT;

      // Exhaust limit for client-1
      for (let i = 0; i < limit; i++) {
        rateLimitStore.recordRequest('client-1');
      }

      // Client-1 should be blocked
      const req1 = {
        oauth_token: { client_id: 'client-1' }
      };
      const res1 = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next1 = jest.fn();

      await rateLimitMiddleware(req1, res1, next1);
      expect(res1.status).toHaveBeenCalledWith(429);

      // Client-2 should still be allowed
      const req2 = {
        oauth_token: { client_id: 'client-2' }
      };
      const res2 = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next2 = jest.fn();

      await rateLimitMiddleware(req2, res2, next2);
      expect(next2).toHaveBeenCalled();
      expect(res2.status).not.toHaveBeenCalled();
    });
  });

  describe('createRateLimiter', () => {
    it('should create rate limiter with custom limit', async () => {
      const customLimit = 5;
      const limiter = createRateLimiter({ limit: customLimit, windowMs: 60000 });

      const clientId = 'client-123';
      
      // Exhaust custom limit
      for (let i = 0; i < customLimit; i++) {
        rateLimitStore.recordRequest(clientId);
      }

      const req = {
        oauth_token: { client_id: clientId }
      };
      const res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      await limiter(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('Utility Functions', () => {
    it('should get rate limit status for client', () => {
      const clientId = 'client-123';
      
      rateLimitStore.recordRequest(clientId);
      rateLimitStore.recordRequest(clientId);
      
      const status = getRateLimitStatus(clientId);
      
      expect(status).toHaveProperty('limit');
      expect(status).toHaveProperty('remaining');
      expect(status).toHaveProperty('reset');
      expect(status).toHaveProperty('current');
      expect(status.current).toBe(2);
    });

    it('should reset rate limit for specific client', () => {
      const clientId = 'client-123';
      
      rateLimitStore.recordRequest(clientId);
      rateLimitStore.recordRequest(clientId);
      
      expect(rateLimitStore.getRequestCount(clientId, 60000)).toBe(2);
      
      resetRateLimit(clientId);
      
      expect(rateLimitStore.getRequestCount(clientId, 60000)).toBe(0);
    });

    it('should get rate limit statistics', () => {
      rateLimitStore.recordRequest('client-1');
      rateLimitStore.recordRequest('client-2');
      rateLimitStore.recordRequest('client-3');
      
      const stats = getRateLimitStats();
      
      expect(stats).toHaveProperty('tracked_clients');
      expect(stats).toHaveProperty('config');
      expect(stats.tracked_clients).toBe(3);
    });
  });

  describe('Rate Limit Window', () => {
    it('should allow requests after window expires', async () => {
      const clientId = 'client-123';
      const limit = 5;
      const windowMs = 1000; // 1 second window
      
      // Exhaust limit
      for (let i = 0; i < limit; i++) {
        rateLimitStore.recordRequest(clientId, Date.now() - 2000); // 2 seconds ago
      }
      
      // Should not be limited (window expired)
      expect(rateLimitStore.isLimitExceeded(clientId, limit, windowMs)).toBe(false);
    });

    it('should track requests across sliding window', () => {
      const clientId = 'client-123';
      const now = Date.now();
      const windowMs = 10000; // 10 second window
      
      // Add requests at different times
      rateLimitStore.recordRequest(clientId, now - 15000); // Outside window
      rateLimitStore.recordRequest(clientId, now - 8000);  // Inside window
      rateLimitStore.recordRequest(clientId, now - 5000);  // Inside window
      rateLimitStore.recordRequest(clientId, now - 2000);  // Inside window
      rateLimitStore.recordRequest(clientId, now);         // Inside window
      
      const count = rateLimitStore.getRequestCount(clientId, windowMs);
      expect(count).toBe(4); // Only requests within 10 seconds
    });
  });
});

// Made with Bob