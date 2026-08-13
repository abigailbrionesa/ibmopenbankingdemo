/**
 * Security Boundary Tests
 * Comprehensive tests for authorization security boundaries
 * 
 * Tests cover:
 * - Token validation (missing, invalid, expired, revoked)
 * - Scope enforcement (wrong scope, insufficient scope)
 * - Consent validation (revoked, expired, denied)
 * - Negative authorization cases per PRD requirements
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// Mock dependencies
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    end: jest.fn()
  };
  return { Pool: jest.fn(() => mPool) };
});

jest.mock('../../auth/oauth/token-exchange', () => ({
  verifyAccessToken: jest.fn()
}));

jest.mock('../../data/db', () => ({
  query: jest.fn()
}));

const { verifyAccessToken } = require('../../auth/oauth/token-exchange');
const { query } = require('../../data/db');
const { gatewayTokenIntrospection } = require('../../gateway/policies/token-introspection');
const { enforceEndpointScopes } = require('../../gateway/policies/scope-enforcement');
const { validateConsent } = require('../../gateway/policies/consent-validation');

describe('Security Boundary Tests', () => {
  let app;
  let pool;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create test app with full security chain
    app = express();
    app.use(express.json());
    
    // Protected endpoint with full security chain
    app.get('/api/v1/accounts',
      gatewayTokenIntrospection,
      validateConsent,
      enforceEndpointScopes,
      (req, res) => {
        res.json({
          accounts: [
            { id: 'acc-1', balance: 1000 },
            { id: 'acc-2', balance: 2000 }
          ]
        });
      }
    );
    
    app.get('/api/v1/accounts/:account_id/transactions',
      gatewayTokenIntrospection,
      validateConsent,
      enforceEndpointScopes,
      (req, res) => {
        res.json({
          transactions: [
            { id: 'txn-1', amount: 100 },
            { id: 'txn-2', amount: 200 }
          ]
        });
      }
    );
    
    pool = new Pool();
  });
  
  describe('PRD Requirement: No token returns 401', () => {
    test('should return 401 when Authorization header is missing', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .expect(401);
      
      expect(response.body.error).toBe('unauthorized');
      expect(response.body.error_description).toContain('Authorization header required');
    });
    
    test('should return 401 when Bearer prefix is missing', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'InvalidPrefix sometoken')
        .expect(401);
      
      expect(response.body.error).toBe('unauthorized');
      expect(response.body.error_description).toContain('Bearer token required');
    });
    
    test('should return 401 when token is empty string', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer ')
        .expect(401);
      
      expect(response.body.error).toBe('unauthorized');
      expect(response.body.error_description).toContain('Token cannot be empty');
    });
    
    test('should return 401 for all protected endpoints without token', async () => {
      // Test accounts endpoint
      await request(app)
        .get('/api/v1/accounts')
        .expect(401);
      
      // Test transactions endpoint
      await request(app)
        .get('/api/v1/accounts/acc-123/transactions')
        .expect(401);
    });
  });
  
  describe('PRD Requirement: Invalid token returns 401', () => {
    test('should return 401 for malformed JWT token', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'invalid_token',
        error_description: 'Invalid JWT format'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer malformed.token')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
      expect(response.body.error_description).toBeDefined();
    });
    
    test('should return 401 for token with invalid signature', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'invalid_token',
        error_description: 'Token signature verification failed'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
      expect(response.body.error_description).toContain('signature');
    });
    
    test('should return 401 for token from unknown issuer', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'invalid_token',
        error_description: 'Token issuer not recognized'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer token.from.unknown.issuer')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
    });
    
    test('should return 401 for revoked token', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'token_revoked',
        error_description: 'Token has been revoked'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer revoked.token.here')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
      expect(response.body.error_description).toContain('revoked');
    });
  });
  
  describe('PRD Requirement: Expired token returns 401', () => {
    test('should return 401 for expired access token', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'token_expired',
        error_description: 'Token has expired'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer expired.token.here')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
      expect(response.body.error_description).toContain('expired');
    });
    
    test('should return 401 for token with exp claim in the past', async () => {
      const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'token_expired',
        error_description: `Token expired at ${new Date(expiredTime * 1000).toISOString()}`
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer token.with.past.exp')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
    });
  });
  
  describe('PRD Requirement: Wrong scope returns 403', () => {
    beforeEach(() => {
      // Mock valid token but wrong scope
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: 'profile:read', // Wrong scope for accounts endpoint
          token_id: 'token-abc',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000)
        },
        token: { id: 'token-abc' }
      });
      
      // Mock valid consent
      query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'approved',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'profile:read'
        }]
      });
    });
    
    test('should return 403 when accessing accounts endpoint without accounts:read scope', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.wrong.scope')
        .expect(403);
      
      expect(response.body.error).toBe('insufficient_scope');
      expect(response.body.required_scopes).toContain('accounts:read');
      expect(response.body.granted_scopes).toEqual(['profile:read']);
    });
    
    test('should return 403 when accessing transactions endpoint without transactions:read scope', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/acc-123/transactions')
        .set('Authorization', 'Bearer valid.token.wrong.scope')
        .expect(403);
      
      expect(response.body.error).toBe('insufficient_scope');
      expect(response.body.required_scopes).toContain('transactions:read');
    });
    
    test('should return 403 not 401 for valid token with wrong scope', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.wrong.scope');
      
      // Must be 403, not 401
      expect(response.status).toBe(403);
      expect(response.status).not.toBe(401);
    });
  });
  
  describe('PRD Requirement: Revoked consent returns 403', () => {
    beforeEach(() => {
      // Mock valid token
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: 'accounts:read',
          token_id: 'token-abc',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000)
        },
        token: { id: 'token-abc' }
      });
    });
    
    test('should return 403 when consent has been revoked', async () => {
      query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'revoked',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'accounts:read'
        }]
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.revoked.consent')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('revoked');
      expect(response.body.status).toBe('revoked');
    });
    
    test('should return 403 when consent was denied', async () => {
      query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'denied',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'accounts:read'
        }]
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.denied.consent')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('denied');
    });
    
    test('should return 403 when consent is not found', async () => {
      query.mockResolvedValue({
        rows: []
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.missing.consent')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('not found');
    });
    
    test('should return 403 when consent has expired', async () => {
      query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'approved',
          expires_at: new Date(Date.now() - 86400000).toISOString(), // Expired yesterday
          granted_scopes: 'accounts:read'
        }]
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.expired.consent')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('expired');
    });
  });
  
  describe('PRD Requirement: Valid token alone is NOT enough', () => {
    test('should fail if token is valid but consent is revoked', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: 'accounts:read',
          token_id: 'token-abc',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000)
        },
        token: { id: 'token-abc' }
      });
      
      query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'revoked',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'accounts:read'
        }]
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.only')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
    });
    
    test('should fail if token is valid but scope is insufficient', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: 'profile:read', // Wrong scope
          token_id: 'token-abc',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000)
        },
        token: { id: 'token-abc' }
      });
      
      query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'approved',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'profile:read'
        }]
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.only')
        .expect(403);
      
      expect(response.body.error).toBe('insufficient_scope');
    });
    
    test('should succeed only when token, consent, and scope are all valid', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: 'accounts:read',
          token_id: 'token-abc',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000)
        },
        token: { id: 'token-abc' }
      });
      
      query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'approved',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'accounts:read'
        }]
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer fully.valid.token')
        .expect(200);
      
      expect(response.body.accounts).toBeDefined();
      expect(Array.isArray(response.body.accounts)).toBe(true);
    });
  });
  
  describe('Scope Mismatch Between Token and Consent', () => {
    test('should return 403 when token scopes exceed consent scopes', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: 'accounts:read transactions:read', // Token has more scopes
          token_id: 'token-abc',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000)
        },
        token: { id: 'token-abc' }
      });
      
      query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'approved',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'accounts:read' // Consent only has accounts:read
        }]
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer token.with.extra.scopes')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('Token scopes exceed consent scopes');
      expect(response.body.unauthorized_scopes).toContain('transactions:read');
    });
  });
  
  describe('Multiple Security Layers', () => {
    test('should enforce all security layers in correct order', async () => {
      // Test 1: Token validation fails first
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'invalid_token',
        error_description: 'Invalid token'
      });
      
      let response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer invalid.token');
      
      expect(response.status).toBe(401);
      expect(query).not.toHaveBeenCalled(); // Consent check should not run
      
      // Test 2: Token valid, consent check fails
      jest.clearAllMocks();
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: 'accounts:read',
          token_id: 'token-abc',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000)
        },
        token: { id: 'token-abc' }
      });
      
      query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'revoked',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'accounts:read'
        }]
      });
      
      response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token');
      
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
      expect(query).toHaveBeenCalled(); // Consent check should run
    });
  });
});

// Made with Bob