/**
 * OAuth Token Exchange
 * Handles authorization code exchange for access tokens
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { query } = require('../../data/db');

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
  
  // Validate grant_type
  if (grant_type !== 'authorization_code') {
    return {
      success: false,
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code grant type is supported'
    };
  }
  
  // Validate required parameters
  if (!code || !redirect_uri || !client_id || !client_secret) {
    return {
      success: false,
      error: 'invalid_request',
      error_description: 'Missing required parameters: code, redirect_uri, client_id, client_secret'
    };
  }
  
  // Step 1: Validate client credentials
  const clientValidation = await validateClientCredentials(client_id, client_secret);
  if (!clientValidation.valid) {
    return {
      success: false,
      error: clientValidation.error,
      error_description: clientValidation.error_description
    };
  }
  
  const client = clientValidation.client;
  
  // Step 2: Validate authorization code
  const codeValidation = await validateAuthorizationCode(code, client_id, redirect_uri);
  if (!codeValidation.valid) {
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
  });
  
  if (!tokenResult.success) {
    return tokenResult;
  }
  
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
async function validateClientCredentials(client_id, client_secret) {
  try {
    // Fetch client from database
    const result = await query(
      'SELECT client_id, client_secret_hash, status, allowed_scopes FROM oauth_clients WHERE client_id = $1',
      [client_id]
    );
    
    if (result.rows.length === 0) {
      return {
        valid: false,
        error: 'invalid_client',
        error_description: 'Client not found'
      };
    }
    
    const client = result.rows[0];
    
    // Check client status
    if (client.status !== 'active') {
      return {
        valid: false,
        error: 'unauthorized_client',
        error_description: `Client is ${client.status}`
      };
    }
    
    // Verify client secret
    const secretValid = await bcrypt.compare(client_secret, client.client_secret_hash);
    
    if (!secretValid) {
      return {
        valid: false,
        error: 'invalid_client',
        error_description: 'Invalid client credentials'
      };
    }
    
    return {
      valid: true,
      client: client
    };
  } catch (error) {
    console.error('Client validation error:', error);
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
async function validateAuthorizationCode(code, client_id, redirect_uri) {
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
      return {
        valid: false,
        error: 'invalid_grant',
        error_description: 'Authorization code has expired'
      };
    }
    
    // Verify client_id matches
    if (authCode.client_id !== client_id) {
      return {
        valid: false,
        error: 'invalid_grant',
        error_description: 'Authorization code was issued to a different client'
      };
    }
    
    // Verify redirect_uri matches
    if (authCode.redirect_uri !== redirect_uri) {
      return {
        valid: false,
        error: 'invalid_grant',
        error_description: 'Redirect URI does not match'
      };
    }
    
    return {
      valid: true,
      authorization_code: authCode
    };
  } catch (error) {
    console.error('Authorization code validation error:', error);
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
async function generateTokens(params) {
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
    
    return {
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_id: token_id
    };
  } catch (error) {
    console.error('Token generation error:', error);
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
    
    console.warn(`Security violation: Authorization code reuse detected. All tokens for consent ${consent_id} have been revoked.`);
  } catch (error) {
    console.error('Token revocation error:', error);
  }
}

/**
 * Verify access token
 * 
 * @param {string} accessToken - Access token to verify
 * @returns {Promise<Object>} Verification result
 */
async function verifyAccessToken(accessToken) {
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
      return {
        valid: false,
        error: 'invalid_token',
        error_description: 'Token not found'
      };
    }
    
    const token = result.rows[0];
    
    // Check if token is revoked
    if (token.revoked) {
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
    
    return {
      valid: true,
      payload: payload,
      token: token
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return {
        valid: false,
        error: 'invalid_token',
        error_description: 'Token has expired'
      };
    }
    
    if (error.name === 'JsonWebTokenError') {
      return {
        valid: false,
        error: 'invalid_token',
        error_description: 'Invalid token signature'
      };
    }
    
    console.error('Token verification error:', error);
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
