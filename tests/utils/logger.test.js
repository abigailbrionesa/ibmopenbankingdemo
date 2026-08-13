/**
 * Logger Tests
 * Verify logging functionality, correlation IDs, and secret redaction
 */

const { 
  Logger, 
  createLogger, 
  redactSensitiveData,
  generateCorrelationId 
} = require('../../utils/logger');

describe('Logger Utility', () => {
  let logger;
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    logger = createLogger('test-component');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Correlation ID', () => {
    test('should generate unique correlation IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      
      expect(id1).toMatch(/^corr_[a-f0-9]{32}$/);
      expect(id2).toMatch(/^corr_[a-f0-9]{32}$/);
      expect(id1).not.toBe(id2);
    });

    test('should include correlation ID in log entries', () => {
      logger.info('Test message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.correlation_id).toMatch(/^corr_[a-f0-9]{32}$/);
    });

    test('should preserve correlation ID in child loggers', () => {
      const childLogger = logger.child('sub-component');
      
      logger.info('Parent message');
      childLogger.info('Child message');
      
      const parentLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      const childLog = JSON.parse(consoleLogSpy.mock.calls[1][0]);
      
      expect(parentLog.correlation_id).toBe(childLog.correlation_id);
    });
  });

  describe('Secret Redaction', () => {
    test('should redact password fields', () => {
      const data = {
        username: 'user123',
        password: 'secret123',
        email: 'user@example.com'
      };
      
      const redacted = redactSensitiveData(data);
      
      expect(redacted.username).toBe('user123');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.email).toBe('user@example.com');
    });

    test('should redact token fields', () => {
      const data = {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
        refresh_token: 'refresh_abc123def456',
        user_id: 'user123'
      };
      
      const redacted = redactSensitiveData(data);
      
      expect(redacted.access_token).toBe('[REDACTED_TOKEN]');
      expect(redacted.refresh_token).toBe('[REDACTED]');
      expect(redacted.user_id).toBe('user123');
    });

    test('should redact client secrets', () => {
      const data = {
        client_id: 'client123',
        client_secret: 'very_secret_key_12345',
        name: 'Test Client'
      };
      
      const redacted = redactSensitiveData(data);
      
      expect(redacted.client_id).toBe('client123');
      expect(redacted.client_secret).toBe('[REDACTED]');
      expect(redacted.name).toBe('Test Client');
    });

    test('should redact authorization headers', () => {
      const data = {
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature'
        }
      };
      
      const redacted = redactSensitiveData(data);
      
      expect(redacted.headers['content-type']).toBe('application/json');
      expect(redacted.headers.authorization).toBe('[REDACTED]');
    });

    test('should handle nested objects', () => {
      const data = {
        user: {
          id: 'user123',
          credentials: {
            password: 'secret',
            api_key: 'key123'
          }
        }
      };
      
      const redacted = redactSensitiveData(data);
      
      expect(redacted.user.id).toBe('user123');
      expect(redacted.user.credentials.password).toBe('[REDACTED]');
      expect(redacted.user.credentials.api_key).toBe('[REDACTED]');
    });

    test('should handle arrays', () => {
      const data = {
        tokens: [
          { token: 'token1', type: 'access' },
          { token: 'token2', type: 'refresh' }
        ]
      };
      
      const redacted = redactSensitiveData(data);
      
      expect(redacted.tokens[0].token).toBe('[REDACTED]');
      expect(redacted.tokens[0].type).toBe('access');
      expect(redacted.tokens[1].token).toBe('[REDACTED]');
    });
  });

  describe('Log Levels', () => {
    test('should log info messages', () => {
      logger.info('Info message', { key: 'value' });
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.level).toBe('info');
      expect(logEntry.message).toBe('Info message');
      expect(logEntry.key).toBe('value');
    });

    test('should log warning messages', () => {
      logger.warn('Warning message', { issue: 'minor' });
      
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      
      expect(logEntry.level).toBe('warn');
      expect(logEntry.message).toBe('Warning message');
      expect(logEntry.issue).toBe('minor');
    });

    test('should log error messages', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);
      
      expect(consoleErrorSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry.level).toBe('error');
      expect(logEntry.message).toBe('Error occurred');
      expect(logEntry.error_message).toBe('Test error');
      expect(logEntry.error_name).toBe('Error');
      expect(logEntry.error_stack).toBeDefined();
    });
  });

  describe('Specialized Logging', () => {
    test('should log authentication events', () => {
      logger.logAuth('login_success', {
        customer_id: 'cust123',
        ip_address: '192.168.1.1'
      });
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.event_type).toBe('authentication');
      expect(logEntry.auth_event).toBe('login_success');
      expect(logEntry.customer_id).toBe('cust123');
    });

    test('should log authorization events', () => {
      logger.logAuthz('token_validation', {
        token_id: 'token123',
        valid: true
      });
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.event_type).toBe('authorization');
      expect(logEntry.authz_event).toBe('token_validation');
      expect(logEntry.token_id).toBe('token123');
    });

    test('should log consent events', () => {
      logger.logConsent('consent_granted', {
        consent_id: 'consent123',
        scopes: ['accounts:read']
      });
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.event_type).toBe('consent');
      expect(logEntry.consent_event).toBe('consent_granted');
      expect(logEntry.consent_id).toBe('consent123');
    });

    test('should log API calls with latency', () => {
      logger.logApiCall('GET', '/api/v1/accounts', 200, 45, {
        customer_id: 'cust123'
      });
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.event_type).toBe('api_call');
      expect(logEntry.method).toBe('GET');
      expect(logEntry.endpoint).toBe('/api/v1/accounts');
      expect(logEntry.status_code).toBe(200);
      expect(logEntry.latency_ms).toBe(45);
    });
  });

  describe('Latency Tracking', () => {
    test('should track operation latency', (done) => {
      const endTimer = logger.startTimer();
      
      setTimeout(() => {
        const latency = endTimer();
        expect(latency).toBeGreaterThanOrEqual(10);
        expect(latency).toBeLessThan(50);
        done();
      }, 10);
    });
  });

  describe('Component Naming', () => {
    test('should include component name in logs', () => {
      logger.info('Test message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.component).toBe('test-component');
    });

    test('should create hierarchical component names for children', () => {
      const childLogger = logger.child('sub-component');
      childLogger.info('Child message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.component).toBe('test-component.sub-component');
    });
  });

  describe('Timestamp', () => {
    test('should include ISO timestamp in logs', () => {
      logger.info('Test message');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});

// Made with Bob