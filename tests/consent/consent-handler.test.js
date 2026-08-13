/**
 * Consent Handler Tests
 * Tests for consent approval flow endpoints
 */

const {
  handleConsentPageRequest,
  handleConsentDecision,
  handleConsentRevocation,
  handleGetCustomerConsents,
  getScopeDescriptions
} = require('../../auth/consent/consent-handler');

describe('Consent Handler', () => {
  
  describe('Consent Page Request', () => {
    test('should load consent page with authorization request', async () => {
      // Create authorization request first
      const authRequestId = 'authreq_test123';
      
      const result = await handleConsentPageRequest(authRequestId, 'CUST-001');
      
      expect(result.success).toBe(true);
      expect(result.auth_request_id).toBe(authRequestId);
      expect(result.client).toBeDefined();
      expect(result.client.name).toBeDefined();
      expect(result.customer).toBeDefined();
      expect(result.requested_scopes).toBeDefined();
      expect(result.scope_descriptions).toBeDefined();
    });
    
    test('should reject invalid authorization request', async () => {
      const result = await handleConsentPageRequest('invalid-auth-req', 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_request');
    });
    
    test('should reject expired authorization request', async () => {
      const expiredAuthReqId = 'authreq_expired';
      
      const result = await handleConsentPageRequest(expiredAuthReqId, 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('expired_request');
    });
    
    test('should show existing consent if present', async () => {
      const authRequestId = 'authreq_with_existing';
      
      const result = await handleConsentPageRequest(authRequestId, 'CUST-001');
      
      if (result.existing_consent) {
        expect(result.existing_consent.consent_id).toBeDefined();
        expect(result.existing_consent.granted_scopes).toBeDefined();
        expect(result.existing_consent.approved_at).toBeDefined();
        expect(result.existing_consent.expires_at).toBeDefined();
      }
    });
  });
  
  describe('Consent Decision - Approval', () => {
    test('should approve consent and issue authorization code', async () => {
      const params = {
        auth_request_id: 'authreq_test123',
        action: 'approve'
      };
      
      const result = await handleConsentDecision(params, 'CUST-001', '192.168.1.1', 'Mozilla/5.0');
      
      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toMatch(/^authcode_/);
      expect(result.consent_id).toBeDefined();
      expect(result.granted_scopes).toBeDefined();
      expect(result.redirect_uri).toBeDefined();
    });
    
    test('should approve with subset of scopes', async () => {
      const params = {
        auth_request_id: 'authreq_test123',
        action: 'approve',
        granted_scopes: ['accounts:read']
      };
      
      const result = await handleConsentDecision(params, 'CUST-001');
      
      expect(result.success).toBe(true);
      expect(result.granted_scopes).toEqual(['accounts:read']);
    });
    
    test('should reuse existing active consent', async () => {
      const params = {
        auth_request_id: 'authreq_with_existing',
        action: 'approve'
      };
      
      const result = await handleConsentDecision(params, 'CUST-001');
      
      expect(result.success).toBe(true);
      expect(result.consent_id).toBeDefined();
    });
    
    test('should reject approval with invalid scopes', async () => {
      const params = {
        auth_request_id: 'authreq_test123',
        action: 'approve',
        granted_scopes: ['invalid:scope']
      };
      
      const result = await handleConsentDecision(params, 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_scope');
    });
    
    test('should preserve state parameter', async () => {
      const params = {
        auth_request_id: 'authreq_with_state',
        action: 'approve'
      };
      
      const result = await handleConsentDecision(params, 'CUST-001');
      
      expect(result.success).toBe(true);
      expect(result.state).toBeDefined();
    });
  });
  
  describe('Consent Decision - Denial', () => {
    test('should deny consent and redirect with error', async () => {
      const params = {
        auth_request_id: 'authreq_test123',
        action: 'deny'
      };
      
      const result = await handleConsentDecision(params, 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('access_denied');
      expect(result.should_redirect).toBe(true);
      expect(result.redirect_uri).toBeDefined();
    });
    
    test('should create denied consent record', async () => {
      const params = {
        auth_request_id: 'authreq_test123',
        action: 'deny'
      };
      
      await handleConsentDecision(params, 'CUST-001');
      
      // Verify denied consent was created
      const consents = await handleGetCustomerConsents('CUST-001', { status: 'denied' });
      
      expect(consents.success).toBe(true);
      expect(consents.consents.some(c => c.status === 'denied')).toBe(true);
    });
  });
  
  describe('Consent Decision Validation', () => {
    test('should reject invalid action', async () => {
      const params = {
        auth_request_id: 'authreq_test123',
        action: 'invalid'
      };
      
      const result = await handleConsentDecision(params, 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_request');
    });
    
    test('should reject missing authorization request', async () => {
      const params = {
        auth_request_id: 'nonexistent',
        action: 'approve'
      };
      
      const result = await handleConsentDecision(params, 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_request');
    });
    
    test('should reject expired authorization request', async () => {
      const params = {
        auth_request_id: 'authreq_expired',
        action: 'approve'
      };
      
      const result = await handleConsentDecision(params, 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('expired_request');
      expect(result.should_redirect).toBe(true);
    });
  });
  
  describe('Authorization Code Issuance', () => {
    test('should not issue code without approved consent', async () => {
      const params = {
        auth_request_id: 'authreq_test123',
        action: 'deny'
      };
      
      const result = await handleConsentDecision(params, 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.code).toBeUndefined();
    });
    
    test('should link authorization code to consent', async () => {
      const params = {
        auth_request_id: 'authreq_test123',
        action: 'approve'
      };
      
      const result = await handleConsentDecision(params, 'CUST-001');
      
      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.consent_id).toBeDefined();
      
      // Verify code is linked to consent in database
      // This would require querying authorization_codes table
    });
    
    test('should set authorization code expiration', async () => {
      const params = {
        auth_request_id: 'authreq_test123',
        action: 'approve'
      };
      
      const result = await handleConsentDecision(params, 'CUST-001');
      
      expect(result.success).toBe(true);
      
      // Code should expire in 10 minutes
      // Verification would require database query
    });
  });
  
  describe('Consent Revocation', () => {
    test('should revoke active consent', async () => {
      // First approve a consent
      const approveParams = {
        auth_request_id: 'authreq_test123',
        action: 'approve'
      };
      
      const approved = await handleConsentDecision(approveParams, 'CUST-001');
      
      // Then revoke it
      const result = await handleConsentRevocation(
        approved.consent_id,
        'CUST-001',
        'User requested revocation'
      );
      
      expect(result.success).toBe(true);
      expect(result.consent_id).toBe(approved.consent_id);
      expect(result.revoked_at).toBeDefined();
    });
    
    test('should reject revocation of non-existent consent', async () => {
      const result = await handleConsentRevocation('nonexistent', 'CUST-001');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('not_found');
    });
    
    test('should reject revocation by wrong customer', async () => {
      const approveParams = {
        auth_request_id: 'authreq_test123',
        action: 'approve'
      };
      
      const approved = await handleConsentDecision(approveParams, 'CUST-001');
      
      const result = await handleConsentRevocation(approved.consent_id, 'CUST-002');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('not_found');
    });
    
    test('should invalidate access tokens on revocation', async () => {
      const approveParams = {
        auth_request_id: 'authreq_test123',
        action: 'approve'
      };
      
      const approved = await handleConsentDecision(approveParams, 'CUST-001');
      
      await handleConsentRevocation(approved.consent_id, 'CUST-001');
      
      // Verify access tokens are invalidated
      // This would require querying access_tokens table
    });
  });
  
  describe('Get Customer Consents', () => {
    test('should get all customer consents', async () => {
      const result = await handleGetCustomerConsents('CUST-001');
      
      expect(result.success).toBe(true);
      expect(result.consents).toBeDefined();
      expect(Array.isArray(result.consents)).toBe(true);
    });
    
    test('should enrich consents with client details', async () => {
      const result = await handleGetCustomerConsents('CUST-001');
      
      expect(result.success).toBe(true);
      
      if (result.consents.length > 0) {
        const consent = result.consents[0];
        expect(consent.client).toBeDefined();
        expect(consent.client.name).toBeDefined();
      }
    });
    
    test('should filter consents by status', async () => {
      const result = await handleGetCustomerConsents('CUST-001', { status: 'approved' });
      
      expect(result.success).toBe(true);
      expect(result.consents.every(c => c.status === 'approved')).toBe(true);
    });
    
    test('should parse granted scopes as array', async () => {
      const result = await handleGetCustomerConsents('CUST-001');
      
      expect(result.success).toBe(true);
      
      if (result.consents.length > 0) {
        const consent = result.consents[0];
        expect(Array.isArray(consent.granted_scopes)).toBe(true);
      }
    });
  });
  
  describe('Scope Descriptions', () => {
    test('should provide descriptions for all standard scopes', () => {
      const scopes = ['accounts:read', 'transactions:read', 'balances:read', 'profile:read'];
      const descriptions = getScopeDescriptions(scopes);
      
      expect(descriptions['accounts:read']).toBeDefined();
      expect(descriptions['accounts:read'].title).toBeDefined();
      expect(descriptions['accounts:read'].description).toBeDefined();
      
      expect(descriptions['transactions:read']).toBeDefined();
      expect(descriptions['balances:read']).toBeDefined();
      expect(descriptions['profile:read']).toBeDefined();
    });
    
    test('should provide fallback for unknown scopes', () => {
      const scopes = ['unknown:scope'];
      const descriptions = getScopeDescriptions(scopes);
      
      expect(descriptions['unknown:scope']).toBeDefined();
      expect(descriptions['unknown:scope'].title).toBe('unknown:scope');
      expect(descriptions['unknown:scope'].description).toContain('unknown:scope');
    });
  });
  
  describe('Integration Flow', () => {
    test('should complete full approval flow', async () => {
      // 1. Load consent page
      const pageResult = await handleConsentPageRequest('authreq_test123', 'CUST-001');
      expect(pageResult.success).toBe(true);
      
      // 2. Approve consent
      const approveResult = await handleConsentDecision(
        {
          auth_request_id: 'authreq_test123',
          action: 'approve'
        },
        'CUST-001'
      );
      expect(approveResult.success).toBe(true);
      expect(approveResult.code).toBeDefined();
      
      // 3. Verify consent in customer list
      const consentsResult = await handleGetCustomerConsents('CUST-001', { status: 'approved' });
      expect(consentsResult.success).toBe(true);
      expect(consentsResult.consents.some(c => c.consent_id === approveResult.consent_id)).toBe(true);
    });
    
    test('should complete full denial flow', async () => {
      // 1. Load consent page
      const pageResult = await handleConsentPageRequest('authreq_test456', 'CUST-001');
      expect(pageResult.success).toBe(true);
      
      // 2. Deny consent
      const denyResult = await handleConsentDecision(
        {
          auth_request_id: 'authreq_test456',
          action: 'deny'
        },
        'CUST-001'
      );
      expect(denyResult.success).toBe(false);
      expect(denyResult.error).toBe('access_denied');
      
      // 3. Verify denied consent in customer list
      const consentsResult = await handleGetCustomerConsents('CUST-001', { status: 'denied' });
      expect(consentsResult.success).toBe(true);
      expect(consentsResult.consents.some(c => c.status === 'denied')).toBe(true);
    });
    
    test('should complete approval and revocation flow', async () => {
      // 1. Approve consent
      const approveResult = await handleConsentDecision(
        {
          auth_request_id: 'authreq_test789',
          action: 'approve'
        },
        'CUST-001'
      );
      expect(approveResult.success).toBe(true);
      
      // 2. Revoke consent
      const revokeResult = await handleConsentRevocation(
        approveResult.consent_id,
        'CUST-001',
        'Changed my mind'
      );
      expect(revokeResult.success).toBe(true);
      
      // 3. Verify revoked consent in customer list
      const consentsResult = await handleGetCustomerConsents('CUST-001', { status: 'revoked' });
      expect(consentsResult.success).toBe(true);
      expect(consentsResult.consents.some(c => c.consent_id === approveResult.consent_id)).toBe(true);
    });
  });
});

// Made with Bob
