/**
 * Security Integration Tests
 * End-to-end tests for complete authorization flows with negative cases
 * 
 * Tests complete security boundary scenarios:
 * - Full OAuth flow with security failures
 * - Protected endpoint access with various failure modes
 * - Token lifecycle and revocation
 * - Consent lifecycle and revocation
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
  verifyAccessToken: jest.fn(),
  exchangeAuthorizationCode: jest.fn()
}));

jest.mock('../../data/db', () => ({
  query: jest.fn()
}));

const { verifyAccessToken, exchangeAuthorizationCode } = require('../../auth/oauth/token-exchange');
const { query } = require('../../data/db');
const { gatewayTokenIntrospection } = require('../../gateway/policies/token-introspection');
const { enforceEndpointScopes } = require('../../gateway/policies/scope-enforcement');
const { validateConsent } = require('../../gateway/policies/consent-validation');

describe('Security Integration Tests', () => {
  let app;
  let pool;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create full application with security middleware
    app = express();
    app.use(express.json());
    
    // Apply security middleware chain to all /api routes
    app.use('/api', gatewayTokenIntrospection);
    app.use('/api', validateConsent);
    app.use('/api', enforceEndpointScopes);
    
    // Define protected API endpoints
    app.get('/api/v1/accounts', (req, res) => {
      res.json({
        accounts: [
          { id: 'acc-001', name: 'Checking', balance: 5000 },
          { id: 'acc-002', name: 'Savings', balance: 10000 }
        ]
      });
    });
    
    app.get('/api/v1/accounts/:account_id', (req, res) => {
      res.json({
        id: req.params.account_id,
        name: 'Checking Account',
        balance: 5000,
        currency: 'USD'
      });
    });
    
    app.get('/api/v1/accounts/:account_id/transactions', (req, res) => {
      res.json({
        transactions: [
          { id: 'txn-001', amount: -50, description: 'Coffee Shop' },
          { id: 'txn-002', amount: 1000, description: 'Salary Deposit' }
        ]
      });
    });
    
    app.get('/api/v1/accounts/:account_id/balance', (req, res) => {
      res.json({
        account_id: req.params.account_id,
        balance: 5000,
        available_balance: 4800,
        currency: 'USD'
      });
    });
    
    app.get('/api/v1/profile', (req, res) => {
      res.json({
        customer_id: req.oauth_token.customer_id,
        name: 'John Doe',
        email: 'john@example.com'
      });
    });
    
    pool = new Pool();
  });
  
  describe('Complete Authorization Flow - Negative Cases', () => {
    test('should deny access through entire flow when token is missing', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .expect(401);
      
      expect(response.body.error).toBe('unauthorized');
      expect(verifyAccessToken).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    });
    
    test('should deny access when token is invalid', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'invalid_token',
        error_description: 'Token signature invalid'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
      expect(verifyAccessToken).toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled(); // Should not reach consent check
    });
    
    test('should deny access when token is expired', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'token_expired',
        error_description: 'Token expired 2 hours ago'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer expired.token.here')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
      expect(response.body.error_description).toContain('expired');
    });
    
    test('should deny access when consent is revoked', async () => {
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
        .set('Authorization', 'Bearer valid.token.revoked.consent')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('revoked');
    });
    
    test('should deny access when scope is insufficient', async () => {
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
        .set('Authorization', 'Bearer valid.token.wrong.scope')
        .expect(403);
      
      expect(response.body.error).toBe('insufficient_scope');
      expect(response.body.required_scopes).toContain('accounts:read');
    });
  });
  
  describe('Multi-Endpoint Security Enforcement', () => {
    const setupValidToken = (scope) => {
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: scope,
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
          granted_scopes: scope
        }]
      });
    };
    
    test('should allow accounts endpoint with accounts:read scope', async () => {
      setupValidToken('accounts:read');
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token')
        .expect(200);
      
      expect(response.body.accounts).toBeDefined();
      expect(Array.isArray(response.body.accounts)).toBe(true);
    });
    
    test('should deny transactions endpoint with only accounts:read scope', async () => {
      setupValidToken('accounts:read');
      
      const response = await request(app)
        .get('/api/v1/accounts/acc-001/transactions')
        .set('Authorization', 'Bearer valid.token')
        .expect(403);
      
      expect(response.body.error).toBe('insufficient_scope');
      expect(response.body.required_scopes).toContain('transactions:read');
    });
    
    test('should allow transactions endpoint with transactions:read scope', async () => {
      setupValidToken('transactions:read');
      
      const response = await request(app)
        .get('/api/v1/accounts/acc-001/transactions')
        .set('Authorization', 'Bearer valid.token')
        .expect(200);
      
      expect(response.body.transactions).toBeDefined();
    });
    
    test('should allow multiple endpoints with multiple scopes', async () => {
      setupValidToken('accounts:read transactions:read balances:read profile:read');
      
      // Test accounts endpoint
      let response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token')
        .expect(200);
      expect(response.body.accounts).toBeDefined();
      
      // Test transactions endpoint
      response = await request(app)
        .get('/api/v1/accounts/acc-001/transactions')
        .set('Authorization', 'Bearer valid.token')
        .expect(200);
      expect(response.body.transactions).toBeDefined();
      
      // Test balance endpoint
      response = await request(app)
        .get('/api/v1/accounts/acc-001/balance')
        .set('Authorization', 'Bearer valid.token')
        .expect(200);
      expect(response.body.balance).toBeDefined();
      
      // Test profile endpoint
      response = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', 'Bearer valid.token')
        .expect(200);
      expect(response.body.customer_id).toBeDefined();
    });
  });
  
  describe('Consent Revocation Impact', () => {
    test('should immediately deny access after consent revocation', async () => {
      // First request succeeds
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
      
      let response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token')
        .expect(200);
      
      expect(response.body.accounts).toBeDefined();
      
      // Consent is revoked
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
      
      // Second request fails
      response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('revoked');
    });
  });
  
  describe('Token Expiration Scenarios', () => {
    test('should deny access when token expires during session', async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Token expires in 1 second
      verifyAccessToken.mockResolvedValueOnce({
        valid: true,
        payload: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: 'accounts:read',
          token_id: 'token-abc',
          exp: currentTime + 1,
          iat: currentTime - 3600
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
      
      // First request succeeds
      await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer expiring.token')
        .expect(200);
      
      // Token has expired
      verifyAccessToken.mockResolvedValueOnce({
        valid: false,
        error: 'token_expired',
        error_description: 'Token has expired'
      });
      
      // Second request fails
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer expiring.token')
        .expect(401);
      
      expect(response.body.error).toBe('invalid_token');
    });
  });
  
  describe('Scope Escalation Prevention', () => {
    test('should prevent access escalation by changing token scopes', async () => {
      // Token claims to have transactions:read but consent only has accounts:read
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: 'accounts:read transactions:read', // Token claims both
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
        .get('/api/v1/accounts/acc-001/transactions')
        .set('Authorization', 'Bearer escalated.token')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('Token scopes exceed consent scopes');
    });
  });
  
  describe('Error Response Consistency', () => {
    test('should return consistent error format for 401 responses', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('error_description');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.error_description).toBe('string');
    });
    
    test('should return consistent error format for 403 responses', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: 'profile:read',
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
        .set('Authorization', 'Bearer valid.token')
        .expect(403);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('error_description');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.error_description).toBe('string');
    });
  });
  
  describe('Security Boundary Isolation', () => {
    test('should not leak information about valid tokens in error messages', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'invalid_token',
        error_description: 'Token signature invalid'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer invalid.token')
        .expect(401);
      
      // Should not reveal internal details
      expect(response.body.error_description).not.toContain('database');
      expect(response.body.error_description).not.toContain('secret');
      expect(response.body.error_description).not.toContain('key');
    });
    
    test('should not reveal consent details for invalid tokens', async () => {
      verifyAccessToken.mockResolvedValue({
        valid: false,
        error: 'invalid_token',
        error_description: 'Invalid token'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer invalid.token')
        .expect(401);
      
      // Should not check consent for invalid token
      expect(query).not.toHaveBeenCalled();
      expect(response.body).not.toHaveProperty('consent_id');
    });
  });
});

// Made with Bob