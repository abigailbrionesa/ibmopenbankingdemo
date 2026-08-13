/**
 * Customer Authentication Tests
 * Tests for customer authentication boundary and security
 */

const {
  authenticateCustomer,
  verifyCustomerSession,
  logoutCustomer,
  verifyFintechCredentialsForCustomerAuth
} = require('../../auth/customer-authentication');

const {
  requireCustomerAuth,
  requireCustomerAuthForAuthorization,
  preventOAuthClientAuth,
  validateAuthorizationContext
} = require('../../auth/middleware/customer-auth-middleware');

describe('Customer Authentication', () => {
  
  describe('Unauthenticated Authorization Request Blocking', () => {
    test('should block authorization request without customer session', async () => {
      const req = {
        cookies: {},
        headers: {},
        originalUrl: '/oauth/authorize?client_id=test&redirect_uri=https://example.com'
      };
      const res = {
        redirect: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      await requireCustomerAuthForAuthorization(req, res, next);
      
      expect(res.redirect).toHaveBeenCalled();
      expect(res.redirect.mock.calls[0][0]).toContain('/auth/login');
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should redirect to login with return URL', async () => {
      const req = {
        cookies: {},
        headers: {},
        originalUrl: '/oauth/authorize?client_id=test'
      };
      const res = {
        redirect: jest.fn()
      };
      const next = jest.fn();
      
      await requireCustomerAuthForAuthorization(req, res, next);
      
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('/auth/login');
      expect(redirectUrl).toContain('return_to=');
    });
    
    test('should block consent page without authentication', async () => {
      const req = {
        cookies: {},
        headers: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      await requireCustomerAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication required',
          redirect_to: '/auth/login'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should block with expired session', async () => {
      const req = {
        cookies: { customer_session: 'expired_token' },
        headers: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      // Mock verifyCustomerSession to return invalid
      jest.spyOn(require('../../auth/customer-authentication'), 'verifyCustomerSession')
        .mockResolvedValue({ valid: false, error: 'Session expired' });
      
      await requireCustomerAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid or expired session'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
  
  describe('Authenticated Customer Consent Flow', () => {
    test('should allow authenticated customer to proceed to consent', async () => {
      const mockSession = {
        valid: true,
        customer_id: 'CUST-001',
        customer_name: 'Maria Garcia',
        customer_email: 'maria.garcia@example.com',
        session_id: 'session_123',
        authentication_method: 'demo'
      };
      
      jest.spyOn(require('../../auth/customer-authentication'), 'verifyCustomerSession')
        .mockResolvedValue(mockSession);
      
      const req = {
        cookies: { customer_session: 'valid_token' },
        headers: {},
        originalUrl: '/oauth/authorize'
      };
      const res = {
        redirect: jest.fn()
      };
      const next = jest.fn();
      
      await requireCustomerAuthForAuthorization(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.customer).toBeDefined();
      expect(req.customer.customer_id).toBe('CUST-001');
      expect(req.authorizationContext).toBeDefined();
      expect(req.authorizationContext.customer_authenticated).toBe(true);
    });
    
    test('should attach customer info to request', async () => {
      const mockSession = {
        valid: true,
        customer_id: 'CUST-001',
        customer_name: 'Maria Garcia',
        customer_email: 'maria.garcia@example.com',
        session_id: 'session_123',
        authentication_method: 'demo'
      };
      
      jest.spyOn(require('../../auth/customer-authentication'), 'verifyCustomerSession')
        .mockResolvedValue(mockSession);
      
      const req = {
        cookies: { customer_session: 'valid_token' },
        headers: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      await requireCustomerAuth(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.customer).toEqual({
        customer_id: 'CUST-001',
        customer_name: 'Maria Garcia',
        customer_email: 'maria.garcia@example.com',
        session_id: 'session_123',
        authentication_method: 'demo'
      });
    });
    
    test('should create authorization context with customer info', async () => {
      const mockSession = {
        valid: true,
        customer_id: 'CUST-001',
        customer_name: 'Maria Garcia',
        customer_email: 'maria.garcia@example.com',
        session_id: 'session_123',
        authentication_method: 'demo'
      };
      
      jest.spyOn(require('../../auth/customer-authentication'), 'verifyCustomerSession')
        .mockResolvedValue(mockSession);
      
      const req = {
        cookies: { customer_session: 'valid_token' },
        headers: {},
        originalUrl: '/oauth/authorize'
      };
      const res = {
        redirect: jest.fn()
      };
      const next = jest.fn();
      
      await requireCustomerAuthForAuthorization(req, res, next);
      
      expect(req.authorizationContext).toEqual(
        expect.objectContaining({
          customer_authenticated: true,
          customer_id: 'CUST-001',
          authentication_method: 'demo'
        })
      );
    });
    
    test('should validate authorization context before consent', () => {
      const req = {
        authorizationContext: {
          customer_authenticated: true,
          customer_id: 'CUST-001'
        },
        customer: {
          customer_id: 'CUST-001'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      validateAuthorizationContext(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
  
  describe('Fintech Credentials Cannot Authenticate Customers', () => {
    test('should reject OAuth client credentials for customer auth', () => {
      const result = verifyFintechCredentialsForCustomerAuth('client_123', 'secret_456');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('OAuth client credentials cannot be used for customer authentication');
      expect(result.reason).toContain('separate security domains');
    });
    
    test('should block Basic auth header on customer login', () => {
      const req = {
        headers: {
          authorization: 'Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ='
        },
        body: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      preventOAuthClientAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid authentication method',
          message: 'OAuth client credentials cannot be used for customer authentication'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should block client_id in request body', () => {
      const req = {
        headers: {},
        body: {
          client_id: 'client_123',
          client_secret: 'secret_456'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      preventOAuthClientAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid authentication method',
          reason: 'Fintech identity and customer identity are separate security domains'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should block client_id in query parameters', () => {
      const req = {
        headers: {},
        body: {},
        query: {
          client_id: 'client_123'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      preventOAuthClientAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should allow normal customer login without OAuth credentials', () => {
      const req = {
        headers: {},
        body: {
          email: 'maria.garcia@example.com',
          password: 'demo123'
        },
        query: {}
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      preventOAuthClientAuth(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
  
  describe('Customer Login Flow', () => {
    test('should authenticate valid customer credentials', async () => {
      const credentials = {
        email: 'maria.garcia@example.com',
        password: 'demo123',
        ip_address: '127.0.0.1',
        user_agent: 'Test Browser'
      };
      
      const result = await authenticateCustomer(credentials);
      
      expect(result.success).toBe(true);
      expect(result.customer_id).toBe('CUST-001');
      expect(result.session_token).toBeDefined();
      expect(result.expires_at).toBeDefined();
      expect(result.authentication_method).toBe('demo');
      expect(result.warning).toContain('DEMO AUTHENTICATION');
    });
    
    test('should reject invalid credentials', async () => {
      const credentials = {
        email: 'maria.garcia@example.com',
        password: 'wrong_password'
      };
      
      const result = await authenticateCustomer(credentials);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });
    
    test('should reject missing email', async () => {
      const credentials = {
        password: 'demo123'
      };
      
      const result = await authenticateCustomer(credentials);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Email and password are required');
    });
  });
  
  describe('Authorization Context Validation', () => {
    test('should reject missing authorization context', () => {
      const req = {
        customer: { customer_id: 'CUST-001' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      validateAuthorizationContext(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authorization context invalid',
          oauth_error: 'access_denied'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should reject customer ID mismatch', () => {
      const req = {
        authorizationContext: {
          customer_authenticated: true,
          customer_id: 'CUST-001'
        },
        customer: {
          customer_id: 'CUST-002'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      validateAuthorizationContext(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authorization context mismatch'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});

// Made with Bob
