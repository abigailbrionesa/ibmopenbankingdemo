/**
 * Gateway Token Introspection Tests
 * Tests token validation at the gateway layer
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const {
  introspectToken,
  gatewayTokenIntrospection,
  invalidateToken,
  clearTokenCache,
  getCacheStats,
  validateTokenFormat,
  validateTokenFormatMiddleware,
  gatewayProtection,
  tokenCache
} = require('../../gateway/policies/token-introspection');

// Mock database
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    end: jest.fn()
  };
  return { Pool: jest.fn(() => mPool) };
});

// Mock token-exchange module
jest.mock('../../auth/oauth/token-exchange', () => ({
  verifyAccessToken: jest.fn()
}));

const { verifyAccessToken } = require('../../auth/oauth/token-exchange');

describe('Token Introspection', () => {
  let app;
  let pool;
  
  beforeEach(() => {
    // Clear cache before each test
    clearTokenCache();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Create test app
    app = express();
    app.use(express.json());
    
    // Get pool instance
    pool = new Pool();
  });
  
  afterEach(() => {
    clearTokenCache();
  });
  
  describe('validateTokenFormat', () => {
    test('should accept valid JWT format', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = validateTokenFormat(token);
      
      expect(result.valid).toBe(true);
    });
    
    test('should reject null token', () => {
      const result = validateTokenFormat(null);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty string');
    });
    
    test('should reject empty string', () => {
      const result = validateTokenFormat('');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty string');
    });
    
    test('should reject token with wrong number of parts', () => {
      const result = validateTokenFormat('invalid.token');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JWT format');
    });
    
    test('should reject token with invalid base64url encoding', () => {
      const result = validateTokenFormat('invalid!.token!.here!');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid base64url encoding');
    });
  });
  
  describe('introspectToken', () => {
    test('should return active=true for valid token', async () => {
      const mockPayload = {
        customer_id: 'cust-123',
        client_id: 'client-456',
        consent_id: 'consent-789',
        scope: 'accounts:read transactions:read',
        token_id: 'token-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };
      
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
        token: { id: 'token-abc' }
      });
      
      const result = await introspectToken('valid.token.here');
      
      expect(result.active).toBe(true);
      expect(result.customer_id).toBe('cust-123');
      expect(result.client_id).toBe('client-456');
      expect(result.consent_id).toBe('consent-789');
      expect(result.scope).toBe('accounts:read transactions:read');
      expect(result.token_type).toBe('Bearer');
    });
    
    test('should return active=false for invalid token', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'invalid_token',
        error_description: 'Token signature verification failed'
      });
      
      const result = await introspectToken('invalid.token.here');
      
      expect(result.active).toBe(false);
      expect(result.error).toBe('invalid_token');
      expect(result.error_description).toContain('signature verification failed');
    });
    
    test('should cache introspection results', async () => {
      const mockPayload = {
        customer_id: 'cust-123',
        client_id: 'client-456',
        consent_id: 'consent-789',
        scope: 'accounts:read',
        token_id: 'token-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };
      
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
        token: { id: 'token-abc' }
      });
      
      // First call
      await introspectToken('cached.token.here', true);
      expect(verifyAccessToken).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      await introspectToken('cached.token.here', true);
      expect(verifyAccessToken).toHaveBeenCalledTimes(1); // Still 1
      
      // Verify cache stats
      const stats = getCacheStats();
      expect(stats.size).toBe(1);
    });
    
    test('should bypass cache when useCache=false', async () => {
      const mockPayload = {
        customer_id: 'cust-123',
        client_id: 'client-456',
        consent_id: 'consent-789',
        scope: 'accounts:read',
        token_id: 'token-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };
      
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
        token: { id: 'token-abc' }
      });
      
      // First call without cache
      await introspectToken('nocache.token.here', false);
      expect(verifyAccessToken).toHaveBeenCalledTimes(1);
      
      // Second call should also verify
      await introspectToken('nocache.token.here', false);
      expect(verifyAccessToken).toHaveBeenCalledTimes(2);
    });
    
    test('should handle verification errors gracefully', async () => {
      verifyAccessToken.mockRejectedValue(new Error('Database connection failed'));
      
      const result = await introspectToken('error.token.here');
      
      expect(result.active).toBe(false);
      expect(result.error).toBe('server_error');
      expect(result.error_description).toContain('Failed to introspect token');
    });
  });
  
  describe('gatewayTokenIntrospection middleware', () => {
    beforeEach(() => {
      app.get('/protected', gatewayTokenIntrospection, (req, res) => {
        res.json({
          success: true,
          customer_id: req.oauth_token.customer_id
        });
      });
    });
    
    test('should return 401 when Authorization header is missing', async () => {
      const response = await request(app)
        .get('/protected')
        .expect(401);
      
      expect(response.body.error).toBe('unauthorized');
      expect(response.body.error_description).toContain('Authorization header required');
    });
    
    test('should return 401 when Bearer prefix is missing', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'InvalidPrefix token')
        .expect(401);
      
      expect(response.body.error).toBe('unauthorized');
      expect(response.body.error_description).toContain('Bearer token required');
    });
    
    test('should return 401 when token is empty', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer ')
        .expect(401);
      
      expect(response.body.error).toBe('unauthorized');
      expect(response.body.error_description).toContain('Token cannot be empty');
    });
    
    test('should return 401 for inactive token', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'invalid_token',
        error_description: 'Token has been revoked'
      });
      
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer revoked.token.here')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
      expect(response.body.error_description).toContain('revoked');
    });
    
    test('should return 401 for expired token', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'token_expired',
        error_description: 'Token has expired'
      });
      
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer expired.token.here')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
      expect(response.body.error_description).toContain('expired');
    });
    
    test('should pass valid token to next middleware', async () => {
      const mockPayload = {
        customer_id: 'cust-123',
        client_id: 'client-456',
        consent_id: 'consent-789',
        scope: 'accounts:read',
        token_id: 'token-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };
      
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
        token: { id: 'token-abc' }
      });
      
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.customer_id).toBe('cust-123');
    });
    
    test('should attach token introspection to request', async () => {
      const mockPayload = {
        customer_id: 'cust-123',
        client_id: 'client-456',
        consent_id: 'consent-789',
        scope: 'accounts:read transactions:read',
        token_id: 'token-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };
      
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
        token: { id: 'token-abc' }
      });
      
      app.get('/check-introspection', gatewayTokenIntrospection, (req, res) => {
        res.json({
          has_introspection: !!req.token_introspection,
          has_oauth_token: !!req.oauth_token,
          introspection: req.token_introspection
        });
      });
      
      const response = await request(app)
        .get('/check-introspection')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(200);
      
      expect(response.body.has_introspection).toBe(true);
      expect(response.body.has_oauth_token).toBe(true);
      expect(response.body.introspection.active).toBe(true);
      expect(response.body.introspection.customer_id).toBe('cust-123');
    });
    
    test('should return 500 on unexpected errors', async () => {
      verifyAccessToken.mockRejectedValue(new Error('Unexpected error'));
      
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer error.token.here')
        .expect(500);
      
      expect(response.body.error).toBe('server_error');
    });
  });
  
  describe('validateTokenFormatMiddleware', () => {
    beforeEach(() => {
      app.get('/format-check', validateTokenFormatMiddleware, (req, res) => {
        res.json({ success: true });
      });
    });
    
    test('should reject malformed token', async () => {
      const response = await request(app)
        .get('/format-check')
        .set('Authorization', 'Bearer malformed.token')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
      expect(response.body.error_description).toContain('Invalid JWT format');
    });
    
    test('should reject token with invalid characters', async () => {
      const response = await request(app)
        .get('/format-check')
        .set('Authorization', 'Bearer invalid!.token!.here!')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
      expect(response.body.error_description).toContain('Invalid base64url encoding');
    });
    
    test('should accept well-formed JWT', async () => {
      const response = await request(app)
        .get('/format-check')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U')
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
  });
  
  describe('Cache Management', () => {
    test('should invalidate specific token', async () => {
      const mockPayload = {
        customer_id: 'cust-123',
        client_id: 'client-456',
        consent_id: 'consent-789',
        scope: 'accounts:read',
        token_id: 'token-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };
      
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
        token: { id: 'token-abc' }
      });
      
      // Cache token
      await introspectToken('token.to.invalidate', true);
      expect(getCacheStats().size).toBe(1);
      
      // Invalidate
      invalidateToken('token.to.invalidate');
      expect(getCacheStats().size).toBe(0);
    });
    
    test('should clear all cached tokens', async () => {
      const mockPayload = {
        customer_id: 'cust-123',
        client_id: 'client-456',
        consent_id: 'consent-789',
        scope: 'accounts:read',
        token_id: 'token-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };
      
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
        token: { id: 'token-abc' }
      });
      
      // Cache multiple tokens
      await introspectToken('token1', true);
      await introspectToken('token2', true);
      await introspectToken('token3', true);
      expect(getCacheStats().size).toBe(3);
      
      // Clear all
      clearTokenCache();
      expect(getCacheStats().size).toBe(0);
    });
    
    test('should expire cached tokens after TTL', async () => {
      // Create cache with 100ms TTL
      const shortTTLCache = new (require('../../gateway/policies/token-introspection').tokenCache.constructor)(100);
      
      shortTTLCache.set('test-token', { active: true });
      expect(shortTTLCache.get('test-token')).toBeTruthy();
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(shortTTLCache.get('test-token')).toBeNull();
    });
  });
  
  describe('gatewayProtection', () => {
    test('should return array of middleware functions', () => {
      const protection = gatewayProtection();
      
      expect(Array.isArray(protection)).toBe(true);
      expect(protection.length).toBeGreaterThan(0);
      expect(typeof protection[0]).toBe('function');
    });
  });
  
  describe('Integration with token-exchange', () => {
    test('should handle token with invalid signature', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'invalid_token',
        error_description: 'Invalid token signature'
      });
      
      const result = await introspectToken('token.with.bad.signature');
      
      expect(result.active).toBe(false);
      expect(result.error).toBe('invalid_token');
      expect(result.error_description).toContain('signature');
    });
    
    test('should handle revoked token from database', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'token_revoked',
        error_description: 'Token has been revoked'
      });
      
      const result = await introspectToken('revoked.token');
      
      expect(result.active).toBe(false);
      expect(result.error).toBe('token_revoked');
    });
    
    test('should handle token with revoked consent', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'consent_revoked',
        error_description: 'Associated consent has been revoked'
      });
      
      const result = await introspectToken('token.with.revoked.consent');
      
      expect(result.active).toBe(false);
      expect(result.error).toBe('consent_revoked');
    });
  });
});

// Made with Bob
