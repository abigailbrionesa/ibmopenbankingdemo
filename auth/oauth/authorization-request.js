/**
 * OAuth 2.0 Authorization Request Handler
 * Implements the authorization endpoint for OAuth 2.0 authorization code flow
 */

const crypto = require('crypto');
const { Pool } = require('pg');

// Supported response types
const SUPPORTED_RESPONSE_TYPES = ['code'];

// Supported OAuth scopes
const SUPPORTED_SCOPES = [
  'accounts:read',
  'transactions:read',
  'balances:read',
  'profile:read'
];

/**
 * Validate OAuth authorization request parameters
 * @param {Object} params - Authorization request parameters
 * @returns {Object} Validation result
 */
function validateAuthorizationRequest(params) {
  const {
    client_id,
    redirect_uri,
    response_type,
    scope,
    state
  } = params;
  
  const errors = [];
  
  // Validate required parameters
  if (!client_id) {
    errors.push({
      error: 'invalid_request',
      error_description: 'client_id is required'
    });
  }
  
  if (!redirect_uri) {
    errors.push({
      error: 'invalid_request',
      error_description: 'redirect_uri is required'
    });
  }
  
  if (!response_type) {
    errors.push({
      error: 'invalid_request',
      error_description: 'response_type is required'
    });
  }
  
  if (!scope) {
    errors.push({
      error: 'invalid_request',
      error_description: 'scope is required'
    });
  }
  
  // Validate response_type
  if (response_type && !SUPPORTED_RESPONSE_TYPES.includes(response_type)) {
    errors.push({
      error: 'unsupported_response_type',
      error_description: `response_type must be one of: ${SUPPORTED_RESPONSE_TYPES.join(', ')}`
    });
  }
  
  // Validate scopes
  if (scope) {
    const requestedScopes = scope.split(' ');
    const invalidScopes = requestedScopes.filter(s => !SUPPORTED_SCOPES.includes(s));
    
    if (invalidScopes.length > 0) {
      errors.push({
        error: 'invalid_scope',
        error_description: `Unsupported scopes: ${invalidScopes.join(', ')}`,
        invalid_scopes: invalidScopes
      });
    }
  }
  
  // State is recommended but not required
  if (!state) {
    errors.push({
      error: 'invalid_request',
      error_description: 'state parameter is recommended for CSRF protection',
      severity: 'warning'
    });
  }
  
  return {
    valid: errors.filter(e => e.severity !== 'warning').length === 0,
    errors,
    warnings: errors.filter(e => e.severity === 'warning')
  };
}

/**
 * Validate client and redirect URI
 * @param {string} clientId - OAuth client ID
 * @param {string} redirectUri - Requested redirect URI
 * @returns {Promise<Object>} Validation result
 */
async function validateClientAndRedirectUri(clientId, redirectUri) {
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
        client_id,
        name,
        redirect_uris,
        allowed_scopes,
        status
      FROM oauth_clients
      WHERE client_id = $1
    `;
    
    const result = await pool.query(query, [clientId]);
    
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
        error_description: `Client status is ${client.status}`
      };
    }
    
    // Validate redirect URI
    if (!client.redirect_uris.includes(redirectUri)) {
      return {
        valid: false,
        error: 'invalid_request',
        error_description: 'redirect_uri does not match registered URIs',
        registered_uris: client.redirect_uris
      };
    }
    
    return {
      valid: true,
      client: {
        client_id: client.client_id,
        name: client.name,
        allowed_scopes: client.allowed_scopes
      }
    };
  } catch (error) {
    console.error('Client validation error:', error);
    return {
      valid: false,
      error: 'server_error',
      error_description: 'Internal server error'
    };
  } finally {
    await pool.end();
  }
}

/**
 * Validate requested scopes against client's allowed scopes
 * @param {string[]} requestedScopes - Scopes requested in authorization
 * @param {string[]} allowedScopes - Scopes client is allowed to request
 * @returns {Object} Validation result
 */
function validateScopesAgainstClient(requestedScopes, allowedScopes) {
  const excessiveScopes = requestedScopes.filter(scope => !allowedScopes.includes(scope));
  
  if (excessiveScopes.length > 0) {
    return {
      valid: false,
      error: 'invalid_scope',
      error_description: 'Client is not authorized for requested scopes',
      excessive_scopes: excessiveScopes,
      allowed_scopes: allowedScopes
    };
  }
  
  return {
    valid: true,
    approved_scopes: requestedScopes
  };
}

/**
 * Generate authorization request ID
 * @returns {string} Authorization request ID
 */
function generateAuthorizationRequestId() {
  return `authreq_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Create authorization context
 * Stores the authorization request for the consent step
 * 
 * @param {Object} authRequest - Authorization request details
 * @returns {Promise<Object>} Created authorization context
 */
async function createAuthorizationContext(authRequest) {
  const {
    client_id,
    redirect_uri,
    response_type,
    scope,
    state,
    customer_id
  } = authRequest;
  
  const authRequestId = generateAuthorizationRequestId();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });
  
  try {
    // Store authorization context in database
    const query = `
      INSERT INTO authorization_requests (
        auth_request_id,
        client_id,
        customer_id,
        redirect_uri,
        response_type,
        scope,
        state,
        status,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING auth_request_id, expires_at
    `;
    
    const values = [
      authRequestId,
      client_id,
      customer_id,
      redirect_uri,
      response_type,
      scope,
      state || null,
      'pending',
      expiresAt
    ];
    
    const result = await pool.query(query, values);
    
    return {
      success: true,
      auth_request_id: result.rows[0].auth_request_id,
      expires_at: result.rows[0].expires_at
    };
  } catch (error) {
    console.error('Authorization context creation error:', error);
    return {
      success: false,
      error: 'server_error',
      error_description: 'Failed to create authorization context'
    };
  } finally {
    await pool.end();
  }
}

/**
 * Handle OAuth authorization request
 * Main entry point for GET /oauth/authorize
 * 
 * @param {Object} params - Authorization request parameters
 * @param {string} customerId - Authenticated customer ID
 * @returns {Promise<Object>} Authorization result
 */
async function handleAuthorizationRequest(params, customerId) {
  const {
    client_id,
    redirect_uri,
    response_type,
    scope,
    state
  } = params;
  
  // Step 1: Validate request parameters
  const paramValidation = validateAuthorizationRequest(params);
  if (!paramValidation.valid) {
    return {
      success: false,
      errors: paramValidation.errors,
      should_redirect: false // Don't redirect on parameter errors
    };
  }
  
  // Step 2: Validate client and redirect URI
  const clientValidation = await validateClientAndRedirectUri(client_id, redirect_uri);
  if (!clientValidation.valid) {
    return {
      success: false,
      error: clientValidation.error,
      error_description: clientValidation.error_description,
      should_redirect: clientValidation.error !== 'invalid_request' // Only redirect if client is valid
    };
  }
  
  const client = clientValidation.client;
  
  // Step 3: Validate scopes against client's allowed scopes
  const requestedScopes = scope.split(' ');
  const scopeValidation = validateScopesAgainstClient(requestedScopes, client.allowed_scopes);
  if (!scopeValidation.valid) {
    return {
      success: false,
      error: scopeValidation.error,
      error_description: scopeValidation.error_description,
      excessive_scopes: scopeValidation.excessive_scopes,
      should_redirect: true,
      redirect_uri,
      state
    };
  }
  
  // Step 4: Create authorization context
  const authContext = await createAuthorizationContext({
    client_id,
    redirect_uri,
    response_type,
    scope,
    state,
    customer_id: customerId
  });
  
  if (!authContext.success) {
    return {
      success: false,
      error: authContext.error,
      error_description: authContext.error_description,
      should_redirect: true,
      redirect_uri,
      state
    };
  }
  
  // Step 5: Return success - ready for consent
  return {
    success: true,
    auth_request_id: authContext.auth_request_id,
    client: {
      client_id: client.client_id,
      name: client.name
    },
    requested_scopes: requestedScopes,
    redirect_uri,
    state,
    expires_at: authContext.expires_at,
    warnings: paramValidation.warnings
  };
}

/**
 * Build OAuth error redirect URL
 * @param {string} redirectUri - Client's redirect URI
 * @param {string} error - OAuth error code
 * @param {string} errorDescription - Error description
 * @param {string} [state] - State parameter to preserve
 * @returns {string} Error redirect URL
 */
function buildErrorRedirectUrl(redirectUri, error, errorDescription, state) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', errorDescription);
  if (state) {
    url.searchParams.set('state', state);
  }
  return url.toString();
}

module.exports = {
  handleAuthorizationRequest,
  validateAuthorizationRequest,
  validateClientAndRedirectUri,
  validateScopesAgainstClient,
  createAuthorizationContext,
  buildErrorRedirectUrl,
  SUPPORTED_RESPONSE_TYPES,
  SUPPORTED_SCOPES
};

// Made with Bob
