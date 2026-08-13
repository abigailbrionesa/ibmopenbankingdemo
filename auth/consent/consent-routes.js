/**
 * Consent API Routes
 * Express routes for consent management endpoints
 */

const express = require('express');
const router = express.Router();
const {
  handleConsentPageRequest,
  handleConsentDecision,
  handleConsentRevocation,
  handleGetCustomerConsents
} = require('./consent-handler');

/**
 * Middleware to verify customer authentication
 * Should be applied to all consent routes
 */
function requireCustomerAuth(req, res, next) {
  const sessionToken = req.cookies?.session_token || req.headers['x-session-token'];
  
  if (!sessionToken) {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'Customer authentication required'
    });
  }
  
  // Verify session and attach customer_id to request
  // This would use the customer authentication module
  const { verifyCustomerSession } = require('../customer-authentication');
  
  verifyCustomerSession(sessionToken)
    .then(session => {
      if (!session) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Invalid or expired session'
        });
      }
      
      req.customer_id = session.customer_id;
      next();
    })
    .catch(error => {
      console.error('Session verification error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to verify session'
      });
    });
}

/**
 * GET /api/consent/page
 * Load consent page data for customer approval
 */
router.get('/page', requireCustomerAuth, async (req, res) => {
  try {
    const { auth_request_id } = req.query;
    
    if (!auth_request_id) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'auth_request_id is required'
      });
    }
    
    const result = await handleConsentPageRequest(auth_request_id, req.customer_id);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Consent page error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to load consent page'
    });
  }
});

/**
 * POST /api/consent/decision
 * Submit customer's consent decision (approve or deny)
 */
router.post('/decision', requireCustomerAuth, async (req, res) => {
  try {
    const { auth_request_id, action, granted_scopes } = req.body;
    
    if (!auth_request_id || !action) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'auth_request_id and action are required'
      });
    }
    
    const ip_address = req.ip || req.connection.remoteAddress;
    const user_agent = req.headers['user-agent'];
    
    const result = await handleConsentDecision(
      { auth_request_id, action, granted_scopes },
      req.customer_id,
      ip_address,
      user_agent
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Consent decision error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to process consent decision'
    });
  }
});

/**
 * POST /api/consents/:consent_id/revoke
 * Revoke an approved consent
 */
router.post('/:consent_id/revoke', requireCustomerAuth, async (req, res) => {
  try {
    const { consent_id } = req.params;
    const { reason } = req.body;
    
    if (!consent_id) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'consent_id is required'
      });
    }
    
    const result = await handleConsentRevocation(
      consent_id,
      req.customer_id,
      reason
    );
    
    if (!result.success) {
      const statusCode = result.error === 'not_found' ? 404 : 400;
      return res.status(statusCode).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Consent revocation error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to revoke consent'
    });
  }
});

/**
 * GET /api/consents
 * Get customer's consent list
 */
router.get('/', requireCustomerAuth, async (req, res) => {
  try {
    const { status, client_id, active_only } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (client_id) filters.client_id = client_id;
    if (active_only === 'true') filters.active_only = true;
    
    const result = await handleGetCustomerConsents(req.customer_id, filters);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Get consents error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to retrieve consents'
    });
  }
});

/**
 * GET /api/consents/:consent_id
 * Get specific consent details
 */
router.get('/:consent_id', requireCustomerAuth, async (req, res) => {
  try {
    const { consent_id } = req.params;
    const { getConsent } = require('./consent-manager');
    
    const consent = await getConsent(consent_id, req.customer_id);
    
    if (!consent) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Consent not found'
      });
    }
    
    // Enrich with client details
    const { query } = require('../../data/db');
    const clientResult = await query(
      'SELECT name, description, logo_uri FROM oauth_clients WHERE client_id = $1',
      [consent.client_id]
    );
    
    res.json({
      success: true,
      consent: {
        consent_id: consent.consent_id,
        client: clientResult.rows[0] || { name: 'Unknown', description: '', logo_uri: null },
        purpose: consent.purpose,
        requested_scopes: consent.requested_scopes.split(' '),
        granted_scopes: consent.granted_scopes ? consent.granted_scopes.split(' ') : [],
        status: consent.status,
        created_at: consent.created_at,
        approved_at: consent.approved_at,
        denied_at: consent.denied_at,
        revoked_at: consent.revoked_at,
        expires_at: consent.expires_at,
        revocation_reason: consent.revocation_reason
      }
    });
  } catch (error) {
    console.error('Get consent error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to retrieve consent'
    });
  }
});

module.exports = router;

// Made with Bob
