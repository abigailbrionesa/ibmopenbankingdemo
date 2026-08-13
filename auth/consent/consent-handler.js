/**
 * Consent Handler
 * HTTP endpoint handlers for consent approval flow
 */

const {
  createConsent,
  approveConsent,
  denyConsent,
  revokeConsent,
  getConsent,
  getCustomerConsents,
  findActiveConsent
} = require('./consent-manager');
const { query } = require('../../data/db');

/**
 * Handle consent page request
 * Shows the consent screen to the customer
 * 
 * @param {string} auth_request_id - Authorization request identifier
 * @param {string} customer_id - Authenticated customer identifier
 * @returns {Promise<Object>} Consent page data
 */
async function handleConsentPageRequest(auth_request_id, customer_id) {
  // Fetch authorization request
  const authRequestResult = await query(
    'SELECT * FROM authorization_requests WHERE auth_request_id = $1 AND customer_id = $2',
    [auth_request_id, customer_id]
  );

  if (authRequestResult.rows.length === 0) {
    return {
      success: false,
      error: 'invalid_request',
      error_description: 'Authorization request not found or does not belong to customer'
    };
  }

  const authRequest = authRequestResult.rows[0];

  // Check if authorization request has expired
  if (new Date() > new Date(authRequest.expires_at)) {
    return {
      success: false,
      error: 'expired_request',
      error_description: 'Authorization request has expired'
    };
  }

  // Fetch client details
  const clientResult = await query(
    'SELECT client_id, name, description, logo_uri, policy_uri, tos_uri FROM oauth_clients WHERE client_id = $1',
    [authRequest.client_id]
  );

  if (clientResult.rows.length === 0) {
    return {
      success: false,
      error: 'invalid_client',
      error_description: 'Client not found'
    };
  }

  const client = clientResult.rows[0];

  // Fetch customer details
  const customerResult = await query(
    'SELECT customer_id, first_name, last_name, email FROM customers WHERE customer_id = $1',
    [customer_id]
  );

  if (customerResult.rows.length === 0) {
    return {
      success: false,
      error: 'invalid_customer',
      error_description: 'Customer not found'
    };
  }

  const customer = customerResult.rows[0];

  // Parse requested scopes
  const requested_scopes = authRequest.scope.split(' ');

  // Check if customer already has active consent for this client
  const existingConsent = await findActiveConsent(
    customer_id,
    authRequest.client_id,
    requested_scopes
  );

  return {
    success: true,
    auth_request_id: auth_request_id,
    client: {
      client_id: client.client_id,
      name: client.name,
      description: client.description,
      logo_uri: client.logo_uri,
      policy_uri: client.policy_uri,
      tos_uri: client.tos_uri
    },
    customer: {
      customer_id: customer.customer_id,
      name: `${customer.first_name} ${customer.last_name}`,
      email: customer.email
    },
    requested_scopes: requested_scopes,
    scope_descriptions: getScopeDescriptions(requested_scopes),
    existing_consent: existingConsent ? {
      consent_id: existingConsent.consent_id,
      granted_scopes: existingConsent.granted_scopes.split(' '),
      approved_at: existingConsent.approved_at,
      expires_at: existingConsent.expires_at
    } : null,
    redirect_uri: authRequest.redirect_uri,
    state: authRequest.state
  };
}

/**
 * Handle consent approval or denial
 * 
 * @param {Object} params - Consent decision parameters
 * @param {string} params.auth_request_id - Authorization request identifier
 * @param {string} params.action - 'approve' or 'deny'
 * @param {string[]} [params.granted_scopes] - Scopes to grant (for partial approval)
 * @param {string} customer_id - Authenticated customer identifier
 * @param {string} [ip_address] - Customer's IP address
 * @param {string} [user_agent] - Customer's user agent
 * @returns {Promise<Object>} Result with authorization code or error
 */
async function handleConsentDecision(params, customer_id, ip_address = null, user_agent = null) {
  const { auth_request_id, action, granted_scopes } = params;

  // Validate action
  if (!['approve', 'deny'].includes(action)) {
    return {
      success: false,
      error: 'invalid_request',
      error_description: 'Action must be "approve" or "deny"'
    };
  }

  // Fetch authorization request
  const authRequestResult = await query(
    'SELECT * FROM authorization_requests WHERE auth_request_id = $1 AND customer_id = $2',
    [auth_request_id, customer_id]
  );

  if (authRequestResult.rows.length === 0) {
    return {
      success: false,
      error: 'invalid_request',
      error_description: 'Authorization request not found'
    };
  }

  const authRequest = authRequestResult.rows[0];

  // Check expiration
  if (new Date() > new Date(authRequest.expires_at)) {
    return {
      success: false,
      error: 'expired_request',
      error_description: 'Authorization request has expired',
      should_redirect: true,
      redirect_uri: authRequest.redirect_uri,
      state: authRequest.state
    };
  }

  // Fetch client details for purpose
  const clientResult = await query(
    'SELECT name, description FROM oauth_clients WHERE client_id = $1',
    [authRequest.client_id]
  );

  const client = clientResult.rows[0];
  const purpose = `${client.name} - ${client.description || 'Access to banking data'}`;

  if (action === 'deny') {
    // Create denied consent record
    const consent = await createConsent({
      customer_id: customer_id,
      client_id: authRequest.client_id,
      purpose: purpose,
      requested_scopes: authRequest.scope.split(' '),
      ip_address: ip_address,
      user_agent: user_agent,
      expiration_days: 90
    });

    await denyConsent(consent.consent_id, customer_id);

    // Delete authorization request
    await query('DELETE FROM authorization_requests WHERE auth_request_id = $1', [auth_request_id]);

    return {
      success: false,
      error: 'access_denied',
      error_description: 'Customer denied consent',
      should_redirect: true,
      redirect_uri: authRequest.redirect_uri,
      state: authRequest.state
    };
  }

  // Action is 'approve'
  
  // Determine scopes to grant
  const requested_scopes = authRequest.scope.split(' ');
  let scopes_to_grant = requested_scopes;

  if (granted_scopes && granted_scopes.length > 0) {
    // Customer granted subset of scopes
    scopes_to_grant = granted_scopes;
    
    // Validate granted scopes are subset of requested
    const invalid = scopes_to_grant.filter(scope => !requested_scopes.includes(scope));
    if (invalid.length > 0) {
      return {
        success: false,
        error: 'invalid_scope',
        error_description: `Invalid scopes: ${invalid.join(', ')}`
      };
    }
  }

  // Check if customer already has active consent
  const existingConsent = await findActiveConsent(
    customer_id,
    authRequest.client_id,
    scopes_to_grant
  );

  let consent;
  if (existingConsent) {
    // Reuse existing consent
    consent = existingConsent;
  } else {
    // Create new consent
    consent = await createConsent({
      customer_id: customer_id,
      client_id: authRequest.client_id,
      purpose: purpose,
      requested_scopes: requested_scopes,
      ip_address: ip_address,
      user_agent: user_agent,
      expiration_days: 90
    });

    // Approve the consent
    consent = await approveConsent(consent.consent_id, customer_id, scopes_to_grant);
  }

  // Generate authorization code
  const crypto = require('crypto');
  const auth_code = `authcode_${crypto.randomBytes(32).toString('hex')}`;
  const code_expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Store authorization code with consent reference
  await query(
    `INSERT INTO authorization_codes 
     (code, customer_id, client_id, redirect_uri, scope, consent_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      auth_code,
      customer_id,
      authRequest.client_id,
      authRequest.redirect_uri,
      consent.granted_scopes,
      consent.consent_id,
      code_expires_at
    ]
  );

  // Delete authorization request (single use)
  await query('DELETE FROM authorization_requests WHERE auth_request_id = $1', [auth_request_id]);

  return {
    success: true,
    code: auth_code,
    consent_id: consent.consent_id,
    granted_scopes: consent.granted_scopes.split(' '),
    redirect_uri: authRequest.redirect_uri,
    state: authRequest.state
  };
}

/**
 * Handle consent revocation request
 * 
 * @param {string} consent_id - Consent identifier
 * @param {string} customer_id - Customer identifier
 * @param {string} [reason] - Reason for revocation
 * @returns {Promise<Object>} Result of revocation
 */
async function handleConsentRevocation(consent_id, customer_id, reason = null) {
  try {
    // Verify consent belongs to customer
    const consent = await getConsent(consent_id, customer_id);
    
    if (!consent) {
      return {
        success: false,
        error: 'not_found',
        error_description: 'Consent not found or does not belong to customer'
      };
    }

    // Revoke the consent
    const revokedConsent = await revokeConsent(consent_id, customer_id, reason);

    // Invalidate all access tokens associated with this consent
    await query(
      `UPDATE access_tokens 
       SET revoked = true, revoked_at = CURRENT_TIMESTAMP 
       WHERE consent_id = $1`,
      [consent_id]
    );

    return {
      success: true,
      consent_id: revokedConsent.consent_id,
      revoked_at: revokedConsent.revoked_at
    };
  } catch (error) {
    return {
      success: false,
      error: 'revocation_failed',
      error_description: error.message
    };
  }
}

/**
 * Get customer's consent list
 * 
 * @param {string} customer_id - Customer identifier
 * @param {Object} [filters] - Optional filters
 * @returns {Promise<Object>} List of consents
 */
async function handleGetCustomerConsents(customer_id, filters = {}) {
  try {
    const consents = await getCustomerConsents(customer_id, filters);

    // Enrich with client details
    const enrichedConsents = await Promise.all(
      consents.map(async (consent) => {
        const clientResult = await query(
          'SELECT name, description, logo_uri FROM oauth_clients WHERE client_id = $1',
          [consent.client_id]
        );

        return {
          consent_id: consent.consent_id,
          client: clientResult.rows[0] || { name: 'Unknown', description: '', logo_uri: null },
          purpose: consent.purpose,
          granted_scopes: consent.granted_scopes ? consent.granted_scopes.split(' ') : [],
          status: consent.status,
          created_at: consent.created_at,
          approved_at: consent.approved_at,
          expires_at: consent.expires_at,
          revoked_at: consent.revoked_at,
          revocation_reason: consent.revocation_reason
        };
      })
    );

    return {
      success: true,
      consents: enrichedConsents
    };
  } catch (error) {
    return {
      success: false,
      error: 'fetch_failed',
      error_description: error.message
    };
  }
}

/**
 * Get human-readable descriptions for scopes
 * 
 * @param {string[]} scopes - Array of scope strings
 * @returns {Object} Map of scope to description
 */
function getScopeDescriptions(scopes) {
  const descriptions = {
    'accounts:read': {
      title: 'View your accounts',
      description: 'Read your account numbers, types, and basic information'
    },
    'transactions:read': {
      title: 'View your transactions',
      description: 'Read your transaction history and details'
    },
    'balances:read': {
      title: 'View your balances',
      description: 'Read current and available balances for your accounts'
    },
    'profile:read': {
      title: 'View your profile',
      description: 'Read your name, email, and contact information'
    }
  };

  const result = {};
  scopes.forEach(scope => {
    result[scope] = descriptions[scope] || {
      title: scope,
      description: 'Access to ' + scope
    };
  });

  return result;
}

module.exports = {
  handleConsentPageRequest,
  handleConsentDecision,
  handleConsentRevocation,
  handleGetCustomerConsents,
  getScopeDescriptions
};

// Made with Bob
