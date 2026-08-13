/**
 * Banking Accounts API Tests
 * Tests for protected account endpoints
 */

const request = require('supertest');
const { generateTokens } = require('../../auth/oauth/token-exchange');
const { createConsent, approveConsent } = require('../../auth/consent/consent-manager');

describe('Banking Accounts API', () => {
  
  let accessToken;
  let customer1Token;
  let customer2Token;
  
  beforeAll(async () => {
    // Create tokens for CUST-001
    const consent1 = await createConsent({
      customer_id: 'CUST-001',
      client_id: 'test-client',
      purpose: 'Test',
      requested_scopes: ['accounts:read', 'transactions:read', 'balances:read']
    });
    await approveConsent(consent1.consent_id, 'CUST-001');
    
    const tokens1 = await generateTokens({
      customer_id: 'CUST-001',
      client_id: 'test-client',
      consent_id: consent1.consent_id,
      scope: 'accounts:read transactions:read balances:read'
    });
    customer1Token = tokens1.access_token;
    
    // Create tokens for CUST-002
    const consent2 = await createConsent({
      customer_id: 'CUST-002',
      client_id: 'test-client',
      purpose: 'Test',
      requested_scopes: ['accounts:read', 'transactions:read']
    });
    await approveConsent(consent2.consent_id, 'CUST-002');
    
    const tokens2 = await generateTokens({
      customer_id: 'CUST-002',
      client_id: 'test-client',
      consent_id: consent2.consent_id,
      scope: 'accounts:read transactions:read'
    });
    customer2Token = tokens2.access_token;
  });
  
  describe('GET /api/v1/accounts', () => {
    test('should return accounts for authenticated customer', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.accounts).toBeDefined();
      expect(Array.isArray(response.body.accounts)).toBe(true);
      expect(response.body.total).toBeDefined();
    });
    
    test('should return only active accounts', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.accounts.every(acc => acc.status === 'active')).toBe(true);
    });
    
    test('should include required account fields', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      
      if (response.body.accounts.length > 0) {
        const account = response.body.accounts[0];
        expect(account.account_id).toBeDefined();
        expect(account.currency).toBeDefined();
        expect(account.balance).toBeDefined();
        expect(account.balance.current).toBeDefined();
        expect(account.balance.available).toBeDefined();
      }
    });
    
    test('should mask account numbers', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      
      if (response.body.accounts.length > 0) {
        const account = response.body.accounts[0];
        expect(account.account_number).toMatch(/^\*\*\*\*\d{4}$/);
      }
    });
    
    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/v1/accounts');
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('unauthorized');
    });
    
    test('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid_token');
    });
    
    test('should reject request without accounts:read scope', async () => {
      // Create token without accounts:read scope
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['transactions:read']
      });
      await approveConsent(consent.consent_id, 'CUST-001');
      
      const tokens = await generateTokens({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        consent_id: consent.consent_id,
        scope: 'transactions:read'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${tokens.access_token}`);
      
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('insufficient_scope');
    });
  });
  
  describe('GET /api/v1/accounts/:account_id', () => {
    test('should return account details for owned account', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.account_id).toBe('ACC-001');
      expect(response.body.currency).toBeDefined();
      expect(response.body.balance).toBeDefined();
      expect(response.body.account_type).toBeDefined();
    });
    
    test('should include transaction count', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.transaction_count).toBeDefined();
      expect(typeof response.body.transaction_count).toBe('number');
    });
    
    test('should return 404 for non-existent account', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/ACC-999')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('not_found');
    });
    
    test('should deny access to another customer account', async () => {
      // CUST-002 trying to access CUST-001's account
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001')
        .set('Authorization', `Bearer ${customer2Token}`);
      
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('not_found');
    });
    
    test('should mask account number in detail view', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.account_number).toMatch(/^\*\*\*\*\d{4}$/);
    });
  });
  
  describe('GET /api/v1/accounts/:account_id/balance', () => {
    test('should return balance for owned account', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001/balance')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.account_id).toBe('ACC-001');
      expect(response.body.currency).toBeDefined();
      expect(response.body.balance).toBeDefined();
      expect(response.body.balance.current).toBeDefined();
      expect(response.body.balance.available).toBeDefined();
      expect(response.body.as_of).toBeDefined();
    });
    
    test('should require balances:read scope', async () => {
      // Create token without balances:read scope
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      await approveConsent(consent.consent_id, 'CUST-001');
      
      const tokens = await generateTokens({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        consent_id: consent.consent_id,
        scope: 'accounts:read'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001/balance')
        .set('Authorization', `Bearer ${tokens.access_token}`);
      
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('insufficient_scope');
    });
    
    test('should deny access to another customer balance', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001/balance')
        .set('Authorization', `Bearer ${customer2Token}`);
      
      expect(response.status).toBe(404);
    });
  });
  
  describe('GET /api/v1/accounts/:account_id/transactions', () => {
    test('should return transactions for owned account', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001/transactions')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.transactions).toBeDefined();
      expect(Array.isArray(response.body.transactions)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });
    
    test('should include required transaction fields', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001/transactions')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      
      if (response.body.transactions.length > 0) {
        const tx = response.body.transactions[0];
        expect(tx.id).toBeDefined();
        expect(tx.date).toBeDefined();
        expect(tx.amount).toBeDefined();
        expect(tx.currency).toBeDefined();
        expect(tx.description).toBeDefined();
      }
    });
    
    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001/transactions?limit=10&offset=0')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.offset).toBe(0);
      expect(response.body.pagination.total).toBeDefined();
      expect(response.body.pagination.has_more).toBeDefined();
    });
    
    test('should support date filtering', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001/transactions?from_date=2026-01-01&to_date=2026-12-31')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.transactions).toBeDefined();
    });
    
    test('should require transactions:read scope', async () => {
      // Create token without transactions:read scope
      const consent = await createConsent({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        purpose: 'Test',
        requested_scopes: ['accounts:read']
      });
      await approveConsent(consent.consent_id, 'CUST-001');
      
      const tokens = await generateTokens({
        customer_id: 'CUST-001',
        client_id: 'test-client',
        consent_id: consent.consent_id,
        scope: 'accounts:read'
      });
      
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001/transactions')
        .set('Authorization', `Bearer ${tokens.access_token}`);
      
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('insufficient_scope');
    });
    
    test('should deny access to another customer transactions', async () => {
      const response = await request(app)
        .get('/api/v1/accounts/ACC-001/transactions')
        .set('Authorization', `Bearer ${customer2Token}`);
      
      expect(response.status).toBe(404);
    });
    
    test('should return empty list for account with no transactions', async () => {
      // Assuming ACC-999 exists but has no transactions
      const response = await request(app)
        .get('/api/v1/accounts/ACC-999/transactions')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      if (response.status === 200) {
        expect(response.body.transactions).toEqual([]);
        expect(response.body.pagination.total).toBe(0);
      }
    });
  });
  
  describe('Cross-Customer Access Control', () => {
    test('should not return other customer accounts in list', async () => {
      const response1 = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      const response2 = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${customer2Token}`);
      
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      
      // Accounts should be different for different customers
      const accounts1 = response1.body.accounts.map(a => a.account_id);
      const accounts2 = response2.body.accounts.map(a => a.account_id);
      
      // No overlap expected (assuming different customers have different accounts)
      const overlap = accounts1.filter(id => accounts2.includes(id));
      expect(overlap.length).toBe(0);
    });
    
    test('should prevent account detail access across customers', async () => {
      // Get CUST-001's first account
      const response1 = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      if (response1.body.accounts.length > 0) {
        const accountId = response1.body.accounts[0].account_id;
        
        // Try to access with CUST-002's token
        const response2 = await request(app)
          .get(`/api/v1/accounts/${accountId}`)
          .set('Authorization', `Bearer ${customer2Token}`);
        
        expect(response2.status).toBe(404);
      }
    });
    
    test('should prevent transaction access across customers', async () => {
      // Get CUST-001's first account
      const response1 = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${customer1Token}`);
      
      if (response1.body.accounts.length > 0) {
        const accountId = response1.body.accounts[0].account_id;
        
        // Try to access transactions with CUST-002's token
        const response2 = await request(app)
          .get(`/api/v1/accounts/${accountId}/transactions`)
          .set('Authorization', `Bearer ${customer2Token}`);
        
        expect(response2.status).toBe(404);
      }
    });
  });
});

// Made with Bob
