/**
 * Audit Logger Tests
 * Tests for audit logging functionality
 */

const { 
  logAuditEvent, 
  logAllowedRequest, 
  logDeniedRequest,
  queryAuditLogs,
  getAuditStatistics,
  DENIAL_REASONS 
} = require('../../gateway/policies/audit-logger');
const { query } = require('../../data/db');

// Mock the database query function
jest.mock('../../data/db');

describe('Audit Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  describe('logAuditEvent', () => {
    it('should log an allowed authorization event', async () => {
      const mockResult = {
        rows: [{
          audit_id: 1,
          timestamp: new Date().toISOString()
        }]
      };
      query.mockResolvedValue(mockResult);

      const event = {
        endpoint: '/api/v1/accounts',
        method: 'GET',
        client_id: 'client-123',
        customer_id: 'cust-456',
        consent_id: 'consent-789',
        scope: 'accounts:read',
        authorization: 'allowed',
        http_status: 200
      };

      const result = await logAuditEvent(event);

      expect(result).toEqual(mockResult.rows[0]);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          expect.any(String), // timestamp
          '/api/v1/accounts',
          'GET',
          'client-123',
          'cust-456',
          'consent-789',
          'accounts:read',
          null, // required_scope
          'allowed',
          null, // reason
          null, // ip_address
          null, // user_agent
          null, // token_id
          200,
          null  // metadata
        ])
      );
      expect(console.info).toHaveBeenCalled();
    });

    it('should log a denied authorization event with reason', async () => {
      const mockResult = {
        rows: [{
          audit_id: 2,
          timestamp: new Date().toISOString()
        }]
      };
      query.mockResolvedValue(mockResult);

      const event = {
        endpoint: '/api/v1/accounts',
        method: 'GET',
        client_id: 'client-123',
        customer_id: 'cust-456',
        authorization: 'denied',
        reason: DENIAL_REASONS.INSUFFICIENT_SCOPE,
        http_status: 403
      };

      const result = await logAuditEvent(event);

      expect(result).toEqual(mockResult.rows[0]);
      expect(query).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should return null if required fields are missing', async () => {
      const event = {
        endpoint: '/api/v1/accounts',
        // Missing method and authorization
      };

      const result = await logAuditEvent(event);

      expect(result).toBeNull();
      expect(query).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it('should return null if authorization is denied without reason', async () => {
      const event = {
        endpoint: '/api/v1/accounts',
        method: 'GET',
        authorization: 'denied',
        // Missing reason
      };

      const result = await logAuditEvent(event);

      expect(result).toBeNull();
      expect(query).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      query.mockRejectedValue(new Error('Database error'));

      const event = {
        endpoint: '/api/v1/accounts',
        method: 'GET',
        authorization: 'allowed',
        http_status: 200
      };

      const result = await logAuditEvent(event);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Failed to log audit event:',
        expect.any(Error)
      );
    });
  });

  describe('logAllowedRequest', () => {
    it('should log an allowed request with OAuth token', async () => {
      const mockResult = {
        rows: [{
          audit_id: 3,
          timestamp: new Date().toISOString()
        }]
      };
      query.mockResolvedValue(mockResult);

      const req = {
        path: '/api/v1/accounts',
        method: 'GET',
        ip: '192.168.1.1',
        headers: {
          'user-agent': 'Test Client'
        },
        oauth_token: {
          client_id: 'client-123',
          customer_id: 'cust-456',
          consent_id: 'consent-789',
          scope: 'accounts:read',
          token_id: 'token-abc'
        }
      };

      const result = await logAllowedRequest(req, 200);

      expect(result).toEqual(mockResult.rows[0]);
      expect(query).toHaveBeenCalled();
    });

    it('should log an allowed request without OAuth token', async () => {
      const mockResult = {
        rows: [{
          audit_id: 4,
          timestamp: new Date().toISOString()
        }]
      };
      query.mockResolvedValue(mockResult);

      const req = {
        path: '/api/v1/public',
        method: 'GET',
        ip: '192.168.1.1',
        headers: {}
      };

      const result = await logAllowedRequest(req);

      expect(result).toEqual(mockResult.rows[0]);
      expect(query).toHaveBeenCalled();
    });
  });

  describe('logDeniedRequest', () => {
    it('should log a denied request with reason', async () => {
      const mockResult = {
        rows: [{
          audit_id: 5,
          timestamp: new Date().toISOString()
        }]
      };
      query.mockResolvedValue(mockResult);

      const req = {
        path: '/api/v1/accounts',
        method: 'GET',
        ip: '192.168.1.1',
        headers: {
          'user-agent': 'Test Client'
        },
        oauth_token: {
          client_id: 'client-123',
          customer_id: 'cust-456',
          consent_id: 'consent-789',
          scope: 'accounts:read'
        }
      };

      const result = await logDeniedRequest(
        req, 
        DENIAL_REASONS.INSUFFICIENT_SCOPE, 
        403,
        { granted_scopes: ['accounts:read'], required_scopes: ['transactions:read'] }
      );

      expect(result).toEqual(mockResult.rows[0]);
      expect(query).toHaveBeenCalled();
    });

    it('should log denied request for invalid token', async () => {
      const mockResult = {
        rows: [{
          audit_id: 6,
          timestamp: new Date().toISOString()
        }]
      };
      query.mockResolvedValue(mockResult);

      const req = {
        path: '/api/v1/accounts',
        method: 'GET',
        ip: '192.168.1.1',
        headers: {}
      };

      const result = await logDeniedRequest(
        req, 
        DENIAL_REASONS.INVALID_TOKEN, 
        401
      );

      expect(result).toEqual(mockResult.rows[0]);
      expect(query).toHaveBeenCalled();
    });

    it('should log denied request for revoked consent', async () => {
      const mockResult = {
        rows: [{
          audit_id: 7,
          timestamp: new Date().toISOString()
        }]
      };
      query.mockResolvedValue(mockResult);

      const req = {
        path: '/api/v1/accounts',
        method: 'GET',
        ip: '192.168.1.1',
        headers: {},
        oauth_token: {
          client_id: 'client-123',
          customer_id: 'cust-456',
          consent_id: 'consent-789'
        }
      };

      const result = await logDeniedRequest(
        req, 
        DENIAL_REASONS.REVOKED_CONSENT, 
        403,
        { consent_status: 'revoked' }
      );

      expect(result).toEqual(mockResult.rows[0]);
      expect(query).toHaveBeenCalled();
    });
  });

  describe('queryAuditLogs', () => {
    it('should query audit logs with filters', async () => {
      const mockLogs = [
        {
          audit_id: 1,
          timestamp: new Date().toISOString(),
          endpoint: '/api/v1/accounts',
          authorization: 'allowed'
        },
        {
          audit_id: 2,
          timestamp: new Date().toISOString(),
          endpoint: '/api/v1/transactions',
          authorization: 'denied'
        }
      ];
      query.mockResolvedValue({ rows: mockLogs });

      const filters = {
        customer_id: 'cust-456',
        authorization: 'allowed',
        limit: 10,
        offset: 0
      };

      const result = await queryAuditLogs(filters);

      expect(result).toEqual(mockLogs);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        expect.arrayContaining(['cust-456', 'allowed', 10, 0])
      );
    });

    it('should query audit logs without filters', async () => {
      const mockLogs = [];
      query.mockResolvedValue({ rows: mockLogs });

      const result = await queryAuditLogs();

      expect(result).toEqual(mockLogs);
      expect(query).toHaveBeenCalled();
    });

    it('should handle query errors', async () => {
      query.mockRejectedValue(new Error('Query error'));

      await expect(queryAuditLogs()).rejects.toThrow('Query error');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('getAuditStatistics', () => {
    it('should return audit statistics', async () => {
      const mockStats = {
        total_events: 100,
        allowed_count: 80,
        denied_count: 20,
        unique_customers: 10,
        unique_clients: 5,
        unique_endpoints: 8,
        reason_breakdown: {
          allowed: 80,
          insufficient_scope: 15,
          revoked_consent: 5
        }
      };
      query.mockResolvedValue({ rows: [mockStats] });

      const result = await getAuditStatistics();

      expect(result).toEqual(mockStats);
      expect(query).toHaveBeenCalled();
    });

    it('should return statistics with filters', async () => {
      const mockStats = {
        total_events: 50,
        allowed_count: 40,
        denied_count: 10
      };
      query.mockResolvedValue({ rows: [mockStats] });

      const filters = {
        customer_id: 'cust-456',
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31')
      };

      const result = await getAuditStatistics(filters);

      expect(result).toEqual(mockStats);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)'),
        expect.arrayContaining(['cust-456', filters.start_date, filters.end_date])
      );
    });
  });

  describe('DENIAL_REASONS', () => {
    it('should have all required denial reasons', () => {
      expect(DENIAL_REASONS).toHaveProperty('INVALID_TOKEN');
      expect(DENIAL_REASONS).toHaveProperty('EXPIRED_TOKEN');
      expect(DENIAL_REASONS).toHaveProperty('INSUFFICIENT_SCOPE');
      expect(DENIAL_REASONS).toHaveProperty('MISSING_CONSENT');
      expect(DENIAL_REASONS).toHaveProperty('REVOKED_CONSENT');
      expect(DENIAL_REASONS).toHaveProperty('EXPIRED_CONSENT');
      expect(DENIAL_REASONS).toHaveProperty('DENIED_CONSENT');
      expect(DENIAL_REASONS).toHaveProperty('RATE_LIMIT_EXCEEDED');
      expect(DENIAL_REASONS).toHaveProperty('MISSING_TOKEN');
      expect(DENIAL_REASONS).toHaveProperty('MALFORMED_TOKEN');
      expect(DENIAL_REASONS).toHaveProperty('SCOPE_MISMATCH');
    });
  });
});

// Made with Bob