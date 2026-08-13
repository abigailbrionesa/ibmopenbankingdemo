/**
 * OAuth Client Registration Service
 * Handles registration of fintech applications as OAuth clients
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

// Supported OAuth scopes for Open Banking
const SUPPORTED_SCOPES = [
  'accounts:read',
  'transactions:read',
  'balances:read',
  'profile:read'
];

// Configuration
const BCRYPT_ROUNDS = 12;
const CLIENT_ID_PREFIX = 'client_';
const CLIENT_SECRET_LENGTH = 32;

/**
 * Generate a unique client ID
 * @returns {string} Generated client ID
 */
function generateClientId() {
  const randomBytes = crypto.randomBytes(16).toString('hex');
  return `${CLIENT_ID_PREFIX}${randomBytes}`;
}

/**
 * Generate a secure client secret
 * @returns {string} Generated client secret
 */
function generateClientSecret() {
  return crypto.randomBytes(CLIENT_SECRET_LENGTH).toString('base64url');
}

/**
 * Hash client secret using bcrypt
 * @param {string} secret - Plain text secret
 * @returns {Promise<string>} Hashed secret
 */
async function hashClientSecret(secret) {
  return bcrypt.hash(secret, BCRYPT_ROUNDS);
}

/**
 * Validate redirect URI format
 * @param {string} uri - Redirect URI to validate
 * @returns {boolean} True if valid
 */
function validateRedirectUri(uri) {
  try {
    const url = new URL(uri);
    
    // Must use HTTPS in production (allow HTTP for localhost in dev)
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      return false;
    }
    
    if (process.env.NODE_ENV !== 'production' && url.hostname === 'localhost') {
      return url.protocol === 'http:' || url.protocol === 'https:';
    }
    
    // No fragments allowed
    if (url.hash) {
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Validate requested scopes
 * @param {string[]} scopes - Array of requested scopes
 * @returns {Object} Validation result with valid flag and error message
 */
function validateScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return {
      valid: false,
      error: 'At least one scope must be requested'
    };
  }
  
  const invalidScopes = scopes.filter(scope => !SUPPORTED_SCOPES.includes(scope));
  
  if (invalidScopes.length > 0) {
    return {
      valid: false,
      error: `Unsupported scopes: ${invalidScopes.join(', ')}`,
      invalidScopes
    };
  }
  
  return { valid: true };
}

/**
 * Register a new OAuth client
 * @param {Object} registration - Registration details
 * @param {string} registration.name - Application name
 * @param {string[]} registration.redirect_uris - Allowed redirect URIs
 * @param {string[]} registration.requested_scopes - Requested OAuth scopes
 * @param {string} [registration.description] - Optional description
 * @param {string} [registration.contact_email] - Optional contact email
 * @param {string} [registration.website_url] - Optional website URL
 * @returns {Promise<Object>} Registration result
 */
async function registerClient(registration) {
  const {
    name,
    redirect_uris,
    requested_scopes,
    description,
    contact_email,
    website_url
  } = registration;
  
  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return {
      success: false,
      error: 'Application name is required'
    };
  }
  
  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return {
      success: false,
      error: 'At least one redirect URI is required'
    };
  }
  
  // Validate redirect URIs
  const invalidUris = redirect_uris.filter(uri => !validateRedirectUri(uri));
  if (invalidUris.length > 0) {
    return {
      success: false,
      error: 'Invalid redirect URI(s)',
      invalid_uris: invalidUris
    };
  }
  
  // Validate scopes
  const scopeValidation = validateScopes(requested_scopes);
  if (!scopeValidation.valid) {
    return {
      success: false,
      error: scopeValidation.error,
      invalid_scopes: scopeValidation.invalidScopes
    };
  }
  
  // Generate credentials
  const clientId = generateClientId();
  const clientSecret = generateClientSecret();
  const clientSecretHash = await hashClientSecret(clientSecret);
  
  // Store in database
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });
  
  try {
    const query = `
      INSERT INTO oauth_clients (
        client_id,
        client_secret_hash,
        name,
        redirect_uris,
        allowed_scopes,
        status,
        description,
        contact_email,
        website_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING client_id, name, redirect_uris, allowed_scopes, status, created_at
    `;
    
    const values = [
      clientId,
      clientSecretHash,
      name.trim(),
      redirect_uris,
      requested_scopes,
      'active',
      description || null,
      contact_email || null,
      website_url || null
    ];
    
    const result = await pool.query(query, values);
    
    // Return registration details
    // IMPORTANT: client_secret is only returned once during registration
    return {
      success: true,
      client_id: result.rows[0].client_id,
      client_secret: clientSecret, // Only returned here, never stored in plaintext
      name: result.rows[0].name,
      redirect_uris: result.rows[0].redirect_uris,
      allowed_scopes: result.rows[0].allowed_scopes,
      status: result.rows[0].status,
      created_at: result.rows[0].created_at,
      warning: 'Store client_secret securely. It will not be shown again.'
    };
  } catch (error) {
    console.error('Client registration error:', error);
    
    // Check for duplicate client_id (extremely unlikely but handle it)
    if (error.code === '23505') {
      return {
        success: false,
        error: 'Registration failed. Please try again.'
      };
    }
    
    return {
      success: false,
      error: 'Internal server error during registration'
    };
  } finally {
    await pool.end();
  }
}

/**
 * Verify client credentials
 * @param {string} clientId - Client ID
 * @param {string} clientSecret - Client secret
 * @returns {Promise<Object>} Verification result
 */
async function verifyClientCredentials(clientId, clientSecret) {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });
  
  try {
    const query = `
      SELECT client_id, client_secret_hash, name, allowed_scopes, status
      FROM oauth_clients
      WHERE client_id = $1
    `;
    
    const result = await pool.query(query, [clientId]);
    
    if (result.rows.length === 0) {
      return { valid: false, error: 'Invalid client credentials' };
    }
    
    const client = result.rows[0];
    
    if (client.status !== 'active') {
      return { valid: false, error: 'Client is not active' };
    }
    
    const secretMatch = await bcrypt.compare(clientSecret, client.client_secret_hash);
    
    if (!secretMatch) {
      return { valid: false, error: 'Invalid client credentials' };
    }
    
    // Update last_used_at
    await pool.query(
      'UPDATE oauth_clients SET last_used_at = CURRENT_TIMESTAMP WHERE client_id = $1',
      [clientId]
    );
    
    return {
      valid: true,
      client_id: client.client_id,
      name: client.name,
      allowed_scopes: client.allowed_scopes
    };
  } catch (error) {
    console.error('Client verification error:', error);
    return { valid: false, error: 'Internal server error' };
  } finally {
    await pool.end();
  }
}

module.exports = {
  registerClient,
  verifyClientCredentials,
  validateRedirectUri,
  validateScopes,
  SUPPORTED_SCOPES
};

// Made with Bob
