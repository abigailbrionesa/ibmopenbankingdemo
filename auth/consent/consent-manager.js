/**
 * Consent Manager
 * Handles creation, approval, denial, and revocation of customer consents
 */

const crypto = require('crypto');
const { query } = require('../../data/db');

/**
 * Default consent expiration period (90 days)
 */
const DEFAULT_CONSENT_EXPIRATION_DAYS = 90;

/**
 * Create a new consent record in pending state
 * 
 * @param {Object} params - Consent parameters
 * @param {string} params.customer_id - Customer identifier
 * @param {string} params.client_id - OAuth client identifier
 * @param {string} params.purpose - Human-readable purpose for data access
 * @param {string[]} params.requested_scopes - Array of requested scope strings
 * @param {string} [params.ip_address] - Customer's IP address
 * @param {string} [params.user_agent] - Customer's user agent
 * @param {number} [params.expiration_days] - Days until consent expires (default: 90)
 * @returns {Promise<Object>} Created consent record
 */
async function createConsent(params) {
  const {
    customer_id,
    client_id,
    purpose,
    requested_scopes,
    ip_address,
    user_agent,
    expiration_days = DEFAULT_CONSENT_EXPIRATION_DAYS
  } = params;

  // Validate required parameters
  if (!customer_id || !client_id || !purpose || !requested_scopes || requested_scopes.length === 0) {
    throw new Error('Missing required consent parameters');
  }

  // Generate unique consent ID
  const consent_id = `consent_${crypto.randomBytes(16).toString('hex')}`;

  // Calculate expiration date
  const expires_at = new Date();
  expires_at.setDate(expires_at.getDate() + expiration_days);

  // Convert scopes array to space-separated string
  const scopes_string = Array.isArray(requested_scopes) 
    ? requested_scopes.join(' ') 
    : requested_scopes;

  // Insert consent record
  const result = await query(
    `INSERT INTO consents 
     (consent_id, customer_id, client_id, purpose, requested_scopes, status, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      consent_id,
      customer_id,
      client_id,
      purpose,
      scopes_string,
      'pending',
      expires_at,
      ip_address || null,
      user_agent || null
    ]
  );

  return result.rows[0];
}

/**
 * Approve a pending consent
 * 
 * @param {string} consent_id - Consent identifier
 * @param {string} customer_id - Customer identifier (for verification)
 * @param {string[]} [granted_scopes] - Scopes actually granted (defaults to all requested)
 * @returns {Promise<Object>} Updated consent record
 */
async function approveConsent(consent_id, customer_id, granted_scopes = null) {
  // Fetch the consent
  const consentResult = await query(
    'SELECT * FROM consents WHERE consent_id = $1 AND customer_id = $2',
    [consent_id, customer_id]
  );

  if (consentResult.rows.length === 0) {
    throw new Error('Consent not found or does not belong to customer');
  }

  const consent = consentResult.rows[0];

  // Verify consent is in pending state
  if (consent.status !== 'pending') {
    throw new Error(`Cannot approve consent in ${consent.status} state`);
  }

  // Check if consent has expired
  if (new Date() > new Date(consent.expires_at)) {
    // Mark as expired
    await query(
      'UPDATE consents SET status = $1 WHERE consent_id = $2',
      ['expired', consent_id]
    );
    throw new Error('Consent has expired');
  }

  // Determine granted scopes
  let granted_scopes_string;
  if (granted_scopes && granted_scopes.length > 0) {
    // Customer granted subset of requested scopes
    granted_scopes_string = Array.isArray(granted_scopes) 
      ? granted_scopes.join(' ') 
      : granted_scopes;
    
    // Validate granted scopes are subset of requested
    const requested = consent.requested_scopes.split(' ');
    const granted = granted_scopes_string.split(' ');
    const invalid = granted.filter(scope => !requested.includes(scope));
    
    if (invalid.length > 0) {
      throw new Error(`Granted scopes must be subset of requested scopes. Invalid: ${invalid.join(', ')}`);
    }
  } else {
    // Grant all requested scopes
    granted_scopes_string = consent.requested_scopes;
  }

  // Update consent to approved
  const result = await query(
    `UPDATE consents 
     SET status = $1, granted_scopes = $2, approved_at = CURRENT_TIMESTAMP
     WHERE consent_id = $3
     RETURNING *`,
    ['approved', granted_scopes_string, consent_id]
  );

  return result.rows[0];
}

/**
 * Deny a pending consent
 * 
 * @param {string} consent_id - Consent identifier
 * @param {string} customer_id - Customer identifier (for verification)
 * @returns {Promise<Object>} Updated consent record
 */
async function denyConsent(consent_id, customer_id) {
  // Fetch the consent
  const consentResult = await query(
    'SELECT * FROM consents WHERE consent_id = $1 AND customer_id = $2',
    [consent_id, customer_id]
  );

  if (consentResult.rows.length === 0) {
    throw new Error('Consent not found or does not belong to customer');
  }

  const consent = consentResult.rows[0];

  // Verify consent is in pending state
  if (consent.status !== 'pending') {
    throw new Error(`Cannot deny consent in ${consent.status} state`);
  }

  // Update consent to denied
  const result = await query(
    `UPDATE consents 
     SET status = $1, denied_at = CURRENT_TIMESTAMP
     WHERE consent_id = $2
     RETURNING *`,
    ['denied', consent_id]
  );

  return result.rows[0];
}

/**
 * Revoke an approved consent
 * 
 * @param {string} consent_id - Consent identifier
 * @param {string} revoked_by - Who is revoking (customer_id or 'system')
 * @param {string} [reason] - Reason for revocation
 * @returns {Promise<Object>} Updated consent record
 */
async function revokeConsent(consent_id, revoked_by, reason = null) {
  // Fetch the consent
  const consentResult = await query(
    'SELECT * FROM consents WHERE consent_id = $1',
    [consent_id]
  );

  if (consentResult.rows.length === 0) {
    throw new Error('Consent not found');
  }

  const consent = consentResult.rows[0];

  // Verify consent is in approved state
  if (consent.status !== 'approved') {
    throw new Error(`Cannot revoke consent in ${consent.status} state`);
  }

  // Update consent to revoked
  const result = await query(
    `UPDATE consents 
     SET status = $1, revoked_at = CURRENT_TIMESTAMP, revoked_by = $2, revocation_reason = $3
     WHERE consent_id = $4
     RETURNING *`,
    ['revoked', revoked_by, reason, consent_id]
  );

  return result.rows[0];
}

/**
 * Get consent by ID
 * 
 * @param {string} consent_id - Consent identifier
 * @param {string} [customer_id] - Optional customer ID for verification
 * @returns {Promise<Object|null>} Consent record or null if not found
 */
async function getConsent(consent_id, customer_id = null) {
  let sql = 'SELECT * FROM consents WHERE consent_id = $1';
  const params = [consent_id];

  if (customer_id) {
    sql += ' AND customer_id = $2';
    params.push(customer_id);
  }

  const result = await query(sql, params);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get all consents for a customer
 * 
 * @param {string} customer_id - Customer identifier
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.status] - Filter by status
 * @param {string} [filters.client_id] - Filter by client
 * @param {boolean} [filters.active_only] - Only return active (approved, not expired) consents
 * @returns {Promise<Array>} Array of consent records
 */
async function getCustomerConsents(customer_id, filters = {}) {
  let sql = 'SELECT * FROM consents WHERE customer_id = $1';
  const params = [customer_id];
  let paramIndex = 2;

  if (filters.status) {
    sql += ` AND status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  if (filters.client_id) {
    sql += ` AND client_id = $${paramIndex}`;
    params.push(filters.client_id);
    paramIndex++;
  }

  if (filters.active_only) {
    sql += ` AND status = 'approved' AND expires_at > CURRENT_TIMESTAMP`;
  }

  sql += ' ORDER BY created_at DESC';

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get all consents for a client
 * 
 * @param {string} client_id - Client identifier
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.status] - Filter by status
 * @param {boolean} [filters.active_only] - Only return active consents
 * @returns {Promise<Array>} Array of consent records
 */
async function getClientConsents(client_id, filters = {}) {
  let sql = 'SELECT * FROM consents WHERE client_id = $1';
  const params = [client_id];
  let paramIndex = 2;

  if (filters.status) {
    sql += ` AND status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  if (filters.active_only) {
    sql += ` AND status = 'approved' AND expires_at > CURRENT_TIMESTAMP`;
  }

  sql += ' ORDER BY created_at DESC';

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Check if customer has active consent for client with required scopes
 * 
 * @param {string} customer_id - Customer identifier
 * @param {string} client_id - Client identifier
 * @param {string[]} required_scopes - Required scopes
 * @returns {Promise<Object|null>} Active consent if exists, null otherwise
 */
async function findActiveConsent(customer_id, client_id, required_scopes) {
  const result = await query(
    `SELECT * FROM consents 
     WHERE customer_id = $1 
       AND client_id = $2 
       AND status = 'approved' 
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY approved_at DESC
     LIMIT 1`,
    [customer_id, client_id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const consent = result.rows[0];

  // Check if granted scopes include all required scopes
  const granted = consent.granted_scopes.split(' ');
  const required = Array.isArray(required_scopes) ? required_scopes : required_scopes.split(' ');
  const missing = required.filter(scope => !granted.includes(scope));

  if (missing.length > 0) {
    // Consent exists but doesn't have all required scopes
    return null;
  }

  return consent;
}

/**
 * Expire old consents (batch job)
 * 
 * @returns {Promise<number>} Number of consents expired
 */
async function expireOldConsents() {
  const result = await query(
    `UPDATE consents 
     SET status = 'expired' 
     WHERE status = 'approved' 
       AND expires_at <= CURRENT_TIMESTAMP
     RETURNING consent_id`
  );

  return result.rows.length;
}

/**
 * Get consent statistics for a customer
 * 
 * @param {string} customer_id - Customer identifier
 * @returns {Promise<Object>} Statistics object
 */
async function getConsentStatistics(customer_id) {
  const result = await query(
    `SELECT 
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'approved' AND expires_at > CURRENT_TIMESTAMP) as active,
       COUNT(*) FILTER (WHERE status = 'pending') as pending,
       COUNT(*) FILTER (WHERE status = 'revoked') as revoked,
       COUNT(*) FILTER (WHERE status = 'expired') as expired,
       COUNT(*) FILTER (WHERE status = 'denied') as denied
     FROM consents 
     WHERE customer_id = $1`,
    [customer_id]
  );

  return result.rows[0];
}

module.exports = {
  createConsent,
  approveConsent,
  denyConsent,
  revokeConsent,
  getConsent,
  getCustomerConsents,
  getClientConsents,
  findActiveConsent,
  expireOldConsents,
  getConsentStatistics,
  DEFAULT_CONSENT_EXPIRATION_DAYS
};

// Made with Bob
