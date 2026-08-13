/**
 * Gateway Scope Enforcement Tests
 * Tests endpoint-specific scope requirements
 */

const request = require('supertest');
const express = require('express');
const {
  SCOPES,
  ENDPOINT_SCOPE_MAP,
  enforceEndpointScopes,
  requireEndpointScope,
  getRequiredScopes,
  hasRequiredScope,
  logAuthorizationDenial,
  addEndpointScopeMapping,
  getEndpointScopeMappings,
  normalizeEndpointPath,
  isValidScope,
  parseScopes,
  scopeGrantsAccessTo
} = require('../../gateway/policies/scope-enforcement');

describe('Scope Enforcement', () => {
  let app;
  let consoleWarnSpy;
  
  beforeEach(() => {
    // Create test app
    app = express();
    app.use(express.json());
    
    // Spy on console.warn for authorization denial logs
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });
  
  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });
  
  describe('normalizeEndpointPath', () => {
    test('should normalize UUID in path', () => {
      const path = '/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000';
      const normalized = normalizeEndpointPath(path);
      
      expect(normalized).toBe('/api/v1/accounts/:account_id');
    });
    
    test('should normalize custom ID format', () => {
      const path = '/api/v1/accounts/acc-abc123';
      const normalized = normalizeEndpointPath(path);
      
      expect(normalized).toBe('/api/v1/accounts/:account_id');
    });
    
    test('should normalize transaction ID', () => {
      const path = '/api/v1/accounts/acc-123/transactions/txn-456';
      const normalized = normalizeEndpointPath(path);
      
      expect(normalized).toBe('/api/v1/accounts/:account_id/transactions/:transaction_id');
    });
    
    test('should normalize numeric IDs', () => {
      const path = '/api/v1/accounts/12345';
      const normalized = normalizeEndpointPath(path);
      
      expect(normalized).toBe('/api/v1/accounts/:id');
    });
  });
  
  describe('getRequiredScopes', () => {
    test('should return scopes for account list endpoint', () => {
      const scopes = getRequiredScopes('GET', '/api/v1/accounts');
      
      expect(scopes).toEqual(['accounts:read']);
    });
    
    test('should return scopes for account detail endpoint', () => {
      const scopes = getRequiredScopes('GET', '/api/v1/accounts/acc-123');
      
      expect(scopes).toEqual(['accounts:read']);
    });
    
    test('should return scopes for transactions endpoint', () => {
      const scopes = getRequiredScopes('GET', '/api/v1/accounts/acc-123/transactions');
      
      expect(scopes).toEqual(['transactions:read']);
    });
    
    test('should return scopes for balance endpoint', () => {
      const scopes = getRequiredScopes('GET', '/api/v1/accounts/acc-123/balance');
      
      expect(scopes).toEqual(['balances:read', 'accounts:read']);
    });
    
    test('should return null for unmapped endpoint', () => {
      const scopes = getRequiredScopes('GET', '/api/v1/unknown');
      
      expect(scopes).toBeNull();
    });
  });
  
  describe('hasRequiredScope', () => {
    test('should return true when token has required scope', () => {
      const tokenScopes = ['accounts:read', 'profile:read'];
      const requiredScopes = ['accounts:read'];
      
      expect(hasRequiredScope(tokenScopes, requiredScopes)).toBe(true);
    });
    
    test('should return true when token has one of multiple required scopes', () => {
      const tokenScopes = ['accounts:read'];
      const requiredScopes = ['balances:read', 'accounts:read'];
      
      expect(hasRequiredScope(tokenScopes, requiredScopes)).toBe(true);
    });
    
    test('should return false when token lacks required scope', () => {
      const tokenScopes = ['accounts:read'];
      const requiredScopes = ['transactions:read'];
      
      expect(hasRequiredScope(tokenScopes, requiredScopes)).toBe(false);
    });
    
    test('should return true when no scopes required', () => {
      const tokenScopes = ['accounts:read'];
      const requiredScopes = [];
      
      expect(hasRequiredScope(tokenScopes, requiredScopes)).toBe(true);
    });
  });
  
  describe('enforceEndpointScopes middleware', () => {
    beforeEach(() => {
      // Mock OAuth middleware - attach token to request
      app.use((req, res, next) => {
        if (req.headers['x-mock-token']) {
          req.oauth_token = {
            customer_id: 'cust-123',
            client_id: 'client-456',
            consent_id: 'consent-789',
            scope: req.headers['x-mock-token']
          };
        }
        next();
      });
      
      // Apply scope enforcement
      app.use(enforceEndpointScopes);
      
      // Define test routes
      app.get('/api/v1/accounts', (req, res) => {
        res.json({ success: true, endpoint: 'accounts' });
      });
      
      app.get('/api/v1/accounts/:account_id', (req, res) => {
        res.json({ success: true, endpoint: 'account_detail' });
      });
      
      app.get('/api/v1/accounts/:account_id/transactions', (req, res) => {
        res.json({ success: true, endpoint: 'transactions' });
      });
      
      app.get('/api/v1/accounts/:account_id/balance', (req, res) => {
        res.json({ success: true, endpoint: 'balance' });
      });
    });
    
    test('should allow access to accounts endpoint with accounts:read scope', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('x-mock-token', 'accounts:read')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.endpoint).toBe('accounts');
    });
    
    test('should allow access to account detail with accounts:read scope', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/acc-123')
        .set('x-mock-token', 'accounts:read')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.endpoint).toBe('account_detail');
    });
    
    test('should deny access to transactions endpoint with only accounts:read scope', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/acc-123/transactions')
        .set('x-mock-token', 'accounts:read')
        .expect(403);
      
      expect(response.body.error).toBe('insufficient_scope');
      expect(response.body.required_scopes).toEqual(['transactions:read']);
      expect(response.body.granted_scopes).toEqual(['accounts:read']);
      
      // Verify denial was logged
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls[0][0];
      expect(logCall).toContain('authorization_denied');
      expect(logCall).toContain('insufficient_scope');
    });
    
    test('should allow access to transactions endpoint with transactions:read scope', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/acc-123/transactions')
        .set('x-mock-token', 'transactions:read')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.endpoint).toBe('transactions');
    });
    
    test('should allow access to balance with balances:read scope', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/acc-123/balance')
        .set('x-mock-token', 'balances:read')
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
    
    test('should allow access to balance with accounts:read scope (fallback)', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/acc-123/balance')
        .set('x-mock-token', 'accounts:read')
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
    
    test('should allow access with multiple scopes', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/acc-123/transactions')
        .set('x-mock-token', 'accounts:read transactions:read')
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });
    
    test('should return 500 when OAuth middleware not applied', async () => {
      // Create app without OAuth middleware
      const testApp = express();
      testApp.use(enforceEndpointScopes);
      testApp.get('/api/v1/accounts', (req, res) => {
        res.json({ success: true });
      });
      
      const response = await request(testApp)
        .get('/api/v1/accounts')
        .expect(500);
      
      expect(response.body.error).toBe('server_error');
      expect(response.body.error_description).toContain('OAuth middleware not applied');
    });
  });
  
  describe('requireEndpointScope middleware', () => {
    test('should enforce single scope requirement', async () => {
      app.use((req, res, next) => {
        req.oauth_token = {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: req.headers['x-mock-token'] || ''
        };
        next();
      });
      
      app.get('/test',
        requireEndpointScope('accounts:read'),
        (req, res) => res.json({ success: true })
      );
      
      // With correct scope
      await request(app)
        .get('/test')
        .set('x-mock-token', 'accounts:read')
        .expect(200);
      
      // Without correct scope
      const response = await request(app)
        .get('/test')
        .set('x-mock-token', 'profile:read')
        .expect(403);
      
      expect(response.body.error).toBe('insufficient_scope');
    });
    
    test('should enforce multiple scope options', async () => {
      app.use((req, res, next) => {
        req.oauth_token = {
          customer_id: 'cust-123',
          client_id: 'client-456',
          consent_id: 'consent-789',
          scope: req.headers['x-mock-token'] || ''
        };
        next();
      });
      
      app.get('/test',
        requireEndpointScope(['balances:read', 'accounts:read']),
        (req, res) => res.json({ success: true })
      );
      
      // With first option
      await request(app)
        .get('/test')
        .set('x-mock-token', 'balances:read')
        .expect(200);
      
      // With second option
      await request(app)
        .get('/test')
        .set('x-mock-token', 'accounts:read')
        .expect(200);
      
      // Without any option
      await request(app)
        .get('/test')
        .set('x-mock-token', 'profile:read')
        .expect(403);
    });
  });
  
  describe('logAuthorizationDenial', () => {
    test('should log denial with all details', () => {
      const details = {
        method: 'GET',
        path: '/api/v1/accounts/acc-123/transactions',
        customer_id: 'cust-123',
        client_id: 'client-456',
        consent_id: 'consent-789',
        granted_scopes: ['accounts:read'],
        required_scopes: ['transactions:read'],
        ip_address: '192.168.1.1',
        user_agent: 'TestAgent/1.0'
      };
      
      logAuthorizationDenial(details);
      
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls[0][0];
      const logEntry = JSON.parse(logCall.replace('Authorization Denied: ', ''));
      
      expect(logEntry.event).toBe('authorization_denied');
      expect(logEntry.reason).toBe('insufficient_scope');
      expect(logEntry.customer_id).toBe('cust-123');
      expect(logEntry.granted_scopes).toEqual(['accounts:read']);
      expect(logEntry.required_scopes).toEqual(['transactions:read']);
    });
  });
  
  describe('Scope Mapping Management', () => {
    test('should add custom endpoint mapping', () => {
      addEndpointScopeMapping('POST', '/api/v1/custom', ['custom:write']);
      
      const scopes = getRequiredScopes('POST', '/api/v1/custom');
      expect(scopes).toEqual(['custom:write']);
    });
    
    test('should get all endpoint mappings', () => {
      const mappings = getEndpointScopeMappings();
      
      expect(mappings).toHaveProperty('GET /api/v1/accounts');
      expect(mappings['GET /api/v1/accounts']).toEqual(['accounts:read']);
    });
  });
  
  describe('Scope Utilities', () => {
    test('should validate scope format', () => {
      expect(isValidScope('accounts:read')).toBe(true);
      expect(isValidScope('transactions:write')).toBe(true);
      expect(isValidScope('invalid')).toBe(false);
      expect(isValidScope('invalid:scope:format')).toBe(false);
      expect(isValidScope('INVALID:READ')).toBe(false);
    });
    
    test('should parse scope string', () => {
      expect(parseScopes('accounts:read transactions:read')).toEqual([
        'accounts:read',
        'transactions:read'
      ]);
      
      expect(parseScopes('  accounts:read  ')).toEqual(['accounts:read']);
      expect(parseScopes('')).toEqual([]);
      expect(parseScopes(null)).toEqual([]);
    });
    
    test('should check if scope grants access to resource', () => {
      expect(scopeGrantsAccessTo('accounts:read', 'accounts')).toBe(true);
      expect(scopeGrantsAccessTo('transactions:read', 'transactions')).toBe(true);
      expect(scopeGrantsAccessTo('accounts:read', 'transactions')).toBe(false);
    });
  });
  
  describe('Integration Scenarios', () => {
    beforeEach(() => {
      app.use((req, res, next) => {
        if (req.headers['authorization']) {
          const token = req.headers['authorization'].replace('Bearer ', '');
          req.oauth_token = {
            customer_id: 'cust-123',
            client_id: 'client-456',
            consent_id: 'consent-789',
            scope: token
          };
        }
        next();
      });
      
      app.use(enforceEndpointScopes);
      
      app.get('/api/v1/accounts', (req, res) => {
        res.json({ accounts: [] });
      });
      
      app.get('/api/v1/accounts/:account_id/transactions', (req, res) => {
        res.json({ transactions: [] });
      });
    });
    
    test('should enforce 403 not 401 for wrong scope', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/acc-123/transactions')
        .set('Authorization', 'Bearer accounts:read')
        .expect(403);
      
      expect(response.body.error).toBe('insufficient_scope');
      expect(response.status).not.toBe(401);
    });
    
    test('should allow accounts endpoint with accounts:read', async () => {
      await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer accounts:read')
        .expect(200);
    });
    
    test('should deny transactions endpoint with only accounts:read', async () => {
      await request(app)
        .get('/api/v1/accounts/acc-123/transactions')
        .set('Authorization', 'Bearer accounts:read')
        .expect(403);
    });
    
    test('should allow transactions endpoint with transactions:read', async () => {
      await request(app)
        .get('/api/v1/accounts/acc-123/transactions')
        .set('Authorization', 'Bearer transactions:read')
        .expect(200);
    });
    
    test('should allow all endpoints with all scopes', async () => {
      const allScopes = 'accounts:read transactions:read balances:read profile:read';
      
      await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${allScopes}`)
        .expect(200);
      
      await request(app)
        .get('/api/v1/accounts/acc-123/transactions')
        .set('Authorization', `Bearer ${allScopes}`)
        .expect(200);
    });
  });
  
  describe('SCOPES constant', () => {
    test('should define all required scopes', () => {
      expect(SCOPES.ACCOUNTS_READ).toBe('accounts:read');
      expect(SCOPES.TRANSACTIONS_READ).toBe('transactions:read');
      expect(SCOPES.BALANCES_READ).toBe('balances:read');
      expect(SCOPES.PROFILE_READ).toBe('profile:read');
    });
  });
});

// Made with Bob
