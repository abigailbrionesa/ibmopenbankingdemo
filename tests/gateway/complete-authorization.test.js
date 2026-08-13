/**
 * Complete Authorization Tests
 * Tests the full authorization chain: token + scope + consent
 */

const request = require('supertest');
const express = require('express');
const { Pool } = require('pg');
const {
  completeAuthorization,
  completeAuthorizationWithScope,
  completeAuthorizationWithLogging,
  validateAuthorizationContext,
  getAuthorizationDetails,
  createAuthorizationChain
} = require('../../gateway/policies/complete-authorization');

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

const { verifyAccessToken } = require('../../auth/oauth/token-exchange');

describe('Complete Authorization', () => {
  let app;
  let pool;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create test app
    app = express();
    app.use(express.json());
    
    // Get pool instance
    pool = new Pool();
  });
  
  describe('Happy Path - Valid Token + Scope + Active Consent', () => {
    test('should allow access with valid token, correct scope, and active consent', async () => {
      // Mock token verification
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
      
      // Mock consent query
      pool.query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'approved',
          expires_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          granted_scopes: 'accounts:read'
        }]
      });
      
      // Apply complete authorization
      app.get('/api/v1/accounts',
        ...completeAuthorization(),
        (req, res) => {
          res.json({
            success: true,
            accounts: [{ id: 'acc-1', balance: 1000 }]
          });
        }
      );
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.accounts).toBeDefined();
    });
  });
  
  describe('Missing Consent Scenarios', () => {
    test('should return 403 when consent not found', async () => {
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
      
      // Mock consent not found
      pool.query.mockResolvedValue({
        rows: []
      });
      
      app.get('/api/v1/accounts',
        ...completeAuthorization(),
        (req, res) => res.json({ success: true })
      );
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('Consent not found');
    });
    
    test('should return 403 when token has no consent_id', async () => {
      const mockPayload = {
        customer_id: 'cust-123',
        client_id: 'client-456',
        // No consent_id
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
      
      app.get('/api/v1/accounts',
        ...completeAuthorization(),
        (req, res) => res.json({ success: true })
      );
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('not associated with a consent');
    });
  });
  
  describe('Expired Consent Scenarios', () => {
    test('should return 403 when consent has expired', async () => {
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
      
      // Mock expired consent
      pool.query.mockResolvedValueOnce({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'approved',
          expires_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
          granted_scopes: 'accounts:read'
        }]
      }).mockResolvedValueOnce({
        // Mock UPDATE query to mark as expired
        rowCount: 1
      });
      
      app.get('/api/v1/accounts',
        ...completeAuthorization(),
        (req, res) => res.json({ success: true })
      );
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('expired');
      expect(response.body.status).toBe('expired');
    });
    
    test('should return 403 when consent status is expired', async () => {
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
      
      // Mock consent with expired status
      pool.query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'expired',
          expires_at: new Date(Date.now() - 86400000).toISOString(),
          granted_scopes: 'accounts:read'
        }]
      });
      
      app.get('/api/v1/accounts',
        ...completeAuthorization(),
        (req, res) => res.json({ success: true })
      );
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('expired');
    });
  });
  
  describe('Revoked Consent Scenarios', () => {
    test('should return 403 when consent has been revoked', async () => {
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
      
      // Mock revoked consent
      pool.query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'revoked',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'accounts:read'
        }]
      });
      
      app.get('/api/v1/accounts',
        ...completeAuthorization(),
        (req, res) => res.json({ success: true })
      );
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('revoked');
      expect(response.body.status).toBe('revoked');
    });
  });
  
  describe('Scope Mismatch Scenarios', () => {
    test('should return 403 when token scope exceeds consent scope', async () => {
      const mockPayload = {
        customer_id: 'cust-123',
        client_id: 'client-456',
        consent_id: 'consent-789',
        scope: 'accounts:read transactions:read', // Token has more scopes
        token_id: 'token-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };
      
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
        token: { id: 'token-abc' }
      });
      
      // Mock consent with fewer scopes
      pool.query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'approved',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'accounts:read' // Only accounts:read
        }]
      });
      
      app.get('/api/v1/accounts',
        ...completeAuthorization(),
        (req, res) => res.json({ success: true })
      );
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(403);
      
      expect(response.body.error).toBe('forbidden');
      expect(response.body.error_description).toContain('exceed consent scopes');
      expect(response.body.unauthorized_scopes).toContain('transactions:read');
    });
  });
  
  describe('Authorization Context Validation', () => {
    test('should validate complete authorization context', () => {
      const req = {
        oauth_token: {
          customer_id: 'cust-123',
          scope: 'accounts:read'
        },
        token_introspection: {
          active: true
        },
        consent: {
          status: 'approved'
        }
      };
      
      const result = validateAuthorizationContext(req);
      
      expect(result.valid).toBe(true);
      expect(result.checks.token).toBe(true);
      expect(result.checks.introspection).toBe(true);
      expect(result.checks.consent).toBe(true);
      expect(result.checks.scope).toBe(true);
    });
    
    test('should detect missing token', () => {
      const req = {
        token_introspection: { active: true },
        consent: { status: 'approved' }
      };
      
      const result = validateAuthorizationContext(req);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing OAuth token');
    });
    
    test('should detect missing consent', () => {
      const req = {
        oauth_token: { customer_id: 'cust-123', scope: 'accounts:read' },
        token_introspection: { active: true }
      };
      
      const result = validateAuthorizationContext(req);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing consent validation');
    });
  });
  
  describe('Authorization Details', () => {
    test('should extract authorization details from request', () => {
      const req = {
        oauth_token: {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          token_id: 'token-abc',
          scope: 'accounts:read transactions:read'
        },
        consent: {
          granted_scopes: 'accounts:read transactions:read',
          status: 'approved',
          expires_at: '2026-12-31T23:59:59Z'
        },
        token_introspection: {
          active: true
        }
      };
      
      const details = getAuthorizationDetails(req);
      
      expect(details).toBeDefined();
      expect(details.customer_id).toBe('cust-123');
      expect(details.client_id).toBe('client-456');
      expect(details.consent_id).toBe('consent-789');
      expect(details.token_scopes).toEqual(['accounts:read', 'transactions:read']);
      expect(details.consent_scopes).toEqual(['accounts:read', 'transactions:read']);
      expect(details.token_active).toBe(true);
    });
    
    test('should return null when authorization incomplete', () => {
      const req = {
        oauth_token: { customer_id: 'cust-123' }
        // Missing consent
      };
      
      const details = getAuthorizationDetails(req);
      
      expect(details).toBeNull();
    });
  });
  
  describe('Custom Authorization Chains', () => {
    test('should create custom chain with all checks', async () => {
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
      
      pool.query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'approved',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'accounts:read'
        }]
      });
      
      const chain = createAuthorizationChain({
        requireToken: true,
        requireConsent: true,
        requireScope: true,
        logging: false
      });
      
      app.get('/api/v1/accounts',
        ...chain,
        (req, res) => res.json({ success: true })
      );
      
      await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(200);
    });
    
    test('should create chain with explicit scope', async () => {
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
      
      pool.query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'approved',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'accounts:read'
        }]
      });
      
      const chain = createAuthorizationChain({
        explicitScope: 'accounts:read'
      });
      
      app.get('/api/v1/accounts',
        ...chain,
        (req, res) => res.json({ success: true })
      );
      
      await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(200);
    });
  });
  
  describe('Integration Scenarios', () => {
    test('should enforce complete authorization for transactions endpoint', async () => {
      const mockPayload = {
        customer_id: 'cust-123',
        client_id: 'client-456',
        consent_id: 'consent-789',
        scope: 'transactions:read',
        token_id: 'token-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      };
      
      verifyAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
        token: { id: 'token-abc' }
      });
      
      pool.query.mockResolvedValue({
        rows: [{
          consent_id: 'consent-789',
          customer_id: 'cust-123',
          client_id: 'client-456',
          status: 'approved',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          granted_scopes: 'transactions:read'
        }]
      });
      
      app.get('/api/v1/accounts/:account_id/transactions',
        ...completeAuthorization(),
        (req, res) => {
          res.json({
            success: true,
            transactions: []
          });
        }
      );
      
      const response = await request(app)
        .get('/api/v1/accounts/acc-123/transactions')
        .set('Authorization', 'Bearer valid.token.here')
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
  });
});

// Made with Bob
