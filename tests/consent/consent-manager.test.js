/**
 * Consent Manager Tests
 * Tests for consent creation, approval, denial, and revocation
 */

const {
  createConsent,
  approveConsent,
  denyConsent,
  revokeConsent,
  getConsent,
  getCustomerConsents,
  getClientConsents,
  findActiveConsent,
  expireOldConsents,
  getConsentStatistics,
  DEFAULT_CONSENT_EXPIRATION_DAYS
} = require('../../auth/consent/consent-manager');

describe('Consent Manager', () => {
  
  describe('Consent Creation', () => {
    test('should create consent with all required fields', async () => {
      const params = {
        customer_id: 'CUST-001',
        client_id: 'fintech-demo-client',
        purpose: 'Budget Tracker - Access to banking data',
        requested_scopes: ['accounts:read', 'transactions:read'],
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0...'
      };
      
      const consent = await createConsent(params);
      
      expect(consent.consent_id).toBeDefined();
      expect(consent.consent_id).toMatch(/^consent_/);
      expect(consent.customer_id).toBe('CUST-001');
      expect(consent.client_id).toBe('fintech-demo-client');
      expect(consent.purpose).toBe('Budget Tracker - Access to banking data');
      expect(consent.requested_scopes).toBe('accounts:read transactions:read');
      expect(consent.status).toBe('pending');
      expect(consent.expires_at).toBeDefined();
      expect(consent.ip_address).toBe('192.168.1.1');
      expect(consent.user_agent).toBe('Mozilla/5.0...');
    });
    
    test('should set default expiration to 90 days', async () => {
      const params = {
        customer_id: 'CUST-001',
        client_id: 'fintech-demo-client',
        purpose: 'Test purpose',
        requested_scopes: ['accounts:read']
      };
      
      const consent = await createConsent(params);
      
      const expiresAt = new Date(consent.expires_at);
      const now = new Date();
      const diffDays = Math.round((expiresAt - now) / (1000 * 60 * 60 * 24));
      
      expect(diffDays).toBeGreaterThanOrEqual(89);
      expect(diffDays).toBeLessThanOrEqual(91);
    });
    
    test('should accept custom expiration days', async () => {
      const params = {
        customer_id: 'CUST-001',
        client_id: 'fintech-demo-client',
        purpose: 'Test purpose',
        requested_scopes: ['accounts:read'],
        expiration_days: 30
      };
      
      const consent = await createConsent(params);
      
      const expiresAt = new Date(consent.expires_at);
      const now = new Date();
      const diffDays = Math.round((expiresAt - now) / (1000 * 60 * 60 * 24));
      
      expect(diffDays).toBeGreaterThanOrEqual(29);
      expect(diffDays).toBeLessThanOrEqual(31);
    });
    
    test('should reject creation without required fields', async () => {
      const params = {
        customer_id: 'CUST-001',
        // Missing client_id, purpose, requested_scopes
      };
      
      await expect(createConsent(params)).rejects.toThrow('Missing required consent parameters');
    });
    
    test('should handle scopes as array or string', async () => {
      const paramsArray = {
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read', 'balances:read']
      };
      
      const consent1 = await createConsent(paramsArray);
      expect(consent1.requested_scopes).toBe('accounts:read balances:read');
      
      const paramsString = {
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: 'accounts:read balances:read'
      };
      
      const consent2 = await createConsent(paramsString);
      expect(consent2.requested_scopes).toBe('accounts:read balances:read');
    });
  });
  
  describe('Consent Approval', () => {
    test('should approve pending consent', async () => {
      // Create consent
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read', 'transactions:read']
      });
      
      // Approve consent
      const approved = await approveConsent(created.consent_id, 'CUST-001');
      
      expect(approved.status).toBe('approved');
      expect(approved.granted_scopes).toBe('accounts:read transactions:read');
      expect(approved.approved_at).toBeDefined();
    });
    
    test('should approve with subset of requested scopes', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read', 'transactions:read', 'balances:read']
      });
      
      const approved = await approveConsent(
        created.consent_id,
        'CUST-001',
        ['accounts:read', 'balances:read']
      );
      
      expect(approved.status).toBe('approved');
      expect(approved.granted_scopes).toBe('accounts:read balances:read');
    });
    
    test('should reject approval with scopes not in requested', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await expect(
        approveConsent(created.consent_id, 'CUST-001', ['accounts:read', 'profile:read'])
      ).rejects.toThrow('Granted scopes must be subset of requested scopes');
    });
    
    test('should reject approval of non-pending consent', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(created.consent_id, 'CUST-001');
      
      await expect(
        approveConsent(created.consent_id, 'CUST-001')
      ).rejects.toThrow('Cannot approve consent in approved state');
    });
    
    test('should reject approval by wrong customer', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await expect(
        approveConsent(created.consent_id, 'CUST-002')
      ).rejects.toThrow('Consent not found or does not belong to customer');
    });
  });
  
  describe('Consent Denial', () => {
    test('should deny pending consent', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      const denied = await denyConsent(created.consent_id, 'CUST-001');
      
      expect(denied.status).toBe('denied');
      expect(denied.denied_at).toBeDefined();
    });
    
    test('should reject denial of non-pending consent', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await denyConsent(created.consent_id, 'CUST-001');
      
      await expect(
        denyConsent(created.consent_id, 'CUST-001')
      ).rejects.toThrow('Cannot deny consent in denied state');
    });
  });
  
  describe('Consent Revocation', () => {
    test('should revoke approved consent', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(created.consent_id, 'CUST-001');
      
      const revoked = await revokeConsent(
        created.consent_id,
        'CUST-001',
        'Customer requested revocation'
      );
      
      expect(revoked.status).toBe('revoked');
      expect(revoked.revoked_at).toBeDefined();
      expect(revoked.revoked_by).toBe('CUST-001');
      expect(revoked.revocation_reason).toBe('Customer requested revocation');
    });
    
    test('should reject revocation of non-approved consent', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await expect(
        revokeConsent(created.consent_id, 'CUST-001')
      ).rejects.toThrow('Cannot revoke consent in pending state');
    });
    
    test('should allow system revocation', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(created.consent_id, 'CUST-001');
      
      const revoked = await revokeConsent(
        created.consent_id,
        'system',
        'Security policy violation'
      );
      
      expect(revoked.revoked_by).toBe('system');
      expect(revoked.revocation_reason).toBe('Security policy violation');
    });
  });
  
  describe('Consent Retrieval', () => {
    test('should get consent by ID', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      const retrieved = await getConsent(created.consent_id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved.consent_id).toBe(created.consent_id);
    });
    
    test('should get consent with customer verification', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      const retrieved = await getConsent(created.consent_id, 'CUST-001');
      expect(retrieved).toBeDefined();
      
      const notFound = await getConsent(created.consent_id, 'CUST-002');
      expect(notFound).toBeNull();
    });
    
    test('should get all customer consents', async () => {
      await createConsent({
        customer_id: 'CUST-001',
        client_id: 'client-1',
        purpose: 'Test 1',
        requested_scopes: ['accounts:read']
      });
      
      await createConsent({
        customer_id: 'CUST-001',
        client_id: 'client-2',
        purpose: 'Test 2',
        requested_scopes: ['transactions:read']
      });
      
      const consents = await getCustomerConsents('CUST-001');
      
      expect(consents.length).toBeGreaterThanOrEqual(2);
      expect(consents.every(c => c.customer_id === 'CUST-001')).toBe(true);
    });
    
    test('should filter customer consents by status', async () => {
      const consent1 = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(consent1.consent_id, 'CUST-001');
      
      const consent2 = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client-2',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      const approved = await getCustomerConsents('CUST-001', { status: 'approved' });
      const pending = await getCustomerConsents('CUST-001', { status: 'pending' });
      
      expect(approved.every(c => c.status === 'approved')).toBe(true);
      expect(pending.every(c => c.status === 'pending')).toBe(true);
    });
    
    test('should get active consents only', async () => {
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(consent.consent_id, 'CUST-001');
      
      const active = await getCustomerConsents('CUST-001', { active_only: true });
      
      expect(active.every(c => c.status === 'approved')).toBe(true);
      expect(active.every(c => new Date(c.expires_at) > new Date())).toBe(true);
    });
  });
  
  describe('Active Consent Lookup', () => {
    test('should find active consent with required scopes', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read', 'transactions:read', 'balances:read']
      });
      
      await approveConsent(created.consent_id, 'CUST-001');
      
      const found = await findActiveConsent(
        'CUST-001',
        'test-client',
        ['accounts:read', 'transactions:read']
      );
      
      expect(found).toBeDefined();
      expect(found.consent_id).toBe(created.consent_id);
    });
    
    test('should return null if scopes insufficient', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(created.consent_id, 'CUST-001');
      
      const found = await findActiveConsent(
        'CUST-001',
        'test-client',
        ['accounts:read', 'transactions:read']
      );
      
      expect(found).toBeNull();
    });
    
    test('should return null for revoked consent', async () => {
      const created = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(created.consent_id, 'CUST-001');
      await revokeConsent(created.consent_id, 'CUST-001');
      
      const found = await findActiveConsent('CUST-001', 'test-client', ['accounts:read']);
      
      expect(found).toBeNull();
    });
  });
  
  describe('Consent Statistics', () => {
    test('should get consent statistics for customer', async () => {
      const consent1 = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'client-1',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await approveConsent(consent1.consent_id, 'CUST-001');
      
      const consent2 = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'client-2',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      
      await denyConsent(consent2.consent_id, 'CUST-001');
      
      const stats = await getConsentStatistics('CUST-001');
      
      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.active).toBeGreaterThanOrEqual(1);
      expect(stats.denied).toBeGreaterThanOrEqual(1);
    });
  });
});

// Made with Bob
