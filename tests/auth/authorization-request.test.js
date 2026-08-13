/**
 * OAuth Authorization Request Tests
 * Tests for OAuth 2.0 authorization endpoint
 */

const {
  handleAuthorizationRequest,
  validateAuthorizationRequest,
  validateClientAndRedirectUri,
  validateScopesAgainstClient,
  buildErrorRedirectUrl,
  SUPPORTED_RESPONSE_TYPES,
  SUPPORTED_SCOPES
} = require('../../auth/oauth/authorization-request');

describe('OAuth Authorization Request', () => {
  
  describe('Request Parameter Validation', () => {
    test('should validate complete authorization request', () => {
      const params = {
        client_id: 'fintech-demo-client',
        redirect_uri: 'https://app.example.com/callback',
        response_type: 'code',
        scope: 'accounts:read transactions:read',
        state: 'random_state_123'
      };
      
      const result = validateAuthorizationRequest(params);
      
      expect(result.valid).toBe(true);
      expect(result.errors.filter(e => e.severity !== 'warning')).toHaveLength(0);
    });
    
    test('should reject missing client_id', () => {
      const params = {
        redirect_uri: 'https://app.example.com/callback',
        response_type: 'code',
        scope: 'accounts:read'
      };
      
      const result = validateAuthorizationRequest(params);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          error: 'invalid_request',
          error_description: 'client_id is required'
        })
      );
    });
    
    test('should reject missing redirect_uri', () => {
      const params = {
        client_id: 'test-client',
        response_type: 'code',
        scope: 'accounts:read'
      };
      
      const result = validateAuthorizationRequest(params);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          error: 'invalid_request',
          error_description: 'redirect_uri is required'
        })
      );
    });
    
    test('should reject unsupported response_type', () => {
      const params = {
        client_id: 'test-client',
        redirect_uri: 'https://app.example.com/callback',
        response_type: 'token',
        scope: 'accounts:read'
      };
      
      const result = validateAuthorizationRequest(params);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          error: 'unsupported_response_type'
        })
      );
    });
    
    test('should reject invalid scopes', () => {
      const params = {
        client_id: 'test-client',
        redirect_uri: 'https://app.example.com/callback',
        response_type: 'code',
        scope: 'accounts:read invalid:scope'
      };
      
      const result = validateAuthorizationRequest(params);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          error: 'invalid_scope',
          invalid_scopes: ['invalid:scope']
        })
      );
    });
    
    test('should warn about missing state parameter', () => {
      const params = {
        client_id: 'test-client',
        redirect_uri: 'https://app.example.com/callback',
        response_type: 'code',
        scope: 'accounts:read'
      };
      
      const result = validateAuthorizationRequest(params);
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          error_description: expect.stringContaining('state parameter is recommended')
        })
      );
    });
  });
  
  describe('Client and Redirect URI Validation', () => {
    test('should validate registered client with matching redirect URI', async () => {
      const result = await validateClientAndRedirectUri(
        'fintech-demo-client',
        'http://localhost:3000/callback'
      );
      
      expect(result.valid).toBe(true);
      expect(result.client).toBeDefined();
      expect(result.client.client_id).toBe('fintech-demo-client');
      expect(result.client.allowed_scopes).toBeDefined();
    });
    
    test('should reject invalid client_id', async () => {
      const result = await validateClientAndRedirectUri(
        'invalid-client-id',
        'https://app.example.com/callback'
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_client');
      expect(result.error_description).toContain('Client not found');
    });
    
    test('should reject mismatched redirect_uri', async () => {
      const result = await validateClientAndRedirectUri(
        'fintech-demo-client',
        'https://malicious.example.com/callback'
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_request');
      expect(result.error_description).toContain('redirect_uri does not match');
      expect(result.registered_uris).toBeDefined();
    });
    
    test('should reject suspended client', async () => {
      const result = await validateClientAndRedirectUri(
        'suspended-client',
        'https://suspended.example.com/callback'
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('unauthorized_client');
      expect(result.error_description).toContain('suspended');
    });
  });
  
  describe('Scope Validation Against Client', () => {
    test('should approve scopes within client allowance', () => {
      const requestedScopes = ['accounts:read', 'transactions:read'];
      const allowedScopes = ['accounts:read', 'transactions:read', 'balances:read'];
      
      const result = validateScopesAgainstClient(requestedScopes, allowedScopes);
      
      expect(result.valid).toBe(true);
      expect(result.approved_scopes).toEqual(requestedScopes);
    });
    
    test('should reject excessive scopes', () => {
      const requestedScopes = ['accounts:read', 'transactions:read', 'profile:read'];
      const allowedScopes = ['accounts:read', 'transactions:read'];
      
      const result = validateScopesAgainstClient(requestedScopes, allowedScopes);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_scope');
      expect(result.excessive_scopes).toContain('profile:read');
      expect(result.allowed_scopes).toEqual(allowedScopes);
    });
    
    test('should reject all scopes if none are allowed', () => {
      const requestedScopes = ['accounts:read'];
      const allowedScopes = ['balances:read'];
      
      const result = validateScopesAgainstClient(requestedScopes, allowedScopes);
      
      expect(result.valid).toBe(false);
      expect(result.excessive_scopes).toContain('accounts:read');
    });
  });
  
  describe('State Parameter Preservation', () => {
    test('should preserve state through authorization flow', async () => {
      const params = {
        client_id: 'fintech-demo-client',
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'code',
        scope: 'accounts:read',
        state: 'csrf_protection_token_123'
      };
      
      const result = await handleAuthorizationRequest(params, 'CUST-001');
      
      expect(result.success).toBe(true);
      expect(result.state).toBe('csrf_protection_token_123');
    });
    
    test('should include state in error redirect', () => {
      const redirectUri = 'https://app.example.com/callback';
      const error = 'invalid_scope';
      const errorDescription = 'Requested scope not allowed';
      const state = 'state_123';
      
      const errorUrl = buildErrorRedirectUrl(redirectUri, error, errorDescription, state);
      
      expect(errorUrl).toContain('error=invalid_scope');
      expect(errorUrl).toContain('error_description=');
      expect(errorUrl).toContain('state=state_123');
    });
    
    test('should build error redirect without state if not provided', () => {
      const redirectUri = 'https://app.example.com/callback';
      const error = 'access_denied';
      const errorDescription = 'User denied consent';
      
      const errorUrl = buildErrorRedirectUrl(redirectUri, error, errorDescription);
      
      expect(errorUrl).toContain('error=access_denied');
      expect(errorUrl).not.toContain('state=');
    });
  });
  
  describe('Complete Authorization Request Flow', () => {
    test('should process valid authorization request', async () => {
      const params = {
        client_id: 'fintech-demo-client',
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'code',
        scope: 'accounts:read transactions:read',
        state: 'random_state'
      };
      
      const result = await handleAuthorizationRequest(params, 'CUST-001');
      
      expect(result.success).toBe(true);
      expect(result.auth_request_id).toBeDefined();
      expect(result.auth_request_id).toMatch(/^authreq_/);
      expect(result.client).toBeDefined();
      expect(result.client.name).toBe('Fintech Demo Application');
      expect(result.requested_scopes).toEqual(['accounts:read', 'transactions:read']);
      expect(result.redirect_uri).toBe('http://localhost:3000/callback');
      expect(result.state).toBe('random_state');
      expect(result.expires_at).toBeDefined();
    });
    
    test('should reject request with invalid client', async () => {
      const params = {
        client_id: 'invalid-client',
        redirect_uri: 'https://app.example.com/callback',
        response_type: 'code',
        scope: 'accounts:read',
        state: 'state_123'
      };
      
      const result = await handleAuthorizationRequest(params, 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_client');
      expect(result.should_redirect).toBe(false);
    });
    
    test('should reject request with mismatched redirect URI', async () => {
      const params = {
        client_id: 'fintech-demo-client',
        redirect_uri: 'https://malicious.example.com/callback',
        response_type: 'code',
        scope: 'accounts:read',
        state: 'state_123'
      };
      
      const result = await handleAuthorizationRequest(params, 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_request');
      expect(result.error_description).toContain('redirect_uri does not match');
      expect(result.should_redirect).toBe(false);
    });
    
    test('should reject request with excessive scopes', async () => {
      const params = {
        client_id: 'budget-tracker-app',
        redirect_uri: 'https://budget.example.com/callback',
        response_type: 'code',
        scope: 'accounts:read transactions:read profile:read',
        state: 'state_123'
      };
      
      const result = await handleAuthorizationRequest(params, 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_scope');
      expect(result.excessive_scopes).toContain('transactions:read');
      expect(result.excessive_scopes).toContain('profile:read');
      expect(result.should_redirect).toBe(true);
    });
  });
  
  describe('Integration with Consent Flow', () => {
    test('should create authorization context for consent', async () => {
      const params = {
        client_id: 'fintech-demo-client',
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'code',
        scope: 'accounts:read',
        state: 'state_123'
      };
      
      const result = await handleAuthorizationRequest(params, 'CUST-001');
      
      expect(result.success).toBe(true);
      expect(result.auth_request_id).toBeDefined();
      
      // Authorization context should be ready for consent page
      expect(result.client.name).toBeDefined();
      expect(result.requested_scopes).toBeDefined();
      expect(result.redirect_uri).toBeDefined();
    });
    
    test('should include expiration for authorization context', async () => {
      const params = {
        client_id: 'fintech-demo-client',
        redirect_uri: 'http://localhost:3000/callback',
        response_type: 'code',
        scope: 'accounts:read',
        state: 'state_123'
      };
      
      const result = await handleAuthorizationRequest(params, 'CUST-001');
      
      expect(result.success).toBe(true);
      expect(result.expires_at).toBeDefined();
      
      const expiresAt = new Date(result.expires_at);
      const now = new Date();
      const diffMinutes = (expiresAt - now) / (1000 * 60);
      
      // Should expire in approximately 10 minutes
      expect(diffMinutes).toBeGreaterThan(9);
      expect(diffMinutes).toBeLessThan(11);
    });
  });
});

// Made with Bob
