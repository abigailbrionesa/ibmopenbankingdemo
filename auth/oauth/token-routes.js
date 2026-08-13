/**
 * OAuth Token Routes
 * Express routes for OAuth token endpoints
 */

const express = require('express');
const router = express.Router();
const { exchangeAuthorizationCode } = require('./token-exchange');

/**
 * Parse Basic Authentication header
 * 
 * @param {string} authHeader - Authorization header value
 * @returns {Object|null} Parsed credentials or null
 */
function parseBasicAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }
  
  try {
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [client_id, client_secret] = credentials.split(':');
    
    return { client_id, client_secret };
  } catch (error) {
    return null;
  }
}

/**
 * POST /oauth/token
 * Token endpoint for exchanging authorization codes for access tokens
 * 
 * Supports:
 * - Authorization Code Grant (grant_type=authorization_code)
 * 
 * Client authentication via:
 * - HTTP Basic Authentication (preferred)
 * - Request body parameters (client_id, client_secret)
 */
router.post('/token', async (req, res) => {
  try {
    // Extract parameters from request body
    let { grant_type, code, redirect_uri, client_id, client_secret } = req.body;
    
    // Check for Basic Authentication
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const basicAuth = parseBasicAuth(authHeader);
      if (basicAuth) {
        // Override with Basic Auth credentials
        client_id = basicAuth.client_id;
        client_secret = basicAuth.client_secret;
      }
    }
    
    // Validate required parameters
    if (!grant_type) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'grant_type is required'
      });
    }
    
    // Handle authorization_code grant
    if (grant_type === 'authorization_code') {
      const result = await exchangeAuthorizationCode({
        grant_type,
        code,
        redirect_uri,
        client_id,
        client_secret
      });
      
      if (!result.success) {
        // Determine appropriate status code
        let statusCode = 400;
        if (result.error === 'invalid_client' || result.error === 'unauthorized_client') {
          statusCode = 401;
          // Set WWW-Authenticate header for 401 responses
          res.setHeader('WWW-Authenticate', 'Basic realm="OAuth Token Endpoint"');
        } else if (result.error === 'server_error') {
          statusCode = 500;
        }
        
        return res.status(statusCode).json({
          error: result.error,
          error_description: result.error_description
        });
      }
      
      // Success - return token response
      return res.json({
        access_token: result.access_token,
        token_type: result.token_type,
        expires_in: result.expires_in,
        refresh_token: result.refresh_token,
        scope: result.scope
      });
    }
    
    // Unsupported grant type
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: `Grant type '${grant_type}' is not supported`
    });
    
  } catch (error) {
    console.error('Token endpoint error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'An unexpected error occurred'
    });
  }
});

/**
 * POST /oauth/token/introspect
 * Token introspection endpoint (RFC 7662)
 * Allows clients to query token status
 */
router.post('/token/introspect', async (req, res) => {
  try {
    const { token, token_type_hint } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'token is required'
      });
    }
    
    // Verify client authentication
    const authHeader = req.headers['authorization'];
    const basicAuth = parseBasicAuth(authHeader);
    
    if (!basicAuth) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Client authentication required'
      });
    }
    
    const { validateClientCredentials } = require('./token-exchange');
    const clientValidation = await validateClientCredentials(
      basicAuth.client_id,
      basicAuth.client_secret
    );
    
    if (!clientValidation.valid) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Invalid client credentials'
      });
    }
    
    // Verify the token
    const { verifyAccessToken } = require('./token-exchange');
    const verification = await verifyAccessToken(token);
    
    if (!verification.valid) {
      // Return inactive response (not an error)
      return res.json({
        active: false
      });
    }
    
    // Return active token information
    return res.json({
      active: true,
      scope: verification.token.scope,
      client_id: verification.token.client_id,
      token_type: 'Bearer',
      exp: Math.floor(new Date(verification.token.expires_at).getTime() / 1000),
      iat: Math.floor(new Date(verification.payload.iat * 1000).getTime() / 1000),
      sub: verification.token.customer_id
    });
    
  } catch (error) {
    console.error('Token introspection error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'An unexpected error occurred'
    });
  }
});

/**
 * POST /oauth/token/revoke
 * Token revocation endpoint (RFC 7009)
 * Allows clients to revoke tokens
 */
router.post('/token/revoke', async (req, res) => {
  try {
    const { token, token_type_hint } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'token is required'
      });
    }
    
    // Verify client authentication
    const authHeader = req.headers['authorization'];
    const basicAuth = parseBasicAuth(authHeader);
    
    if (!basicAuth) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Client authentication required'
      });
    }
    
    const { validateClientCredentials } = require('./token-exchange');
    const clientValidation = await validateClientCredentials(
      basicAuth.client_id,
      basicAuth.client_secret
    );
    
    if (!clientValidation.valid) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Invalid client credentials'
      });
    }
    
    // Revoke the token
    const crypto = require('crypto');
    const { query } = require('../../data/db');
    
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    await query(
      `UPDATE access_tokens 
       SET revoked = true, revoked_at = CURRENT_TIMESTAMP 
       WHERE access_token_hash = $1 AND client_id = $2`,
      [tokenHash, basicAuth.client_id]
    );
    
    // RFC 7009: The revocation endpoint responds with HTTP 200 regardless
    return res.status(200).send();
    
  } catch (error) {
    console.error('Token revocation error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'An unexpected error occurred'
    });
  }
});

module.exports = router;

// Made with Bob
