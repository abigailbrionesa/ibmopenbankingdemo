/**
 * Security Test Fixtures
 * Reusable test data and helper functions for security tests
 */

const jwt = require('jsonwebtoken');

/**
 * Test JWT secret (for testing only)
 */
const TEST_JWT_SECRET = 'test-secret-for-security-tests-only';

/**
 * Generate a valid JWT token for testing
 * 
 * @param {Object} payload - Token payload
 * @param {Object} options - JWT sign options
 * @returns {string} JWT token
 */
function generateTestToken(payload = {}, options = {}) {
  const defaultPayload = {
    customer_id: 'cust-test-123',
    client_id: 'client-test-456',
    consent_id: 'consent-test-789',
    scope: 'accounts:read',
    token_id: 'token-test-abc',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000)
  };
  
  const finalPayload = { ...defaultPayload, ...payload };
  const defaultOptions = { algorithm: 'HS256' };
  const finalOptions = { ...defaultOptions, ...options };
  
  return jwt.sign(finalPayload, TEST_JWT_SECRET, finalOptions);
}

/**
 * Generate an expired JWT token for testing
 * 
 * @param {Object} payload - Token payload
 * @returns {string} Expired JWT token
 */
function generateExpiredToken(payload = {}) {
  const expiredPayload = {
    customer_id: 'cust-test-123',
    client_id: 'client-test-456',
    consent_id: 'consent-test-789',
    scope: 'accounts:read',
    token_id: 'token-test-expired',
    exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    iat: Math.floor(Date.now() / 1000) - 7200 // 2 hours ago
  };
  
  return jwt.sign({ ...expiredPayload, ...payload }, TEST_JWT_SECRET);
}

/**
 * Generate a malformed JWT token for testing
 * 
 * @returns {string} Malformed token
 */
function generateMalformedToken() {
  return 'malformed.token.here';
}

/**
 * Test customer data
 */
const TEST_CUSTOMERS = {
  VALID: {
    customer_id: 'cust-test-001',
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User'
  },
  ANOTHER: {
    customer_id: 'cust-test-002',
    username: 'anotheruser',
    email: 'another@example.com',
    name: 'Another User'
  }
};

/**
 * Test OAuth client data
 */
const TEST_CLIENTS = {
  VALID: {
    client_id: 'client-test-fintech',
    client_name: 'Test Fintech App',
    redirect_uris: ['https://test.example.com/callback'],
    client_secret: 'test-client-secret-123'
  },
  ANOTHER: {
    client_id: 'client-test-another',
    client_name: 'Another Test App',
    redirect_uris: ['https://another.example.com/callback'],
    client_secret: 'test-client-secret-456'
  }
};

/**
 * Test consent data
 */
const TEST_CONSENTS = {
  APPROVED: {
    consent_id: 'consent-test-approved',
    customer_id: 'cust-test-001',
    client_id: 'client-test-fintech',
    status: 'approved',
    granted_scopes: 'accounts:read transactions:read',
    expires_at: new Date(Date.now() + 86400000 * 90).toISOString(), // 90 days from now
    approved_at: new Date().toISOString()
  },
  REVOKED: {
    consent_id: 'consent-test-revoked',
    customer_id: 'cust-test-001',
    client_id: 'client-test-fintech',
    status: 'revoked',
    granted_scopes: 'accounts:read',
    expires_at: new Date(Date.now() + 86400000 * 90).toISOString(),
    approved_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    revoked_at: new Date().toISOString(),
    revoked_by: 'cust-test-001',
    revocation_reason: 'User requested revocation'
  },
  EXPIRED: {
    consent_id: 'consent-test-expired',
    customer_id: 'cust-test-001',
    client_id: 'client-test-fintech',
    status: 'expired',
    granted_scopes: 'accounts:read',
    expires_at: new Date(Date.now() - 86400000).toISOString(), // Expired yesterday
    approved_at: new Date(Date.now() - 86400000 * 91).toISOString()
  },
  DENIED: {
    consent_id: 'consent-test-denied',
    customer_id: 'cust-test-001',
    client_id: 'client-test-fintech',
    status: 'denied',
    requested_scopes: 'accounts:read transactions:read',
    denied_at: new Date().toISOString()
  },
  PENDING: {
    consent_id: 'consent-test-pending',
    customer_id: 'cust-test-001',
    client_id: 'client-test-fintech',
    status: 'pending',
    requested_scopes: 'accounts:read',
    created_at: new Date().toISOString()
  }
};

/**
 * Test scope combinations
 */
const TEST_SCOPES = {
  ACCOUNTS_ONLY: 'accounts:read',
  TRANSACTIONS_ONLY: 'transactions:read',
  BALANCES_ONLY: 'balances:read',
  PROFILE_ONLY: 'profile:read',
  ACCOUNTS_AND_TRANSACTIONS: 'accounts:read transactions:read',
  ALL_SCOPES: 'accounts:read transactions:read balances:read profile:read',
  INVALID_SCOPE: 'invalid:scope'
};

/**
 * Test token introspection responses
 */
const TEST_INTROSPECTION = {
  ACTIVE: {
    active: true,
    scope: 'accounts:read transactions:read',
    client_id: 'client-test-fintech',
    token_type: 'Bearer',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    sub: 'cust-test-001',
    customer_id: 'cust-test-001',
    consent_id: 'consent-test-approved',
    token_id: 'token-test-abc'
  },
  INACTIVE: {
    active: false,
    error: 'invalid_token',
    error_description: 'Token is not active'
  },
  EXPIRED: {
    active: false,
    error: 'token_expired',
    error_description: 'Token has expired'
  },
  REVOKED: {
    active: false,
    error: 'token_revoked',
    error_description: 'Token has been revoked'
  }
};

/**
 * Mock database query responses
 */
const MOCK_DB_RESPONSES = {
  CONSENT_APPROVED: {
    rows: [{
      consent_id: 'consent-test-approved',
      customer_id: 'cust-test-001',
      client_id: 'client-test-fintech',
      status: 'approved',
      expires_at: new Date(Date.now() + 86400000 * 90).toISOString(),
      granted_scopes: 'accounts:read transactions:read'
    }]
  },
  CONSENT_REVOKED: {
    rows: [{
      consent_id: 'consent-test-revoked',
      customer_id: 'cust-test-001',
      client_id: 'client-test-fintech',
      status: 'revoked',
      expires_at: new Date(Date.now() + 86400000 * 90).toISOString(),
      granted_scopes: 'accounts:read'
    }]
  },
  CONSENT_EXPIRED: {
    rows: [{
      consent_id: 'consent-test-expired',
      customer_id: 'cust-test-001',
      client_id: 'client-test-fintech',
      status: 'approved',
      expires_at: new Date(Date.now() - 86400000).toISOString(),
      granted_scopes: 'accounts:read'
    }]
  },
  CONSENT_NOT_FOUND: {
    rows: []
  }
};

/**
 * Create mock token verification response
 * 
 * @param {boolean} valid - Whether token is valid
 * @param {Object} payload - Token payload
 * @param {string} error - Error code
 * @param {string} errorDescription - Error description
 * @returns {Object} Mock verification response
 */
function createMockTokenVerification(valid, payload = null, error = null, errorDescription = null) {
  if (valid) {
    return {
      valid: true,
      payload: payload || {
        customer_id: 'cust-test-001',
        client_id: 'client-test-fintech',
        consent_id: 'consent-test-approved',
        scope: 'accounts:read',
        token_id: 'token-test-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      },
      token: { id: 'token-test-abc' }
    };
  } else {
    return {
      valid: false,
      error: error || 'invalid_token',
      error_description: errorDescription || 'Token is invalid'
    };
  }
}

/**
 * Create mock consent database response
 * 
 * @param {string} status - Consent status
 * @param {string} scopes - Granted scopes
 * @param {boolean} expired - Whether consent is expired
 * @returns {Object} Mock database response
 */
function createMockConsentResponse(status = 'approved', scopes = 'accounts:read', expired = false) {
  const expiresAt = expired
    ? new Date(Date.now() - 86400000).toISOString()
    : new Date(Date.now() + 86400000 * 90).toISOString();
  
  return {
    rows: [{
      consent_id: 'consent-test-001',
      customer_id: 'cust-test-001',
      client_id: 'client-test-fintech',
      status: status,
      expires_at: expiresAt,
      granted_scopes: scopes
    }]
  };
}

/**
 * Test API endpoints
 */
const TEST_ENDPOINTS = {
  ACCOUNTS_LIST: '/api/v1/accounts',
  ACCOUNT_DETAIL: '/api/v1/accounts/acc-test-001',
  TRANSACTIONS: '/api/v1/accounts/acc-test-001/transactions',
  BALANCE: '/api/v1/accounts/acc-test-001/balance',
  PROFILE: '/api/v1/profile'
};

/**
 * Expected error responses
 */
const EXPECTED_ERRORS = {
  NO_TOKEN: {
    status: 401,
    error: 'unauthorized',
    error_description: 'Authorization header required'
  },
  INVALID_TOKEN: {
    status: 401,
    error: 'invalid_token'
  },
  EXPIRED_TOKEN: {
    status: 401,
    error: 'invalid_token'
  },
  INSUFFICIENT_SCOPE: {
    status: 403,
    error: 'insufficient_scope'
  },
  REVOKED_CONSENT: {
    status: 403,
    error: 'forbidden'
  },
  EXPIRED_CONSENT: {
    status: 403,
    error: 'forbidden'
  }
};

module.exports = {
  TEST_JWT_SECRET,
  generateTestToken,
  generateExpiredToken,
  generateMalformedToken,
  TEST_CUSTOMERS,
  TEST_CLIENTS,
  TEST_CONSENTS,
  TEST_SCOPES,
  TEST_INTROSPECTION,
  MOCK_DB_RESPONSES,
  createMockTokenVerification,
  createMockConsentResponse,
  TEST_ENDPOINTS,
  EXPECTED_ERRORS
};

// Made with Bob