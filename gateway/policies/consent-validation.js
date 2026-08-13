/**
 * Consent Validation Policy
 * Gateway middleware to validate consent status before allowing API access
 * 
 * This policy ensures that even with a valid OAuth token, API access is blocked
 * if the underlying consent has been revoked or expired.
 */

const { query } = require('../../data/db');

/**
 * Validate consent status for API request
 * 
 * This middleware should be applied after OAuth token validation
 * to ensure the consent backing the token is still active.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function validateConsent(req, res, next) {
  try {
    // Extract token payload (should be set by prior OAuth middleware)
    const tokenPayload = req.oauth_token;
    
    if (!tokenPayload) {
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'No valid OAuth token found'
      });
    }
    
    const { customer_id, client_id, consent_id } = tokenPayload;
    
    if (!consent_id) {
      // Token doesn't have consent_id (legacy or malformed)
      return res.status(403).json({
        error: 'forbidden',
        error_description: 'Token is not associated with a consent'
      });
    }
    
    // Fetch consent from database
    const consentResult = await query(
      `SELECT consent_id, customer_id, client_id, status, expires_at, granted_scopes
       FROM consents 
       WHERE consent_id = $1 AND customer_id = $2 AND client_id = $3`,
      [consent_id, customer_id, client_id]
    );
    
    if (consentResult.rows.length === 0) {
      return res.status(403).json({
        error: 'forbidden',
        error_description: 'Consent not found',
        consent_id: consent_id
      });
    }
    
    const consent = consentResult.rows[0];
    
    // Check consent status
    if (consent.status === 'revoked') {
      return res.status(403).json({
        error: 'forbidden',
        error_description: 'Consent has been revoked',
        consent_id: consent_id,
        status: 'revoked'
      });
    }
    
    if (consent.status === 'denied') {
      return res.status(403).json({
        error: 'forbidden',
        error_description: 'Consent was denied',
        consent_id: consent_id,
        status: 'denied'
      });
    }
    
    if (consent.status === 'expired') {
      return res.status(403).json({
        error: 'forbidden',
        error_description: 'Consent has expired',
        consent_id: consent_id,
        status: 'expired'
      });
    }
    
    if (consent.status !== 'approved') {
      return res.status(403).json({
        error: 'forbidden',
        error_description: `Consent is in ${consent.status} state`,
        consent_id: consent_id,
        status: consent.status
      });
    }
    
    // Check consent expiration
    const now = new Date();
    const expiresAt = new Date(consent.expires_at);
    
    if (now > expiresAt) {
      // Mark consent as expired
      await query(
        'UPDATE consents SET status = $1 WHERE consent_id = $2',
        ['expired', consent_id]
      );
      
      return res.status(403).json({
        error: 'forbidden',
        error_description: 'Consent has expired',
        consent_id: consent_id,
        status: 'expired',
        expired_at: consent.expires_at
      });
    }
    
    // Validate scopes in token match consent
    const tokenScopes = tokenPayload.scope ? tokenPayload.scope.split(' ') : [];
    const consentScopes = consent.granted_scopes ? consent.granted_scopes.split(' ') : [];
    
    const unauthorizedScopes = tokenScopes.filter(scope => !consentScopes.includes(scope));
    
    if (unauthorizedScopes.length > 0) {
      return res.status(403).json({
        error: 'forbidden',
        error_description: 'Token scopes exceed consent scopes',
        consent_id: consent_id,
        unauthorized_scopes: unauthorizedScopes,
        granted_scopes: consentScopes
      });
    }
    
    // Attach consent to request for downstream use
    req.consent = consent;
    
    next();
  } catch (error) {
    console.error('Consent validation error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to validate consent'
    });
  }
}

/**
 * Validate consent for specific resource access
 * 
 * This is a more granular check that can be applied to specific routes
 * to ensure the consent includes the required scope for that resource.
 * 
 * @param {string} requiredScope - The scope required for this resource
 * @returns {Function} Express middleware function
 */
function requireConsentScope(requiredScope) {
  return (req, res, next) => {
    const consent = req.consent;
    
    if (!consent) {
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Consent validation middleware not applied'
      });
    }
    
    const grantedScopes = consent.granted_scopes ? consent.granted_scopes.split(' ') : [];
    
    if (!grantedScopes.includes(requiredScope)) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `This resource requires '${requiredScope}' scope`,
        required_scope: requiredScope,
        granted_scopes: grantedScopes
      });
    }
    
    next();
  };
}

/**
 * Check if consent is active (approved and not expired)
 * 
 * Utility function for checking consent status without middleware
 * 
 * @param {string} consent_id - Consent identifier
 * @returns {Promise<Object>} Consent status result
 */
async function checkConsentStatus(consent_id) {
  try {
    const result = await query(
      `SELECT consent_id, status, expires_at, granted_scopes
       FROM consents 
       WHERE consent_id = $1`,
      [consent_id]
    );
    
    if (result.rows.length === 0) {
      return {
        active: false,
        reason: 'not_found',
        message: 'Consent not found'
      };
    }
    
    const consent = result.rows[0];
    
    if (consent.status === 'revoked') {
      return {
        active: false,
        reason: 'revoked',
        message: 'Consent has been revoked',
        consent: consent
      };
    }
    
    if (consent.status !== 'approved') {
      return {
        active: false,
        reason: 'not_approved',
        message: `Consent is in ${consent.status} state`,
        consent: consent
      };
    }
    
    const now = new Date();
    const expiresAt = new Date(consent.expires_at);
    
    if (now > expiresAt) {
      // Mark as expired
      await query(
        'UPDATE consents SET status = $1 WHERE consent_id = $2',
        ['expired', consent_id]
      );
      
      return {
        active: false,
        reason: 'expired',
        message: 'Consent has expired',
        consent: consent
      };
    }
    
    return {
      active: true,
      consent: consent
    };
  } catch (error) {
    console.error('Consent status check error:', error);
    return {
      active: false,
      reason: 'error',
      message: 'Failed to check consent status',
      error: error.message
    };
  }
}

/**
 * Batch check consent status for multiple consent IDs
 * 
 * @param {string[]} consent_ids - Array of consent identifiers
 * @returns {Promise<Object>} Map of consent_id to status
 */
async function batchCheckConsentStatus(consent_ids) {
  try {
    const placeholders = consent_ids.map((_, i) => `$${i + 1}`).join(',');
    
    const result = await query(
      `SELECT consent_id, status, expires_at
       FROM consents 
       WHERE consent_id IN (${placeholders})`,
      consent_ids
    );
    
    const statusMap = {};
    const now = new Date();
    
    for (const consent of result.rows) {
      const expiresAt = new Date(consent.expires_at);
      
      if (consent.status === 'approved' && now <= expiresAt) {
        statusMap[consent.consent_id] = { active: true, status: 'approved' };
      } else {
        statusMap[consent.consent_id] = { 
          active: false, 
          status: consent.status,
          expired: now > expiresAt
        };
      }
    }
    
    // Mark missing consents
    for (const consent_id of consent_ids) {
      if (!statusMap[consent_id]) {
        statusMap[consent_id] = { active: false, status: 'not_found' };
      }
    }
    
    return statusMap;
  } catch (error) {
    console.error('Batch consent status check error:', error);
    throw error;
  }
}

module.exports = {
  validateConsent,
  requireConsentScope,
  checkConsentStatus,
  batchCheckConsentStatus
};

// Made with Bob
