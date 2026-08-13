/**
 * Audit Logger
 * Records authorization events for all protected API requests
 * 
 * This module provides comprehensive audit logging for:
 * - Allowed requests (successful authorization)
 * - Denied requests (failed authorization with specific reasons)
 * 
 * All audit events are stored in the database for compliance and security monitoring.
 */

const { query } = require('../../data/db');

/**
 * Denial reasons enumeration
 * Maps to specific authorization failure scenarios
 */
const DENIAL_REASONS = {
  INVALID_TOKEN: 'invalid_token',
  EXPIRED_TOKEN: 'expired_token',
  INSUFFICIENT_SCOPE: 'insufficient_scope',
  MISSING_CONSENT: 'missing_consent',
  REVOKED_CONSENT: 'revoked_consent',
  EXPIRED_CONSENT: 'expired_consent',
  DENIED_CONSENT: 'denied_consent',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  MISSING_TOKEN: 'missing_token',
  MALFORMED_TOKEN: 'malformed_token',
  SCOPE_MISMATCH: 'scope_mismatch',
  UNAUTHORIZED: 'unauthorized'
};

/**
 * Log an audit event to the database
 * 
 * @param {Object} event - Audit event details
 * @param {string} event.timestamp - ISO timestamp
 * @param {string} event.endpoint - API endpoint
 * @param {string} event.method - HTTP method
 * @param {string} event.client_id - OAuth client ID
 * @param {string} event.customer_id - Customer ID
 * @param {string} event.consent_id - Consent ID
 * @param {string} event.scope - Granted scopes
 * @param {string} event.required_scope - Required scopes
 * @param {string} event.authorization - 'allowed' or 'denied'
 * @param {string} event.reason - Denial reason (required if denied)
 * @param {string} event.ip_address - Client IP address
 * @param {string} event.user_agent - Client user agent
 * @param {string} event.token_id - Token identifier
 * @param {number} event.http_status - HTTP response status
 * @param {Object} event.metadata - Additional context
 * @returns {Promise<Object>} Audit log entry
 */
async function logAuditEvent(event) {
  try {
    const {
      timestamp = new Date().toISOString(),
      endpoint,
      method,
      client_id = null,
      customer_id = null,
      consent_id = null,
      scope = null,
      required_scope = null,
      authorization,
      reason = null,
      ip_address = null,
      user_agent = null,
      token_id = null,
      http_status = null,
      metadata = null
    } = event;

    // Validate required fields
    if (!endpoint || !method || !authorization) {
      console.error('Audit log error: Missing required fields', event);
      return null;
    }

    // Validate authorization value
    if (!['allowed', 'denied'].includes(authorization)) {
      console.error('Audit log error: Invalid authorization value', authorization);
      return null;
    }

    // Validate denial reason requirement
    if (authorization === 'denied' && !reason) {
      console.error('Audit log error: Denial reason required for denied authorization');
      return null;
    }

    // Insert audit log
    const result = await query(
      `INSERT INTO audit_logs (
        timestamp, endpoint, method, client_id, customer_id, consent_id,
        scope, required_scope, authorization, reason, ip_address, user_agent,
        token_id, http_status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING audit_id, timestamp`,
      [
        timestamp, endpoint, method, client_id, customer_id, consent_id,
        scope, required_scope, authorization, reason, ip_address, user_agent,
        token_id, http_status, metadata ? JSON.stringify(metadata) : null
      ]
    );

    const auditLog = result.rows[0];
    
    // Also log to console for immediate visibility
    const logLevel = authorization === 'denied' ? 'warn' : 'info';
    console[logLevel]('Audit Event:', JSON.stringify({
      audit_id: auditLog.audit_id,
      timestamp: auditLog.timestamp,
      authorization,
      reason,
      endpoint,
      method,
      customer_id,
      client_id,
      consent_id
    }));

    return auditLog;

  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw - audit logging should not break the request flow
    return null;
  }
}

/**
 * Log an allowed authorization event
 * 
 * @param {Object} req - Express request object
 * @param {number} httpStatus - HTTP response status (default: 200)
 * @returns {Promise<Object>} Audit log entry
 */
async function logAllowedRequest(req, httpStatus = 200) {
  const event = {
    timestamp: new Date().toISOString(),
    endpoint: req.path || req.url,
    method: req.method,
    authorization: 'allowed',
    http_status: httpStatus,
    ip_address: req.ip || req.connection?.remoteAddress,
    user_agent: req.headers['user-agent']
  };

  // Extract OAuth token information if available
  if (req.oauth_token) {
    event.client_id = req.oauth_token.client_id;
    event.customer_id = req.oauth_token.customer_id;
    event.consent_id = req.oauth_token.consent_id;
    event.scope = req.oauth_token.scope;
    event.token_id = req.oauth_token.token_id;
  }

  // Extract required scope if available
  if (req.required_scope) {
    event.required_scope = Array.isArray(req.required_scope) 
      ? req.required_scope.join(' ') 
      : req.required_scope;
  }

  // Add consent information if available
  if (req.consent) {
    event.metadata = {
      consent_status: req.consent.status,
      consent_expires_at: req.consent.expires_at
    };
  }

  return await logAuditEvent(event);
}

/**
 * Log a denied authorization event
 * 
 * @param {Object} req - Express request object
 * @param {string} reason - Denial reason (use DENIAL_REASONS constants)
 * @param {number} httpStatus - HTTP response status
 * @param {Object} additionalContext - Additional context for metadata
 * @returns {Promise<Object>} Audit log entry
 */
async function logDeniedRequest(req, reason, httpStatus, additionalContext = {}) {
  const event = {
    timestamp: new Date().toISOString(),
    endpoint: req.path || req.url,
    method: req.method,
    authorization: 'denied',
    reason: reason,
    http_status: httpStatus,
    ip_address: req.ip || req.connection?.remoteAddress,
    user_agent: req.headers['user-agent']
  };

  // Extract OAuth token information if available (even for denied requests)
  if (req.oauth_token) {
    event.client_id = req.oauth_token.client_id;
    event.customer_id = req.oauth_token.customer_id;
    event.consent_id = req.oauth_token.consent_id;
    event.scope = req.oauth_token.scope;
    event.token_id = req.oauth_token.token_id;
  }

  // Extract required scope if available
  if (req.required_scope) {
    event.required_scope = Array.isArray(req.required_scope) 
      ? req.required_scope.join(' ') 
      : req.required_scope;
  }

  // Add additional context to metadata
  if (Object.keys(additionalContext).length > 0) {
    event.metadata = additionalContext;
  }

  return await logAuditEvent(event);
}

/**
 * Middleware to log successful authorization
 * Should be placed after all authorization checks pass
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function auditAllowedRequest(req, res, next) {
  // Capture the original res.json to log after response
  const originalJson = res.json.bind(res);
  
  res.json = function(body) {
    // Log the allowed request
    logAllowedRequest(req, res.statusCode).catch(err => {
      console.error('Failed to log allowed request:', err);
    });
    
    return originalJson(body);
  };
  
  next();
}

/**
 * Query audit logs with filters
 * 
 * @param {Object} filters - Query filters
 * @param {string} filters.customer_id - Filter by customer
 * @param {string} filters.client_id - Filter by client
 * @param {string} filters.consent_id - Filter by consent
 * @param {string} filters.authorization - Filter by authorization status
 * @param {string} filters.reason - Filter by denial reason
 * @param {Date} filters.start_date - Filter by start date
 * @param {Date} filters.end_date - Filter by end date
 * @param {number} filters.limit - Limit results (default: 100)
 * @param {number} filters.offset - Offset for pagination (default: 0)
 * @returns {Promise<Array>} Audit log entries
 */
async function queryAuditLogs(filters = {}) {
  try {
    const {
      customer_id,
      client_id,
      consent_id,
      authorization,
      reason,
      start_date,
      end_date,
      limit = 100,
      offset = 0
    } = filters;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (customer_id) {
      whereConditions.push(`customer_id = $${paramIndex++}`);
      params.push(customer_id);
    }

    if (client_id) {
      whereConditions.push(`client_id = $${paramIndex++}`);
      params.push(client_id);
    }

    if (consent_id) {
      whereConditions.push(`consent_id = $${paramIndex++}`);
      params.push(consent_id);
    }

    if (authorization) {
      whereConditions.push(`authorization = $${paramIndex++}`);
      params.push(authorization);
    }

    if (reason) {
      whereConditions.push(`reason = $${paramIndex++}`);
      params.push(reason);
    }

    if (start_date) {
      whereConditions.push(`timestamp >= $${paramIndex++}`);
      params.push(start_date);
    }

    if (end_date) {
      whereConditions.push(`timestamp <= $${paramIndex++}`);
      params.push(end_date);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    params.push(limit, offset);

    const sql = `
      SELECT 
        audit_id, timestamp, endpoint, method, client_id, customer_id,
        consent_id, scope, required_scope, authorization, reason,
        ip_address, user_agent, token_id, http_status, metadata
      FROM audit_logs
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const result = await query(sql, params);
    return result.rows;

  } catch (error) {
    console.error('Failed to query audit logs:', error);
    throw error;
  }
}

/**
 * Get audit statistics
 * 
 * @param {Object} filters - Query filters (same as queryAuditLogs)
 * @returns {Promise<Object>} Audit statistics
 */
async function getAuditStatistics(filters = {}) {
  try {
    const {
      customer_id,
      client_id,
      consent_id,
      start_date,
      end_date
    } = filters;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (customer_id) {
      whereConditions.push(`customer_id = $${paramIndex++}`);
      params.push(customer_id);
    }

    if (client_id) {
      whereConditions.push(`client_id = $${paramIndex++}`);
      params.push(client_id);
    }

    if (consent_id) {
      whereConditions.push(`consent_id = $${paramIndex++}`);
      params.push(consent_id);
    }

    if (start_date) {
      whereConditions.push(`timestamp >= $${paramIndex++}`);
      params.push(start_date);
    }

    if (end_date) {
      whereConditions.push(`timestamp <= $${paramIndex++}`);
      params.push(end_date);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const sql = `
      SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE authorization = 'allowed') as allowed_count,
        COUNT(*) FILTER (WHERE authorization = 'denied') as denied_count,
        COUNT(DISTINCT customer_id) as unique_customers,
        COUNT(DISTINCT client_id) as unique_clients,
        COUNT(DISTINCT endpoint) as unique_endpoints,
        json_object_agg(
          COALESCE(reason, 'allowed'), 
          COUNT(*) FILTER (WHERE reason IS NOT NULL OR authorization = 'allowed')
        ) as reason_breakdown
      FROM audit_logs
      ${whereClause}
    `;

    const result = await query(sql, params);
    return result.rows[0];

  } catch (error) {
    console.error('Failed to get audit statistics:', error);
    throw error;
  }
}

module.exports = {
  DENIAL_REASONS,
  logAuditEvent,
  logAllowedRequest,
  logDeniedRequest,
  auditAllowedRequest,
  queryAuditLogs,
  getAuditStatistics
};

// Made with Bob
