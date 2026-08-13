/**
 * OAuth Client Registration Tests
 * Tests for fintech application registration functionality
 */

const { registerClient, validateRedirectUri, validateScopes, SUPPORTED_SCOPES } = require('../../auth/oauth/client-registration');

describe('OAuth Client Registration', () => {
  
  describe('Valid Registration', () => {
    test('should successfully register a fintech app with accounts.read and transactions.read', async () => {
      const registration = {
        name: 'Test Fintech App',
        redirect_uris: ['https://app.example.com/callback'],
        requested_scopes: ['accounts:read', 'transactions:read'],
        description: 'Test fintech application',
        contact_email: 'dev@example.com'
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(true);
      expect(result.client_id).toBeDefined();
      expect(result.client_id).toMatch(/^client_[a-f0-9]{32}$/);
      expect(result.client_secret).toBeDefined();
      expect(result.client_secret).toHaveLength(43); // base64url encoded 32 bytes
      expect(result.status).toBe('active');
      expect(result.name).toBe('Test Fintech App');
      expect(result.allowed_scopes).toEqual(['accounts:read', 'transactions:read']);
      expect(result.redirect_uris).toEqual(['https://app.example.com/callback']);
      expect(result.warning).toContain('Store client_secret securely');
    });
    
    test('should register with all supported scopes', async () => {
      const registration = {
        name: 'Full Access App',
        redirect_uris: ['https://app.example.com/callback'],
        requested_scopes: SUPPORTED_SCOPES
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(true);
      expect(result.allowed_scopes).toEqual(SUPPORTED_SCOPES);
    });
    
    test('should register with multiple redirect URIs', async () => {
      const registration = {
        name: 'Multi-URI App',
        redirect_uris: [
          'https://app.example.com/callback',
          'https://app.example.com/oauth/callback',
          'https://staging.example.com/callback'
        ],
        requested_scopes: ['accounts:read']
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(true);
      expect(result.redirect_uris).toHaveLength(3);
    });
    
    test('should allow localhost redirect URI in development', async () => {
      process.env.NODE_ENV = 'development';
      
      const registration = {
        name: 'Dev App',
        redirect_uris: ['http://localhost:3000/callback'],
        requested_scopes: ['accounts:read']
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('Invalid Redirect URI', () => {
    test('should reject HTTP redirect URI in production', async () => {
      process.env.NODE_ENV = 'production';
      
      const registration = {
        name: 'Insecure App',
        redirect_uris: ['http://app.example.com/callback'],
        requested_scopes: ['accounts:read']
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid redirect URI');
      expect(result.invalid_uris).toContain('http://app.example.com/callback');
    });
    
    test('should reject redirect URI with fragment', async () => {
      const registration = {
        name: 'Fragment App',
        redirect_uris: ['https://app.example.com/callback#fragment'],
        requested_scopes: ['accounts:read']
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid redirect URI');
    });
    
    test('should reject malformed redirect URI', async () => {
      const registration = {
        name: 'Malformed App',
        redirect_uris: ['not-a-valid-url'],
        requested_scopes: ['accounts:read']
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid redirect URI');
    });
    
    test('should reject empty redirect URIs array', async () => {
      const registration = {
        name: 'No URI App',
        redirect_uris: [],
        requested_scopes: ['accounts:read']
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one redirect URI is required');
    });
  });
  
  describe('Unsupported Scopes', () => {
    test('should reject unsupported scope', async () => {
      const registration = {
        name: 'Invalid Scope App',
        redirect_uris: ['https://app.example.com/callback'],
        requested_scopes: ['accounts:read', 'invalid:scope']
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported scopes');
      expect(result.invalid_scopes).toContain('invalid:scope');
    });
    
    test('should reject multiple unsupported scopes', async () => {
      const registration = {
        name: 'Multiple Invalid App',
        redirect_uris: ['https://app.example.com/callback'],
        requested_scopes: ['accounts:read', 'invalid:scope', 'another:invalid']
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported scopes');
      expect(result.invalid_scopes).toContain('invalid:scope');
      expect(result.invalid_scopes).toContain('another:invalid');
    });
    
    test('should reject empty scopes array', async () => {
      const registration = {
        name: 'No Scopes App',
        redirect_uris: ['https://app.example.com/callback'],
        requested_scopes: []
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one scope must be requested');
    });
    
    test('should reject non-array scopes', async () => {
      const registration = {
        name: 'Invalid Scopes Type App',
        redirect_uris: ['https://app.example.com/callback'],
        requested_scopes: 'accounts:read'
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one scope must be requested');
    });
  });
  
  describe('Validation Functions', () => {
    describe('validateRedirectUri', () => {
      test('should validate HTTPS URI', () => {
        expect(validateRedirectUri('https://app.example.com/callback')).toBe(true);
      });
      
      test('should validate localhost HTTP in development', () => {
        process.env.NODE_ENV = 'development';
        expect(validateRedirectUri('http://localhost:3000/callback')).toBe(true);
      });
      
      test('should reject HTTP in production', () => {
        process.env.NODE_ENV = 'production';
        expect(validateRedirectUri('http://app.example.com/callback')).toBe(false);
      });
      
      test('should reject URI with fragment', () => {
        expect(validateRedirectUri('https://app.example.com/callback#fragment')).toBe(false);
      });
      
      test('should reject malformed URI', () => {
        expect(validateRedirectUri('not-a-url')).toBe(false);
      });
    });
    
    describe('validateScopes', () => {
      test('should validate supported scopes', () => {
        const result = validateScopes(['accounts:read', 'transactions:read']);
        expect(result.valid).toBe(true);
      });
      
      test('should reject unsupported scopes', () => {
        const result = validateScopes(['accounts:read', 'invalid:scope']);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Unsupported scopes');
        expect(result.invalidScopes).toContain('invalid:scope');
      });
      
      test('should reject empty array', () => {
        const result = validateScopes([]);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('At least one scope must be requested');
      });
    });
  });
  
  describe('Required Fields', () => {
    test('should reject missing name', async () => {
      const registration = {
        redirect_uris: ['https://app.example.com/callback'],
        requested_scopes: ['accounts:read']
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Application name is required');
    });
    
    test('should reject empty name', async () => {
      const registration = {
        name: '   ',
        redirect_uris: ['https://app.example.com/callback'],
        requested_scopes: ['accounts:read']
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Application name is required');
    });
  });
  
  describe('Security', () => {
    test('should return client_secret only once during registration', async () => {
      const registration = {
        name: 'Security Test App',
        redirect_uris: ['https://app.example.com/callback'],
        requested_scopes: ['accounts:read']
      };
      
      const result = await registerClient(registration);
      
      expect(result.success).toBe(true);
      expect(result.client_secret).toBeDefined();
      expect(result.warning).toContain('will not be shown again');
    });
    
    test('should generate unique client_id for each registration', async () => {
      const registration = {
        name: 'Unique ID Test',
        redirect_uris: ['https://app.example.com/callback'],
        requested_scopes: ['accounts:read']
      };
      
      const result1 = await registerClient(registration);
      const result2 = await registerClient(registration);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.client_id).not.toBe(result2.client_id);
    });
    
    test('should generate unique client_secret for each registration', async () => {
      const registration = {
        name: 'Unique Secret Test',
        redirect_uris: ['https://app.example.com/callback'],
        requested_scopes: ['accounts:read']
      };
      
      const result1 = await registerClient(registration);
      const result2 = await registerClient(registration);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.client_secret).not.toBe(result2.client_secret);
    });
  });
});

// Made with Bob
