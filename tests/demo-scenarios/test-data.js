/**
 * Test Data for Demo Scenarios
 * Deterministic test data for repeatable demos
 */

/**
 * Test customers
 */
const TEST_CUSTOMERS = {
  ALICE: {
    customer_id: 'cust-demo-alice',
    username: 'alice.demo',
    email: 'alice@demo.example.com',
    name: 'Alice Demo',
    password: 'demo-password-123'
  },
  BOB: {
    customer_id: 'cust-demo-bob',
    username: 'bob.demo',
    email: 'bob@demo.example.com',
    name: 'Bob Demo',
    password: 'demo-password-456'
  }
};

/**
 * Test OAuth clients
 */
const TEST_CLIENTS = {
  FINTECH_DEMO: {
    client_id: 'demo-fintech-client',
    client_name: 'Demo Fintech Application',
    client_secret: 'demo-client-secret-abc123',
    redirect_uris: ['http://localhost:3000/callback'],
    allowed_scopes: 'accounts:read transactions:read balances:read profile:read'
  },
  LIMITED_CLIENT: {
    client_id: 'demo-limited-client',
    client_name: 'Demo Limited Application',
    client_secret: 'demo-client-secret-xyz789',
    redirect_uris: ['http://localhost:3000/callback'],
    allowed_scopes: 'accounts:read'
  }
};

/**
 * Test accounts
 */
const TEST_ACCOUNTS = {
  ALICE_CHECKING: {
    account_id: 'acc-demo-alice-checking',
    customer_id: 'cust-demo-alice',
    account_type: 'checking',
    account_number: '1234567890',
    balance: 5000.00,
    currency: 'USD'
  },
  ALICE_SAVINGS: {
    account_id: 'acc-demo-alice-savings',
    customer_id: 'cust-demo-alice',
    account_type: 'savings',
    account_number: '0987654321',
    balance: 15000.00,
    currency: 'USD'
  }
};

/**
 * Test scopes
 */
const TEST_SCOPES = {
  ACCOUNTS_ONLY: 'accounts:read',
  TRANSACTIONS_ONLY: 'transactions:read',
  ACCOUNTS_AND_TRANSACTIONS: 'accounts:read transactions:read',
  ALL_SCOPES: 'accounts:read transactions:read balances:read profile:read'
};

/**
 * API endpoints
 */
const API_ENDPOINTS = {
  // OAuth endpoints
  AUTHORIZE: 'http://localhost:8080/oauth/authorize',
  TOKEN: 'http://localhost:8080/oauth/token',
  INTROSPECT: 'http://localhost:8080/oauth/introspect',
  
  // Banking API endpoints
  ACCOUNTS: 'http://localhost:8080/api/v1/accounts',
  ACCOUNT_DETAIL: (accountId) => `http://localhost:8080/api/v1/accounts/${accountId}`,
  TRANSACTIONS: (accountId) => `http://localhost:8080/api/v1/accounts/${accountId}/transactions`,
  BALANCE: (accountId) => `http://localhost:8080/api/v1/accounts/${accountId}/balance`,
  
  // Consent endpoints
  CONSENT_APPROVE: 'http://localhost:3001/consent/approve',
  CONSENT_REVOKE: 'http://localhost:3001/consent/revoke',
  CONSENT_STATUS: (consentId) => `http://localhost:3001/consent/${consentId}`,
  
  // Audit endpoints
  AUDIT_LOGS: 'http://localhost:8080/admin/audit-logs'
};

/**
 * Expected HTTP status codes
 */
const EXPECTED_STATUS = {
  SUCCESS: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  REDIRECT: 302,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  SERVER_ERROR: 500
};

/**
 * Rate limit configuration for testing
 */
const RATE_LIMIT_CONFIG = {
  MAX_REQUESTS: 10,
  WINDOW_MS: 10000, // 10 seconds
  REQUESTS_TO_TRIGGER: 11 // One more than max to trigger limit
};

/**
 * Token expiration for testing
 */
const TOKEN_EXPIRY = {
  SHORT: 5, // 5 seconds for expiration testing
  NORMAL: 3600, // 1 hour
  LONG: 86400 // 24 hours
};

module.exports = {
  TEST_CUSTOMERS,
  TEST_CLIENTS,
  TEST_ACCOUNTS,
  TEST_SCOPES,
  API_ENDPOINTS,
  EXPECTED_STATUS,
  RATE_LIMIT_CONFIG,
  TOKEN_EXPIRY
};

// Made with Bob
