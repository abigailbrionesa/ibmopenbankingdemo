/**
 * Customer Authentication Service
 * Handles demo customer authentication for the consent flow

 * Production implementation must use regulatory-compliant SCA methods.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { createLogger } = require('../utils/logger');

const logger = createLogger('customer-authentication');

// Session configuration
const SESSION_DURATION_MINUTES = 30;
const SESSION_TOKEN_LENGTH = 32;

/**
 * Generate a secure session token
 * @returns {string} Session token
 */
function generateSessionToken() {
  return crypto.randomBytes(SESSION_TOKEN_LENGTH).toString('base64url');
}

/**
 * Generate a unique session ID
 * @returns {string} Session ID
 */
function generateSessionId() {
  return `session_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Demo customer login
 * 
 * DEMO ONLY: This uses simple email/password authentication.
 * Production MUST implement SCA-compliant authentication.
 * 
 * @param {Object} credentials - Login credentials
 * @param {string} credentials.email - Customer email
 * @param {string} credentials.password - Customer password (demo only)
 * @param {string} [credentials.ip_address] - Client IP address
 * @param {string} [credentials.user_agent] - Client user agent
 * @returns {Promise<Object>} Authentication result
 */
async function authenticateCustomer(credentials) {
  const { email, password, ip_address, user_agent } = credentials;
  const requestLogger = logger.child('authenticate');
  const endTimer = requestLogger.startTimer();
  
  requestLogger.logAuth('login_attempt', {
    email,
    ip_address,
    user_agent
  });
  
  if (!email || !password) {
    const latency = endTimer();
    requestLogger.logAuth('login_failure', {
      reason: 'missing_credentials',
      email,
      latency_ms: latency
    });
    return {
      success: false,
      error: 'Email and password are required'
    };
  }
  
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });
  
  try {
    // Find customer by email
    const customerQuery = `
      SELECT customer_id, name, email, status
      FROM customers
      WHERE email = $1 AND status = 'active'
    `;
    
    const customerResult = await pool.query(customerQuery, [email]);
    
    if (customerResult.rows.length === 0) {
      const latency = endTimer();
      requestLogger.logAuth('login_failure', {
        reason: 'customer_not_found',
        email,
        latency_ms: latency
      });
      return {
        success: false,
        error: 'Invalid credentials'
      };
    }
    
    const customer = customerResult.rows[0];
    
    // DEMO ONLY: In production, verify password hash from secure storage
    // For demo, we accept a simple password check
    const isDemoPassword = password === 'demo123' || password === customer.customer_id;
    
    if (!isDemoPassword) {
      const latency = endTimer();
      requestLogger.logAuth('login_failure', {
        reason: 'invalid_password',
        customer_id: customer.customer_id,
        email,
        latency_ms: latency
      });
      return {
        success: false,
        error: 'Invalid credentials'
      };
    }
    
    // Create session
    const sessionId = generateSessionId();
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MINUTES * 60 * 1000);
    
    const sessionQuery = `
      INSERT INTO customer_sessions (
        session_id,
        customer_id,
        session_token,
        ip_address,
        user_agent,
        expires_at,
        authentication_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING session_id, session_token, expires_at
    `;
    
    const sessionValues = [
      sessionId,
      customer.customer_id,
      sessionToken,
      ip_address || null,
      user_agent || null,
      expiresAt,
      'demo'
    ];
    
    const sessionResult = await pool.query(sessionQuery, sessionValues);
    
    const latency = endTimer();
    requestLogger.logAuth('login_success', {
      customer_id: customer.customer_id,
      session_id: sessionId,
      ip_address,
      authentication_method: 'demo',
      latency_ms: latency
    });
    
    return {
      success: true,
      customer_id: customer.customer_id,
      customer_name: customer.name,
      session_token: sessionResult.rows[0].session_token,
      expires_at: sessionResult.rows[0].expires_at,
      authentication_method: 'demo',
      warning: 'DEMO AUTHENTICATION - Not SCA compliant'
    };
  } catch (error) {
    const latency = endTimer();
    requestLogger.error('Authentication error', error, {
      email,
      latency_ms: latency
    });
    return {
      success: false,
      error: 'Authentication failed'
    };
  } finally {
    await pool.end();
  }
}

/**
 * Verify customer session
 * @param {string} sessionToken - Session token to verify
 * @returns {Promise<Object>} Verification result
 */
async function verifyCustomerSession(sessionToken) {
  const requestLogger = logger.child('verify-session');
  const endTimer = requestLogger.startTimer();
  
  if (!sessionToken) {
    const latency = endTimer();
    requestLogger.logAuth('session_verification_failure', {
      reason: 'missing_token',
      latency_ms: latency
    });
    return {
      valid: false,
      error: 'Session token required'
    };
  }
  
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });
  
  try {
    const query = `
      SELECT 
        cs.session_id,
        cs.customer_id,
        cs.expires_at,
        cs.is_active,
        cs.authentication_method,
        c.name as customer_name,
        c.email as customer_email,
        c.status as customer_status
      FROM customer_sessions cs
      JOIN customers c ON cs.customer_id = c.customer_id
      WHERE cs.session_token = $1
        AND cs.is_active = true
        AND cs.expires_at > CURRENT_TIMESTAMP
        AND c.status = 'active'
    `;
    
    const result = await pool.query(query, [sessionToken]);
    
    if (result.rows.length === 0) {
      const latency = endTimer();
      requestLogger.logAuth('session_verification_failure', {
        reason: 'session_not_found_or_expired',
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'Invalid or expired session'
      };
    }
    
    const session = result.rows[0];
    
    // Update last activity
    await pool.query(
      'UPDATE customer_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE session_token = $1',
      [sessionToken]
    );
    
    const latency = endTimer();
    requestLogger.logAuth('session_verification_success', {
      customer_id: session.customer_id,
      session_id: session.session_id,
      authentication_method: session.authentication_method,
      latency_ms: latency
    });
    
    return {
      valid: true,
      customer_id: session.customer_id,
      customer_name: session.customer_name,
      customer_email: session.customer_email,
      session_id: session.session_id,
      expires_at: session.expires_at,
      authentication_method: session.authentication_method
    };
  } catch (error) {
    const latency = endTimer();
    requestLogger.error('Session verification error', error, {
      latency_ms: latency
    });
    return {
      valid: false,
      error: 'Session verification failed'
    };
  } finally {
    await pool.end();
  }
}

/**
 * Logout customer (invalidate session)
 * @param {string} sessionToken - Session token to invalidate
 * @returns {Promise<Object>} Logout result
 */
async function logoutCustomer(sessionToken) {
  const requestLogger = logger.child('logout');
  const endTimer = requestLogger.startTimer();
  
  if (!sessionToken) {
    const latency = endTimer();
    requestLogger.logAuth('logout_failure', {
      reason: 'missing_token',
      latency_ms: latency
    });
    return {
      success: false,
      error: 'Session token required'
    };
  }
  
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });
  
  try {
    const query = `
      UPDATE customer_sessions
      SET is_active = false
      WHERE session_token = $1
      RETURNING session_id
    `;
    
    const result = await pool.query(query, [sessionToken]);
    
    if (result.rows.length === 0) {
      const latency = endTimer();
      requestLogger.logAuth('logout_failure', {
        reason: 'session_not_found',
        latency_ms: latency
      });
      return {
        success: false,
        error: 'Session not found'
      };
    }
    
    const latency = endTimer();
    requestLogger.logAuth('logout_success', {
      session_id: result.rows[0].session_id,
      latency_ms: latency
    });
    
    return {
      success: true,
      message: 'Logged out successfully'
    };
  } catch (error) {
    const latency = endTimer();
    requestLogger.error('Logout error', error, {
      latency_ms: latency
    });
    return {
      success: false,
      error: 'Logout failed'
    };
  } finally {
    await pool.end();
  }
}

/**
 * Cleanup expired sessions
 * @returns {Promise<Object>} Cleanup result
 */
async function cleanupExpiredSessions() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });
  
  try {
    await pool.query('SELECT cleanup_expired_sessions()');
    
    return {
      success: true,
      message: 'Expired sessions cleaned up'
    };
  } catch (error) {
    console.error('Cleanup error:', error);
    return {
      success: false,
      error: 'Cleanup failed'
    };
  } finally {
    await pool.end();
  }
}

/**
 * Verify that fintech OAuth credentials DO NOT authenticate customers
 * This enforces the separation between fintech identity and customer identity
 * 
 * @param {string} clientId - OAuth client ID
 * @param {string} clientSecret - OAuth client secret
 * @returns {Object} Always returns invalid for customer authentication
 */
function verifyFintechCredentialsForCustomerAuth(clientId, clientSecret) {
  // IMPORTANT: Fintech OAuth credentials NEVER authenticate customers
  // This is a critical security boundary
  return {
    valid: false,
    error: 'OAuth client credentials cannot be used for customer authentication',
    reason: 'Fintech identity and customer identity are separate security domains'
  };
}

module.exports = {
  authenticateCustomer,
  verifyCustomerSession,
  logoutCustomer,
  cleanupExpiredSessions,
  verifyFintechCredentialsForCustomerAuth
};

// Made with Bob
