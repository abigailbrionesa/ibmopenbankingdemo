/**
 * Consent Revocation Integration Tests
 * Tests the complete flow of consent revocation and its impact on API access
 */

const { validateConsent, checkConsentStatus } = require('../../gateway/policies/consent-validation');
const { handleConsentRevocation } = require('../../auth/consent/consent-handler');
const { createConsent, approveConsent } = require('../../auth/consent/consent-manager');

describe('Consent Revocation Integration', () => {
  
  describe('API Access Before Revocation', () => {
    test('should allow API access with valid token and active consent', async () => {
      // Setup: Create and approve consent
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test Application',
        requested_scopes: ['accounts:read', 'transactions:read']
      });
      
      await approveConsent(consent.consent_id, 'CUST-001');
      
      // Simulate API request with valid token
      const req = {
        oauth_token: {
          customer_id: 'CUST-001',
          client_id: 'test-client',
          consent_id: consent.consent_id,
          scope: 'accounts:read transactions:read'
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      const next = jest.fn();
      
      // Execute consent validation middleware
      await validateConsent(req, res, next);
      
      // Should call next() without errors
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.consent).toBeDefined();
      expect(req.consent.status).toBe('approved');
    });
    
    test('should return 200 OK for API request with active consent', async () => {
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(consent.consent_id, 'CUST-001');
      
      // Check consent status
      const status = await checkConsentStatus(consent.consent_id);
      
      expect(status.active).toBe(true);
      expect(status.consent.status).toBe('approved');
    });
  });
  
  describe('Consent Revocation', () => {
    test('should successfully revoke approved consent', async () => {
      // Create and approve consent
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(consent.consent_id, 'CUST-001');
      
      // Revoke consent
      const result = await handleConsentRevocation(
        consent.consent_id,
        'CUST-001',
        'User requested revocation'
      );
      
      expect(result.success).toBe(true);
      expect(result.consent_id).toBe(consent.consent_id);
      expect(result.revoked_at).toBeDefined();
    });
    
    test('should update consent status to revoked', async () => {
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(consent.consent_id, 'CUST-001');
      await handleConsentRevocation(consent.consent_id, 'CUST-001');
      
      // Check status
      const status = await checkConsentStatus(consent.consent_id);
      
      expect(status.active).toBe(false);
      expect(status.reason).toBe('revoked');
      expect(status.consent.status).toBe('revoked');
    });
    
    test('should record revocation timestamp and reason', async () => {
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(consent.consent_id, 'CUST-001');
      
      const reason = 'No longer using this application';
      await handleConsentRevocation(consent.consent_id, 'CUST-001', reason);
      
      const { getConsent } = require('../../auth/consent/consent-manager');
      const revokedConsent = await getConsent(consent.consent_id);
      
      expect(revokedConsent.status).toBe('revoked');
      expect(revokedConsent.revoked_at).toBeDefined();
      expect(revokedConsent.revoked_by).toBe('CUST-001');
      expect(revokedConsent.revocation_reason).toBe(reason);
    });
  });
  
  describe('API Access After Revocation', () => {
    test('should return 403 Forbidden with revoked consent', async () => {
      // Setup: Create, approve, then revoke consent
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(consent.consent_id, 'CUST-001');
      await handleConsentRevocation(consent.consent_id, 'CUST-001');
      
      // Simulate API request with valid token but revoked consent
      const req = {
        oauth_token: {
          customer_id: 'CUST-001',
          client_id: 'test-client',
          consent_id: consent.consent_id,
          scope: 'accounts:read'
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      const next = jest.fn();
      
      // Execute consent validation middleware
      await validateConsent(req, res, next);
      
      // Should return 403 Forbidden
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'forbidden',
          error_description: 'Consent has been revoked',
          consent_id: consent.consent_id,
          status: 'revoked'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should block API access even with otherwise valid token', async () => {
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read', 'transactions:read']
      });
      
      await approveConsent(consent.consent_id, 'CUST-001');
      
      // Token is valid at this point
      let status = await checkConsentStatus(consent.consent_id);
      expect(status.active).toBe(true);
      
      // Revoke consent
      await handleConsentRevocation(consent.consent_id, 'CUST-001');
      
      // Same token should now be blocked
      status = await checkConsentStatus(consent.consent_id);
      expect(status.active).toBe(false);
      expect(status.reason).toBe('revoked');
    });
    
    test('should include revocation details in error response', async () => {
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(consent.consent_id, 'CUST-001');
      await handleConsentRevocation(consent.consent_id, 'CUST-001', 'Security concern');
      
      const req = {
        oauth_token: {
          customer_id: 'CUST-001',
          client_id: 'test-client',
          consent_id: consent.consent_id,
          scope: 'accounts:read'
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      const next = jest.fn();
      
      await validateConsent(req, res, next);
      
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'forbidden',
          error_description: 'Consent has been revoked',
          status: 'revoked'
        })
      );
    });
  });
  
  describe('Complete Flow: Approve → Access → Revoke → Block', () => {
    test('should demonstrate complete revocation flow', async () => {
      // Step 1: Create and approve consent
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Budget Tracker',
        requested_scopes: ['accounts:read', 'transactions:read']
      });
      
      const approved = await approveConsent(consent.consent_id, 'CUST-001');
      expect(approved.status).toBe('approved');
      
      // Step 2: Verify API access works
      const req1 = {
        oauth_token: {
          customer_id: 'CUST-001',
          client_id: 'test-client',
          consent_id: consent.consent_id,
          scope: 'accounts:read transactions:read'
        }
      };
      
      const res1 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      const next1 = jest.fn();
      
      await validateConsent(req1, res1, next1);
      expect(next1).toHaveBeenCalled(); // Access granted
      expect(res1.status).not.toHaveBeenCalled();
      
      // Step 3: Revoke consent
      const revoked = await handleConsentRevocation(
        consent.consent_id,
        'CUST-001',
        'No longer needed'
      );
      expect(revoked.success).toBe(true);
      
      // Step 4: Verify API access is now blocked
      const req2 = {
        oauth_token: {
          customer_id: 'CUST-001',
          client_id: 'test-client',
          consent_id: consent.consent_id,
          scope: 'accounts:read transactions:read'
        }
      };
      
      const res2 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      const next2 = jest.fn();
      
      await validateConsent(req2, res2, next2);
      expect(next2).not.toHaveBeenCalled(); // Access denied
      expect(res2.status).toHaveBeenCalledWith(403);
      expect(res2.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'forbidden',
          error_description: 'Consent has been revoked'
        })
      );
    });
  });
  
  describe('Edge Cases', () => {
    test('should handle revocation of non-existent consent', async () => {
      const result = await handleConsentRevocation(
        'nonexistent-consent',
        'CUST-001'
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('not_found');
    });
    
    test('should prevent revocation by wrong customer', async () => {
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(consent.consent_id, 'CUST-001');
      
      const result = await handleConsentRevocation(
        consent.consent_id,
        'CUST-002' // Wrong customer
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('not_found');
    });
    
    test('should handle token without consent_id', async () => {
      const req = {
        oauth_token: {
          customer_id: 'CUST-001',
          client_id: 'test-client',
          // Missing consent_id
          scope: 'accounts:read'
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      const next = jest.fn();
      
      await validateConsent(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'forbidden',
          error_description: 'Token is not associated with a consent'
        })
      );
    });
  });
  
  describe('Multiple Consents', () => {
    test('should only revoke specified consent', async () => {
      // Create two consents for same customer and client
      const consent1 = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'First consent',
        requested_scopes: ['accounts:read']
      });
      
      const consent2 = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Second consent',
        requested_scopes: ['transactions:read']
      });
      
      await approveConsent(consent1.consent_id, 'CUST-001');
      await approveConsent(consent2.consent_id, 'CUST-001');
      
      // Revoke only first consent
      await handleConsentRevocation(consent1.consent_id, 'CUST-001');
      
      // Check statuses
      const status1 = await checkConsentStatus(consent1.consent_id);
      const status2 = await checkConsentStatus(consent2.consent_id);
      
      expect(status1.active).toBe(false);
      expect(status1.reason).toBe('revoked');
      expect(status2.active).toBe(true);
    });
  });
});

// Made with Bob
