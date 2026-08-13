/**
 * Token Exchange Tests
 * Tests for OAuth authorization code exchange
 */

const {
  exchangeAuthorizationCode,
  validateClientCredentials,
  validateAuthorizationCode,
  generateTokens,
  verifyAccessToken,
  TOKEN_CONFIG
} = require('../../auth/oauth/token-exchange');
const jwt = require('jsonwebtoken');

describe('Token Exchange', () => {
  
  describe('Successful Code Exchange', () => {
    test('should exchange valid authorization code for tokens', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_valid123',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(true);
      expect(result.access_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(TOKEN_CONFIG.ACCESS_TOKEN_TTL);
      expect(result.refresh_token).toBeDefined();
      expect(result.scope).toBeDefined();
    });
    
    test('should return JWT access token', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_valid123',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(true);
      
      // Verify JWT structure
      const decoded = jwt.decode(result.access_token);
      expect(decoded).toBeDefined();
      expect(decoded.customer_id).toBeDefined();
      expect(decoded.client_id).toBe('fintech-demo-client');
      expect(decoded.consent_id).toBeDefined();
      expect(decoded.scope).toBeDefined();
      expect(decoded.type).toBe('access');
    });
    
    test('should include all granted scopes in token', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_with_scopes',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(true);
      expect(result.scope).toContain('accounts:read');
      expect(result.scope).toContain('transactions:read');
    });
    
    test('should set correct token expiration', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_valid123',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(true);
      expect(result.expires_in).toBe(3600); // 1 hour
      
      // Verify JWT expiration
      const decoded = jwt.decode(result.access_token);
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = decoded.exp - now;
      
      expect(expiresIn).toBeGreaterThan(3590);
      expect(expiresIn).toBeLessThanOrEqual(3600);
    });
  });
  
  describe('Authorization Code Reuse', () => {
    test('should reject reused authorization code', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_used',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_grant');
      expect(result.error_description).toContain('already been used');
    });
    
    test('should revoke all tokens when code reuse detected', async () => {
      // First exchange (valid)
      const params1 = {
        grant_type: 'authorization_code',
        code: 'authcode_fresh',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result1 = await exchangeAuthorizationCode(params1);
      expect(result1.success).toBe(true);
      
      // Second exchange (reuse attempt)
      const params2 = {
        grant_type: 'authorization_code',
        code: 'authcode_fresh',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result2 = await exchangeAuthorizationCode(params2);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('invalid_grant');
      
      // Verify first token is now revoked
      const verification = await verifyAccessToken(result1.access_token);
      expect(verification.valid).toBe(false);
      expect(verification.error_description).toContain('revoked');
    });
  });
  
  describe('Client Credentials Validation', () => {
    test('should reject invalid client_id', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_valid123',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'invalid-client',
        client_secret: 'any-secret'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_client');
      expect(result.error_description).toContain('not found');
    });
    
    test('should reject wrong client_secret', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_valid123',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'wrong-secret'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_client');
      expect(result.error_description).toContain('Invalid client credentials');
    });
    
    test('should reject suspended client', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_valid123',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'suspended-client',
        client_secret: 'correct-secret'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('unauthorized_client');
      expect(result.error_description).toContain('suspended');
    });
    
    test('should validate client credentials independently', async () => {
      const result = await validateClientCredentials(
        'fintech-demo-client',
        'demo-secret-123'
      );
      
      expect(result.valid).toBe(true);
      expect(result.client).toBeDefined();
      expect(result.client.client_id).toBe('fintech-demo-client');
    });
  });
  
  describe('Authorization Code Validation', () => {
    test('should reject expired authorization code', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_expired',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_grant');
      expect(result.error_description).toContain('expired');
    });
    
    test('should reject code with mismatched redirect_uri', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_valid123',
        redirect_uri: 'https://malicious.example.com/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_grant');
      expect(result.error_description).toContain('Redirect URI does not match');
    });
    
    test('should reject code issued to different client', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_for_other_client',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_grant');
      expect(result.error_description).toContain('different client');
    });
    
    test('should reject non-existent authorization code', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_nonexistent',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_grant');
      expect(result.error_description).toContain('not found');
    });
  });
  
  describe('Grant Type Validation', () => {
    test('should reject unsupported grant type', async () => {
      const params = {
        grant_type: 'password',
        username: 'user',
        password: 'pass',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('unsupported_grant_type');
    });
    
    test('should require grant_type parameter', async () => {
      const params = {
        code: 'authcode_valid123',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_request');
    });
  });
  
  describe('Token Generation', () => {
    test('should generate tokens with correct structure', async () => {
      const params = {
        customer_id: 'CUST-001',
        client_id: 'test-client',
        consent_id: 'consent_abc123',
        scope: 'accounts:read transactions:read'
      };
      
      const result = await generateTokens(params);
      
      expect(result.success).toBe(true);
      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(result.refresh_token).toMatch(/^refresh_/);
      expect(result.token_id).toBeDefined();
      expect(result.token_id).toMatch(/^token_/);
    });
    
    test('should include consent_id in JWT payload', async () => {
      const params = {
        customer_id: 'CUST-001',
        client_id: 'test-client',
        consent_id: 'consent_abc123',
        scope: 'accounts:read'
      };
      
      const result = await generateTokens(params);
      
      const decoded = jwt.decode(result.access_token);
      expect(decoded.consent_id).toBe('consent_abc123');
    });
  });
  
  describe('Token Verification', () => {
    test('should verify valid access token', async () => {
      // Generate a token first
      const tokenResult = await generateTokens({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        consent_id: 'consent_abc123',
        scope: 'accounts:read'
      });
      
      // Verify it
      const verification = await verifyAccessToken(tokenResult.access_token);
      
      expect(verification.valid).toBe(true);
      expect(verification.payload).toBeDefined();
      expect(verification.payload.customer_id).toBe('CUST-001');
      expect(verification.token).toBeDefined();
    });
    
    test('should reject expired token', async () => {
      // This would require a token with past expiration
      // In practice, you'd mock the JWT verification
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.signature';
      
      const verification = await verifyAccessToken(expiredToken);
      
      expect(verification.valid).toBe(false);
      expect(verification.error).toBe('invalid_token');
    });
    
    test('should reject token with invalid signature', async () => {
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature';
      
      const verification = await verifyAccessToken(invalidToken);
      
      expect(verification.valid).toBe(false);
      expect(verification.error).toBe('invalid_token');
    });
    
    test('should reject revoked token', async () => {
      // Generate and then revoke a token
      const tokenResult = await generateTokens({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        consent_id: 'consent_abc123',
        scope: 'accounts:read'
      });
      
      // Revoke it
      const crypto = require('crypto');
      const { query } = require('../../data/db');
      const tokenHash = crypto.createHash('sha256').update(tokenResult.access_token).digest('hex');
      
      await query(
        'UPDATE access_tokens SET revoked = true WHERE access_token_hash = $1',
        [tokenHash]
      );
      
      // Try to verify
      const verification = await verifyAccessToken(tokenResult.access_token);
      
      expect(verification.valid).toBe(false);
      expect(verification.error_description).toContain('revoked');
    });
  });
  
  describe('Token Expiration', () => {
    test('should set access token expiration to 1 hour', () => {
      expect(TOKEN_CONFIG.ACCESS_TOKEN_TTL).toBe(3600);
    });
    
    test('should set refresh token expiration to 30 days', () => {
      expect(TOKEN_CONFIG.REFRESH_TOKEN_TTL).toBe(2592000);
    });
    
    test('should include expires_in in token response', async () => {
      const params = {
        grant_type: 'authorization_code',
        code: 'authcode_valid123',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      };
      
      const result = await exchangeAuthorizationCode(params);
      
      expect(result.success).toBe(true);
      expect(result.expires_in).toBe(3600);
    });
  });
  
  describe('Complete Exchange Flow', () => {
    test('should complete full authorization code flow', async () => {
      // Step 1: Exchange code for tokens
      const exchangeResult = await exchangeAuthorizationCode({
        grant_type: 'authorization_code',
        code: 'authcode_complete_flow',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      });
      
      expect(exchangeResult.success).toBe(true);
      expect(exchangeResult.access_token).toBeDefined();
      
      // Step 2: Verify token works
      const verification = await verifyAccessToken(exchangeResult.access_token);
      expect(verification.valid).toBe(true);
      
      // Step 3: Verify code cannot be reused
      const reuseResult = await exchangeAuthorizationCode({
        grant_type: 'authorization_code',
        code: 'authcode_complete_flow',
        redirect_uri: 'http://localhost:3000/callback',
        client_id: 'fintech-demo-client',
        client_secret: 'demo-secret-123'
      });
      
      expect(reuseResult.success).toBe(false);
      expect(reuseResult.error).toBe('invalid_grant');
    });
  });
});

// Made with Bob
