/**
 * Audit Logging Integration Tests
 * Tests the complete audit logging flow for authorization events
 */

const request = require('supertest');
const { query } = require('../../data/db');
const { generateAccessToken } = require('../../auth/oauth/token-exchange');

// Mock database for testing
jest.mock('../../data/db');

describe('Audit Logging Integration', () => {
  let app;
  let validToken;
  let expiredToken;

  beforeAll(() => {
    // Setup test app with audit logging
    const express = require('express');
    app = express();
    app.use(express.json());

    // Import middleware
    const { completeAuthorization } = require('../../gateway/policies/complete-authorization');

    // Setup test route with complete authorization
    app.get('/api/v1/accounts', completeAuthorization(), (req, res) => {
      res.json({ accounts: [] });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Allowed Request Audit Logging', () => {
    it('should log audit event for successful authorization', async () => {
      // Mock token introspection
      query.mockImplementation((sql) => {
        if (sql.includes('INSERT INTO audit_logs')) {
          return Promise.resolve({
            rows: [{
              audit_id: 1,
              timestamp: new Date().toISOString()
            }]
          });
        }
        if (sql.includes('consents')) {
          return Promise.resolve({
            rows: [{
              consent_id: 'consent-123',
              customer_id: 'cust-456',
              client_id: 'client-789',
              status: 'approved',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              granted_scopes: 'accounts:read'
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid-token-123');

      // Verify audit log was created
      const auditCalls = query.mock.calls.filter(call => 
        call[0].includes('INSERT INTO audit_logs')
      );
      
      expect(auditCalls.length).toBeGreaterThan(0);
      
      const auditParams = auditCalls[0][1];
      expect(auditParams).toContain('allowed');
      expect(auditParams).toContain('/api/v1/accounts');
      expect(auditParams).toContain('GET');
    });

    it('should include all required fields in allowed audit log', async () => {
      query.mockImplementation((sql, params) => {
        if (sql.includes('INSERT INTO audit_logs')) {
          // Verify all required fields are present
          expect(params[0]).toBeTruthy(); // timestamp
          expect(params[1]).toBe('/api/v1/accounts'); // endpoint
          expect(params[2]).toBe('GET'); // method
          expect(params[8]).toBe('allowed'); // authorization
          expect(params[9]).toBeNull(); // reason (null for allowed)
          
          return Promise.resolve({
            rows: [{
              audit_id: 2,
              timestamp: new Date().toISOString()
            }]
          });
        }
        if (sql.includes('consents')) {
          return Promise.resolve({
            rows: [{
              consent_id: 'consent-123',
              status: 'approved',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              granted_scopes: 'accounts:read'
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer valid-token-123');
    });
  });

  describe('Denied Request Audit Logging', () => {
    it('should log audit event for missing token', async () => {
      query.mockImplementation((sql, params) => {
        if (sql.includes('INSERT INTO audit_logs')) {
          expect(params[8]).toBe('denied'); // authorization
          expect(params[9]).toBe('missing_token'); // reason
          
          return Promise.resolve({
            rows: [{
              audit_id: 3,
              timestamp: new Date().toISOString()
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/accounts');

      expect(response.status).toBe(401);
      
      // Verify audit log was created with denial reason
      const auditCalls = query.mock.calls.filter(call => 
        call[0].includes('INSERT INTO audit_logs')
      );
      expect(auditCalls.length).toBeGreaterThan(0);
    });

    it('should log audit event for insufficient scope', async () => {
      query.mockImplementation((sql, params) => {
        if (sql.includes('INSERT INTO audit_logs')) {
          if (params[8] === 'denied') {
            expect(params[9]).toBe('insufficient_scope'); // reason
          }
          return Promise.resolve({
            rows: [{
              audit_id: 4,
              timestamp: new Date().toISOString()
            }]
          });
        }
        if (sql.includes('consents')) {
          return Promise.resolve({
            rows: [{
              consent_id: 'consent-123',
              status: 'approved',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              granted_scopes: 'profile:read' // Wrong scope
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer token-with-wrong-scope');

      expect(response.status).toBe(403);
    });

    it('should log audit event for revoked consent', async () => {
      query.mockImplementation((sql, params) => {
        if (sql.includes('INSERT INTO audit_logs')) {
          if (params[8] === 'denied') {
            expect(params[9]).toBe('revoked_consent'); // reason
          }
          return Promise.resolve({
            rows: [{
              audit_id: 5,
              timestamp: new Date().toISOString()
            }]
          });
        }
        if (sql.includes('consents')) {
          return Promise.resolve({
            rows: [{
              consent_id: 'consent-123',
              status: 'revoked', // Revoked consent
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              granted_scopes: 'accounts:read'
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer token-with-revoked-consent');

      expect(response.status).toBe(403);
    });

    it('should log audit event for expired consent', async () => {
      query.mockImplementation((sql, params) => {
        if (sql.includes('INSERT INTO audit_logs')) {
          if (params[8] === 'denied') {
            expect(params[9]).toBe('expired_consent'); // reason
          }
          return Promise.resolve({
            rows: [{
              audit_id: 6,
              timestamp: new Date().toISOString()
            }]
          });
        }
        if (sql.includes('consents')) {
          return Promise.resolve({
            rows: [{
              consent_id: 'consent-123',
              status: 'approved',
              expires_at: new Date(Date.now() - 86400000).toISOString(), // Expired
              granted_scopes: 'accounts:read'
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer token-with-expired-consent');

      expect(response.status).toBe(403);
    });

    it('should log audit event for expired token', async () => {
      query.mockImplementation((sql, params) => {
        if (sql.includes('INSERT INTO audit_logs')) {
          if (params[8] === 'denied') {
            expect(params[9]).toMatch(/expired_token|invalid_token/); // reason
          }
          return Promise.resolve({
            rows: [{
              audit_id: 7,
              timestamp: new Date().toISOString()
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer expired-token-123');

      expect(response.status).toBe(401);
    });
  });

  describe('Audit Log Metadata', () => {
    it('should include IP address and user agent in audit log', async () => {
      query.mockImplementation((sql, params) => {
        if (sql.includes('INSERT INTO audit_logs')) {
          expect(params[10]).toBeTruthy(); // ip_address
          expect(params[11]).toBe('Test User Agent'); // user_agent
          
          return Promise.resolve({
            rows: [{
              audit_id: 8,
              timestamp: new Date().toISOString()
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await request(app)
        .get('/api/v1/accounts')
        .set('User-Agent', 'Test User Agent');
    });

    it('should include additional context in metadata for denied requests', async () => {
      query.mockImplementation((sql, params) => {
        if (sql.includes('INSERT INTO audit_logs')) {
          if (params[8] === 'denied') {
            const metadata = params[14]; // metadata field
            if (metadata) {
              const parsed = JSON.parse(metadata);
              expect(parsed).toHaveProperty('consent_status');
            }
          }
          return Promise.resolve({
            rows: [{
              audit_id: 9,
              timestamp: new Date().toISOString()
            }]
          });
        }
        if (sql.includes('consents')) {
          return Promise.resolve({
            rows: [{
              consent_id: 'consent-123',
              status: 'revoked',
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              granted_scopes: 'accounts:read'
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', 'Bearer token-123');
    });
  });

  describe('Audit Log Querying', () => {
    it('should be able to query audit logs by customer', async () => {
      const { queryAuditLogs } = require('../../gateway/policies/audit-logger');
      
      const mockLogs = [
        {
          audit_id: 1,
          customer_id: 'cust-456',
          authorization: 'allowed'
        },
        {
          audit_id: 2,
          customer_id: 'cust-456',
          authorization: 'denied',
          reason: 'insufficient_scope'
        }
      ];

      query.mockResolvedValue({ rows: mockLogs });

      const logs = await queryAuditLogs({ customer_id: 'cust-456' });

      expect(logs).toEqual(mockLogs);
      expect(logs.length).toBe(2);
    });

    it('should be able to get audit statistics', async () => {
      const { getAuditStatistics } = require('../../gateway/policies/audit-logger');
      
      const mockStats = {
        total_events: 100,
        allowed_count: 80,
        denied_count: 20,
        unique_customers: 10
      };

      query.mockResolvedValue({ rows: [mockStats] });

      const stats = await getAuditStatistics();

      expect(stats).toEqual(mockStats);
      expect(stats.total_events).toBe(100);
      expect(stats.allowed_count).toBe(80);
      expect(stats.denied_count).toBe(20);
    });
  });
});

// Made with Bob