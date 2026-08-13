/**
 * Developer Portal API
 * Backend API for developer onboarding and app management
 */

const express = require('express');
const router = express.Router();
const { registerClient } = require('../../auth/oauth/client-registration');
const { query } = require('../../data/db');

/**
 * API Catalog - Available APIs and scopes
 */
const API_CATALOG = {
  apis: [
    {
      id: 'accounts',
      name: 'Accounts API',
      description: 'Access customer account information',
      endpoints: [
        {
          method: 'GET',
          path: '/api/v1/accounts',
          description: 'List all accounts for authenticated customer',
          requiredScope: 'accounts:read'
        },
        {
          method: 'GET',
          path: '/api/v1/accounts/{id}',
          description: 'Get details for a specific account',
          requiredScope: 'accounts:read'
        },
        {
          method: 'GET',
          path: '/api/v1/accounts/{id}/balance',
          description: 'Get account balance',
          requiredScope: 'balances:read'
        }
      ]
    },
    {
      id: 'transactions',
      name: 'Transactions API',
      description: 'Access customer transaction history',
      endpoints: [
        {
          method: 'GET',
          path: '/api/v1/accounts/{id}/transactions',
          description: 'Get transaction history for an account',
          requiredScope: 'transactions:read'
        }
      ]
    }
  ],
  scopes: [
    {
      name: 'accounts:read',
      description: 'Read access to customer account information',
      required: true
    },
    {
      name: 'transactions:read',
      description: 'Read access to customer transaction history',
      required: false
    },
    {
      name: 'balances:read',
      description: 'Read access to account balances',
      required: false
    },
    {
      name: 'profile:read',
      description: 'Read access to customer profile information',
      required: false
    }
  ]
};

/**
 * GET /portal/api/catalog
 * Get API catalog with available APIs and scopes
 */
router.get('/catalog', (req, res) => {
  res.json(API_CATALOG);
});

/**
 * POST /portal/api/register
 * Register a new OAuth client application
 * 
 * Body:
 * {
 *   "name": "My Fintech App",
 *   "description": "Personal finance management",
 *   "redirect_uris": ["http://localhost:3000/callback"],
 *   "requested_scopes": ["accounts:read", "transactions:read"],
 *   "contact_email": "dev@fintech.com",
 *   "website_url": "https://fintech.com"
 * }
 */
router.post('/register', async (req, res) => {
  try {
    const registration = req.body;

    // Validate required fields
    if (!registration.name || !registration.redirect_uris || !registration.requested_scopes) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required fields: name, redirect_uris, requested_scopes'
      });
    }

    // Register the client
    const result = await registerClient(registration);

    if (!result.success) {
      return res.status(400).json({
        error: 'registration_failed',
        error_description: result.error,
        details: result
      });
    }

    // Return registration details
    // Note: client_secret is only returned once and must be stored securely
    res.status(201).json({
      client_id: result.client_id,
      client_secret: result.client_secret,
      name: result.name,
      redirect_uris: result.redirect_uris,
      granted_scopes: result.granted_scopes,
      created_at: result.created_at,
      warning: 'Store client_secret securely. It will not be shown again.'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to register application'
    });
  }
});

/**
 * GET /portal/api/apps/:client_id
 * Get application details (without secret)
 */
router.get('/apps/:client_id', async (req, res) => {
  try {
    const { client_id } = req.params;

    const result = await query(
      `SELECT client_id, name, redirect_uris, granted_scopes, 
              description, contact_email, website_url, created_at, status
       FROM oauth_clients
       WHERE client_id = $1`,
      [client_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Application not found'
      });
    }

    const app = result.rows[0];
    res.json({
      client_id: app.client_id,
      name: app.name,
      redirect_uris: app.redirect_uris,
      granted_scopes: app.granted_scopes ? app.granted_scopes.split(' ') : [],
      description: app.description,
      contact_email: app.contact_email,
      website_url: app.website_url,
      created_at: app.created_at,
      status: app.status
    });

  } catch (error) {
    console.error('Get app error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to retrieve application'
    });
  }
});

/**
 * POST /portal/api/authorize
 * Start OAuth authorization flow
 * 
 * Body:
 * {
 *   "client_id": "client_abc123",
 *   "redirect_uri": "http://localhost:3000/callback",
 *   "scope": "accounts:read transactions:read",
 *   "state": "random_state_value"
 * }
 */
router.post('/authorize', async (req, res) => {
  try {
    const { client_id, redirect_uri, scope, state } = req.body;

    // Validate required fields
    if (!client_id || !redirect_uri || !scope) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required fields: client_id, redirect_uri, scope'
      });
    }

    // Verify client exists
    const clientResult = await query(
      'SELECT client_id, redirect_uris FROM oauth_clients WHERE client_id = $1',
      [client_id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(400).json({
        error: 'invalid_client',
        error_description: 'Client not found'
      });
    }

    const client = clientResult.rows[0];

    // Verify redirect_uri is registered
    if (!client.redirect_uris.includes(redirect_uri)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Redirect URI not registered for this client'
      });
    }

    // Build authorization URL
    const authUrl = new URL('/oauth/authorize', process.env.BASE_URL || 'http://localhost:3000');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', client_id);
    authUrl.searchParams.set('redirect_uri', redirect_uri);
    authUrl.searchParams.set('scope', scope);
    if (state) {
      authUrl.searchParams.set('state', state);
    }

    res.json({
      authorization_url: authUrl.toString(),
      instructions: 'Redirect user to this URL to start authorization flow'
    });

  } catch (error) {
    console.error('Authorize error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to create authorization URL'
    });
  }
});

/**
 * POST /portal/api/token
 * Exchange authorization code for access token (server-side only)
 * 
 * Body:
 * {
 *   "code": "auth_code_123",
 *   "client_id": "client_abc123",
 *   "client_secret": "secret_xyz789",
 *   "redirect_uri": "http://localhost:3000/callback"
 * }
 */
router.post('/token', async (req, res) => {
  try {
    const { code, client_id, client_secret, redirect_uri } = req.body;

    // Validate required fields
    if (!code || !client_id || !client_secret || !redirect_uri) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required fields'
      });
    }

    // Forward to token exchange endpoint
    const { exchangeAuthorizationCode } = require('../../auth/oauth/token-exchange');
    
    const result = await exchangeAuthorizationCode({
      grant_type: 'authorization_code',
      code,
      client_id,
      client_secret,
      redirect_uri
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        error_description: result.error_description
      });
    }

    res.json({
      access_token: result.access_token,
      token_type: result.token_type,
      expires_in: result.expires_in,
      refresh_token: result.refresh_token,
      scope: result.scope
    });

  } catch (error) {
    console.error('Token exchange error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to exchange authorization code'
    });
  }
});

/**
 * GET /portal/api/demo/customers
 * Get list of demo customers for testing
 */
router.get('/demo/customers', async (req, res) => {
  try {
    const result = await query(
      `SELECT customer_id, name, email 
       FROM customers 
       WHERE customer_id LIKE 'demo-%'
       LIMIT 5`
    );

    res.json({
      customers: result.rows,
      note: 'These are demo customers for testing the authorization flow'
    });

  } catch (error) {
    console.error('Get demo customers error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to retrieve demo customers'
    });
  }
});

module.exports = router;

// Made with Bob