/**
 * OAuth Token Exchange
 * Handles authorization code exchange for access tokens
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { query } = require('../../data/db');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('token-exchange');

/**
 * Token configuration
 */
const TOKEN_CONFIG = {
  ACCESS_TOKEN_TTL: 3600, // 1 hour in seconds
  REFRESH_TOKEN_TTL: 2592000, // 30 days in seconds
  JWT_ALGORITHM: 'HS256'
};

/**
 * Get JWT secret from environment or generate one
 * In production, this MUST be stored in HashiCorp Vault
 */
function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  
  console.warn('WARNING: JWT_SECRET not set in environment. Using temporary secret. DO NOT USE IN PRODUCTION.');
  return 'temporary-secret-for-development-only-change-in-production';
}

/**
 * Exchange authorization code for access token
 * 
 * @param {Object} params - Token request parameters
 * @param {string} params.grant_type - Must be 'authorization_code'
 * @param {string} params.code - Authorization code
 * @param {string} params.redirect_uri - Must match the one used in authorization
 * @param {string} params.client_id - OAuth client identifier
 * @param {string} params.client_secret - OAuth client secret
 * @returns {Promise<Object>} Token response or error
 */
async function exchangeAuthorizationCode(params) {
  const { grant_type, code, redirect_uri, client_id, client_secret } = params;
  const requestLogger = logger.child('exchange-code');
  const endTimer = requestLogger.startTimer();
  
  requestLogger.logAuthz('token_exchange_attempt', {
    grant_type,
    client_id,
    redirect_uri
  });
  
  // Validate grant_type
  if (grant_type !== 'authorization_code') {
    const latency = endTimer();
    requestLogger.logAuthz('token_exchange_failure', {
      reason: 'unsupported_grant_type',
      grant_type,
      client_id,
      latency_ms: latency
    });
    return {
      success: false,
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code grant type is supported'
    };
  }
  
  // Validate required parameters
  if (!code || !redirect_uri || !client_id || !client_secret) {
    const latency = endTimer();
    requestLogger.logAuthz('token_exchange_failure', {
      reason: 'missing_parameters',
      client_id,
      latency_ms: latency
    });
    return {
      success: false,
      error: 'invalid_request',
      error_description: 'Missing required parameters: code, redirect_uri, client_id, client_secret'
    };
  }
  
  // Step 1: Validate client credentials
  const clientValidation = await validateClientCredentials(client_id, client_secret, requestLogger);
  if (!clientValidation.valid) {
    const latency = endTimer();
    requestLogger.logAuthz('token_exchange_failure', {
      reason: 'client_validation_failed',
      error: clientValidation.error,
      client_id,
      latency_ms: latency
    });
    return {
      success: false,
      error: clientValidation.error,
      error_description: clientValidation.error_description
    };
  }
  
  const client = clientValidation.client;
  
  // Step 2: Validate authorization code
  const codeValidation = await validateAuthorizationCode(code, client_id, redirect_uri, requestLogger);
  if (!codeValidation.valid) {
    const latency = endTimer();
    requestLogger.logAuthz('token_exchange_failure', {
      reason: 'code_validation_failed',
      error: codeValidation.error,
      client_id,
      security_violation: codeValidation.security_violation,
      latency_ms: latency
    });
    return {
      success: false,
      error: codeValidation.error,
      error_description: codeValidation.error_description
    };
  }
  
  const authCode = codeValidation.authorization_code;
  
  // Step 3: Mark authorization code as used
  await markCodeAsUsed(code);
  
  // Step 4: Generate access token and refresh token
  const tokenResult = await generateTokens({
    customer_id: authCode.customer_id,
    client_id: authCode.client_id,
    consent_id: authCode.consent_id,
    scope: authCode.scope
  }, requestLogger);
  
  if (!tokenResult.success) {
    const latency = endTimer();
    requestLogger.logAuthz('token_exchange_failure', {
      reason: 'token_generation_failed',
      error: tokenResult.error,
      client_id,
      customer_id: authCode.customer_id,
      latency_ms: latency
    });
    return tokenResult;
  }
  
  const latency = endTimer();
  requestLogger.logAuthz('token_exchange_success', {
    client_id,
    customer_id: authCode.customer_id,
    consent_id: authCode.consent_id,
    scope: authCode.scope,
    token_id: tokenResult.token_id,
    latency_ms: latency
  });
  
  // Step 5: Return token response
  return {
    success: true,
    access_token: tokenResult.access_token,
    token_type: 'Bearer',
    expires_in: TOKEN_CONFIG.ACCESS_TOKEN_TTL,
    refresh_token: tokenResult.refresh_token,
    scope: authCode.scope
  };
}

/**
 * Validate client credentials
 * 
 * @param {string} client_id - Client identifier
 * @param {string} client_secret - Client secret
 * @returns {Promise<Object>} Validation result
 */
async function validateClientCredentials(client_id, client_secret, parentLogger = null) {
  const requestLogger = parentLogger ? parentLogger.child('validate-client') : logger.child('validate-client');
  const endTimer = requestLogger.startTimer();
  
  try {
    // Fetch client from database
    const result = await query(
      'SELECT client_id, client_secret_hash, status, allowed_scopes FROM oauth_clients WHERE client_id = $1',
      [client_id]
    );
    
    if (result.rows.length === 0) {
      const latency = endTimer();
      requestLogger.logAuthz('client_validation_failure', {
        reason: 'client_not_found',
        client_id,
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'invalid_client',
        error_description: 'Client not found'
      };
    }
    
    const client = result.rows[0];
    
    // Check client status
    if (client.status !== 'active') {
      const latency = endTimer();
      requestLogger.logAuthz('client_validation_failure', {
        reason: 'client_inactive',
        client_id,
        client_status: client.status,
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'unauthorized_client',
        error_description: `Client is ${client.status}`
      };
    }
    
    // Verify client secret
    const secretValid = await bcrypt.compare(client_secret, client.client_secret_hash);
    
    if (!secretValid) {
      const latency = endTimer();
      requestLogger.logAuthz('client_validation_failure', {
        reason: 'invalid_secret',
        client_id,
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'invalid_client',
        error_description: 'Invalid client credentials'
      };
    }
    
    const latency = endTimer();
    requestLogger.logAuthz('client_validation_success', {
      client_id,
      latency_ms: latency
    });
    
    return {
      valid: true,
      client: client
    };
  } catch (error) {
    const latency = endTimer();
    requestLogger.error('Client validation error', error, {
      client_id,
      latency_ms: latency
    });
    return {
      valid: false,
      error: 'server_error',
      error_description: 'Failed to validate client credentials'
    };
  }
}

/**
 * Validate authorization code
 * 
 * @param {string} code - Authorization code
 * @param {string} client_id - Client identifier
 * @param {string} redirect_uri - Redirect URI
 * @returns {Promise<Object>} Validation result
 */
async function validateAuthorizationCode(code, client_id, redirect_uri, parentLogger = null) {
  const requestLogger = parentLogger ? parentLogger.child('validate-code') : logger.child('validate-code');
  const endTimer = requestLogger.startTimer();
  
  try {
    // Fetch authorization code from database
    const result = await query(
      `SELECT code, customer_id, client_id, redirect_uri, scope, consent_id, 
              created_at, expires_at, used, used_at
       FROM authorization_codes 
       WHERE code = $1`,
      [code]
    );
    
    if (result.rows.length === 0) {
      const latency = endTimer();
      requestLogger.logAuthz('code_validation_failure', {
        reason: 'code_not_found',
        client_id,
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'invalid_grant',
        error_description: 'Authorization code not found'
      };
    }
    
    const authCode = result.rows[0];
    
    // Check if code has been used
    if (authCode.used) {
      // Code reuse detected - security violation
      // Revoke all tokens associated with this code
      await revokeTokensByCode(code);
      
      const latency = endTimer();
      requestLogger.warn('Code reuse detected - security violation', {
        client_id,
        customer_id: authCode.customer_id,
        consent_id: authCode.consent_id,
        used_at: authCode.used_at,
        latency_ms: latency
      });
      
      return {
        valid: false,
        error: 'invalid_grant',
        error_description: 'Authorization code has already been used',
        security_violation: true
      };
    }
    
    // Check if code has expired
    const now = new Date();
    const expiresAt = new Date(authCode.expires_at);
    
    if (now > expiresAt) {
      const latency = endTimer();
      requestLogger.logAuthz('code_validation_failure', {
        reason: 'code_expired',
        client_id,
        customer_id: authCode.customer_id,
        expired_at: authCode.expires_at,
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'invalid_grant',
        error_description: 'Authorization code has expired'
      };
    }
    
    // Verify client_id matches
    if (authCode.client_id !== client_id) {
      const latency = endTimer();
      requestLogger.warn('Client ID mismatch - security violation', {
        expected_client_id: authCode.client_id,
        provided_client_id: client_id,
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'invalid_grant',
        error_description: 'Authorization code was issued to a different client'
      };
    }
    
    // Verify redirect_uri matches
    if (authCode.redirect_uri !== redirect_uri) {
      const latency = endTimer();
      requestLogger.warn('Redirect URI mismatch - security violation', {
        expected_redirect_uri: authCode.redirect_uri,
        provided_redirect_uri: redirect_uri,
        client_id,
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'invalid_grant',
        error_description: 'Redirect URI does not match'
      };
    }
    
    const latency = endTimer();
    requestLogger.logAuthz('code_validation_success', {
      client_id,
      customer_id: authCode.customer_id,
      consent_id: authCode.consent_id,
      scope: authCode.scope,
      latency_ms: latency
    });
    
    return {
      valid: true,
      authorization_code: authCode
    };
  } catch (error) {
    const latency = endTimer();
    requestLogger.error('Authorization code validation error', error, {
      client_id,
      latency_ms: latency
    });
    return {
      valid: false,
      error: 'server_error',
      error_description: 'Failed to validate authorization code'
    };
  }
}

/**
 * Mark authorization code as used
 * 
 * @param {string} code - Authorization code
 * @returns {Promise<void>}
 */
async function markCodeAsUsed(code) {
  await query(
    'UPDATE authorization_codes SET used = true, used_at = CURRENT_TIMESTAMP WHERE code = $1',
    [code]
  );
}

/**
 * Generate access token and refresh token
 * 
 * @param {Object} params - Token parameters
 * @param {string} params.customer_id - Customer identifier
 * @param {string} params.client_id - Client identifier
 * @param {string} params.consent_id - Consent identifier
 * @param {string} params.scope - Space-separated scopes
 * @returns {Promise<Object>} Generated tokens
 */
async function generateTokens(params, parentLogger = null) {
  const requestLogger = parentLogger ? parentLogger.child('generate-tokens') : logger.child('generate-tokens');
  const endTimer = requestLogger.startTimer();
  
  try {
    const { customer_id, client_id, consent_id, scope } = params;
    
    // Generate unique token ID
    const token_id = `token_${crypto.randomBytes(16).toString('hex')}`;
    
    // Generate access token (JWT)
    const accessTokenPayload = {
      token_id: token_id,
      customer_id: customer_id,
      client_id: client_id,
      consent_id: consent_id,
      scope: scope,
      type: 'access'
    };
    
    const accessToken = jwt.sign(
      accessTokenPayload,
      getJwtSecret(),
      {
        algorithm: TOKEN_CONFIG.JWT_ALGORITHM,
        expiresIn: TOKEN_CONFIG.ACCESS_TOKEN_TTL
      }
    );
    
    // Generate refresh token (random)
    const refreshToken = `refresh_${crypto.randomBytes(32).toString('hex')}`;
    
    // Hash tokens for storage
    const accessTokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    // Calculate expiration times
    const now = new Date();
    const accessExpiresAt = new Date(now.getTime() + TOKEN_CONFIG.ACCESS_TOKEN_TTL * 1000);
    const refreshExpiresAt = new Date(now.getTime() + TOKEN_CONFIG.REFRESH_TOKEN_TTL * 1000);
    
    // Store tokens in database
    await query(
      `INSERT INTO access_tokens 
       (token_id, access_token_hash, refresh_token_hash, token_type, 
        customer_id, client_id, consent_id, scope, 
        expires_at, refresh_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        token_id,
        accessTokenHash,
        refreshTokenHash,
        'Bearer',
        customer_id,
        client_id,
        consent_id,
        scope,
        accessExpiresAt,
        refreshExpiresAt
      ]
    );
    
    const latency = endTimer();
    requestLogger.logAuthz('token_generation_success', {
      token_id,
      customer_id,
      client_id,
      consent_id,
      scope,
      expires_in: TOKEN_CONFIG.ACCESS_TOKEN_TTL,
      latency_ms: latency
    });
    
    return {
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_id: token_id
    };
  } catch (error) {
    const latency = endTimer();
    requestLogger.error('Token generation error', error, {
      customer_id: params.customer_id,
      client_id: params.client_id,
      latency_ms: latency
    });
    return {
      success: false,
      error: 'server_error',
      error_description: 'Failed to generate tokens'
    };
  }
}

/**
 * Revoke all tokens associated with an authorization code
 * Called when code reuse is detected
 * 
 * @param {string} code - Authorization code
 * @returns {Promise<void>}
 */
async function revokeTokensByCode(code) {
  try {
    // Get consent_id from authorization code
    const codeResult = await query(
      'SELECT consent_id FROM authorization_codes WHERE code = $1',
      [code]
    );
    
    if (codeResult.rows.length === 0) {
      return;
    }
    
    const consent_id = codeResult.rows[0].consent_id;
    
    // Revoke all tokens for this consent
    await query(
      'UPDATE access_tokens SET revoked = true, revoked_at = CURRENT_TIMESTAMP WHERE consent_id = $1',
      [consent_id]
    );
    
    logger.warn('Security violation: Authorization code reuse detected', {
      consent_id,
      revoked_tokens: true
    });
  } catch (error) {
    logger.error('Token revocation error', error, { code });
  }
}

/**
 * Verify access token
 * 
 * @param {string} accessToken - Access token to verify
 * @returns {Promise<Object>} Verification result
 */
async function verifyAccessToken(accessToken) {
  const requestLogger = logger.child('verify-token');
  const endTimer = requestLogger.startTimer();
  
  try {
    // Verify JWT signature and expiration
    const payload = jwt.verify(accessToken, getJwtSecret(), {
      algorithms: [TOKEN_CONFIG.JWT_ALGORITHM]
    });
    
    // Hash token for database lookup
    const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    
    // Check if token exists and is not revoked
    const result = await query(
      `SELECT token_id, customer_id, client_id, consent_id, scope, 
              expires_at, revoked, last_used_at, use_count
       FROM access_tokens 
       WHERE access_token_hash = $1`,
      [tokenHash]
    );
    
    if (result.rows.length === 0) {
      const latency = endTimer();
      requestLogger.logAuthz('token_verification_failure', {
        reason: 'token_not_found',
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'invalid_token',
        error_description: 'Token not found'
      };
    }
    
    const token = result.rows[0];
    
    // Check if token is revoked
    if (token.revoked) {
      const latency = endTimer();
      requestLogger.logAuthz('token_verification_failure', {
        reason: 'token_revoked',
        token_id: token.token_id,
        customer_id: token.customer_id,
        client_id: token.client_id,
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'invalid_token',
        error_description: 'Token has been revoked'
      };
    }
    
    // Update last used timestamp and use count
    await query(
      'UPDATE access_tokens SET last_used_at = CURRENT_TIMESTAMP, use_count = use_count + 1 WHERE token_id = $1',
      [token.token_id]
    );
    
    const latency = endTimer();
    requestLogger.logAuthz('token_verification_success', {
      token_id: token.token_id,
      customer_id: token.customer_id,
      client_id: token.client_id,
      consent_id: token.consent_id,
      scope: token.scope,
      use_count: token.use_count + 1,
      latency_ms: latency
    });
    
    return {
      valid: true,
      payload: payload,
      token: token
    };
  } catch (error) {
    const latency = endTimer();
    
    if (error.name === 'TokenExpiredError') {
      requestLogger.logAuthz('token_verification_failure', {
        reason: 'token_expired',
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'invalid_token',
        error_description: 'Token has expired'
      };
    }
    
    if (error.name === 'JsonWebTokenError') {
      requestLogger.logAuthz('token_verification_failure', {
        reason: 'invalid_signature',
        latency_ms: latency
      });
      return {
        valid: false,
        error: 'invalid_token',
        error_description: 'Invalid token signature'
      };
    }
    
    requestLogger.error('Token verification error', error, {
      latency_ms: latency
    });
    return {
      valid: false,
      error: 'server_error',
      error_description: 'Failed to verify token'
    };
  }
}

module.exports = {
  exchangeAuthorizationCode,
  validateClientCredentials,
  validateAuthorizationCode,
  generateTokens,
  verifyAccessToken,
  TOKEN_CONFIG
};

// Made with Bob
