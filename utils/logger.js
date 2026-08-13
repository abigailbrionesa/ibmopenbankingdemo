/**
 * Centralized Logging Utility
 * Provides structured logging with correlation IDs for observability
 * 
 * Features:
 * - Correlation ID tracking across requests
 * - Automatic secret/token redaction
 * - Latency measurement
 * - Structured JSON logging
 * - Multiple log levels
 */

const crypto = require('crypto');

/**
 * Log levels
 */
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

/**
 * Sensitive field patterns to redact
 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /bearer/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /client[_-]?secret/i,
  /session[_-]?token/i
];

/**
 * Generate a correlation ID
 * @returns {string} Correlation ID
 */
function generateCorrelationId() {
  return `corr_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Redact sensitive values from an object
 * @param {any} obj - Object to redact
 * @returns {any} Redacted object
 */
function redactSensitiveData(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check if this looks like a token (JWT format)
    if (obj.split('.').length === 3 && obj.length > 50) {
      return '[REDACTED_TOKEN]';
    }
    // Check if this looks like a secret (long random string)
    if (obj.length > 32 && /^[A-Za-z0-9+/=_-]+$/.test(obj)) {
      return '[REDACTED_SECRET]';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }

  if (typeof obj === 'object') {
    const redacted = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if key matches sensitive pattern
      const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
      
      if (isSensitive) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    return redacted;
  }

  return obj;
}

/**
 * Format log entry
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 * @returns {Object} Formatted log entry
 */
function formatLogEntry(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...redactSensitiveData(context)
  };

  return entry;
}

/**
 * Write log entry to output
 * @param {Object} entry - Log entry
 */
function writeLog(entry) {
  const logString = JSON.stringify(entry);
  
  switch (entry.level) {
    case LOG_LEVELS.ERROR:
      console.error(logString);
      break;
    case LOG_LEVELS.WARN:
      console.warn(logString);
      break;
    case LOG_LEVELS.DEBUG:
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(logString);
      }
      break;
    default:
      console.log(logString);
  }
}

/**
 * Logger class
 */
class Logger {
  constructor(component, correlationId = null) {
    this.component = component;
    this.correlationId = correlationId || generateCorrelationId();
  }

  /**
   * Create child logger with same correlation ID
   * @param {string} subComponent - Sub-component name
   * @returns {Logger} Child logger
   */
  child(subComponent) {
    return new Logger(`${this.component}.${subComponent}`, this.correlationId);
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  info(message, context = {}) {
    const entry = formatLogEntry(LOG_LEVELS.INFO, message, {
      component: this.component,
      correlation_id: this.correlationId,
      ...context
    });
    writeLog(entry);
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  warn(message, context = {}) {
    const entry = formatLogEntry(LOG_LEVELS.WARN, message, {
      component: this.component,
      correlation_id: this.correlationId,
      ...context
    });
    writeLog(entry);
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Error|Object} error - Error object or context
   * @param {Object} context - Additional context
   */
  error(message, error = null, context = {}) {
    const errorContext = error instanceof Error ? {
      error_message: error.message,
      error_stack: error.stack,
      error_name: error.name
    } : error;

    const entry = formatLogEntry(LOG_LEVELS.ERROR, message, {
      component: this.component,
      correlation_id: this.correlationId,
      ...errorContext,
      ...context
    });
    writeLog(entry);
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  debug(message, context = {}) {
    const entry = formatLogEntry(LOG_LEVELS.DEBUG, message, {
      component: this.component,
      correlation_id: this.correlationId,
      ...context
    });
    writeLog(entry);
  }

  /**
   * Log authentication event
   * @param {string} event - Event type (login_attempt, login_success, login_failure, etc.)
   * @param {Object} details - Event details
   */
  logAuth(event, details = {}) {
    this.info(`Authentication: ${event}`, {
      event_type: 'authentication',
      auth_event: event,
      ...details
    });
  }

  /**
   * Log authorization event
   * @param {string} event - Event type (token_validation, scope_check, etc.)
   * @param {Object} details - Event details
   */
  logAuthz(event, details = {}) {
    this.info(`Authorization: ${event}`, {
      event_type: 'authorization',
      authz_event: event,
      ...details
    });
  }

  /**
   * Log consent event
   * @param {string} event - Event type (consent_requested, consent_granted, etc.)
   * @param {Object} details - Event details
   */
  logConsent(event, details = {}) {
    this.info(`Consent: ${event}`, {
      event_type: 'consent',
      consent_event: event,
      ...details
    });
  }

  /**
   * Log API call with latency
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {number} statusCode - HTTP status code
   * @param {number} latencyMs - Latency in milliseconds
   * @param {Object} details - Additional details
   */
  logApiCall(method, endpoint, statusCode, latencyMs, details = {}) {
    const level = statusCode >= 500 ? LOG_LEVELS.ERROR : 
                  statusCode >= 400 ? LOG_LEVELS.WARN : 
                  LOG_LEVELS.INFO;

    const entry = formatLogEntry(level, `API Call: ${method} ${endpoint}`, {
      component: this.component,
      correlation_id: this.correlationId,
      event_type: 'api_call',
      method,
      endpoint,
      status_code: statusCode,
      latency_ms: latencyMs,
      ...details
    });
    writeLog(entry);
  }

  /**
   * Start timing an operation
   * @returns {Function} Function to call when operation completes
   */
  startTimer() {
    const startTime = Date.now();
    return () => Date.now() - startTime;
  }
}

/**
 * Create logger instance
 * @param {string} component - Component name
 * @param {string} correlationId - Optional correlation ID
 * @returns {Logger} Logger instance
 */
function createLogger(component, correlationId = null) {
  return new Logger(component, correlationId);
}

/**
 * Express middleware to add correlation ID and logger to request
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function correlationMiddleware(req, res, next) {
  // Check for existing correlation ID in headers
  const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
  
  // Attach to request
  req.correlationId = correlationId;
  req.logger = new Logger('http', correlationId);
  
  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);
  
  // Log incoming request
  req.logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection?.remoteAddress,
    user_agent: req.headers['user-agent']
  });
  
  // Track request timing
  const endTimer = req.logger.startTimer();
  
  // Intercept response to log completion
  const originalSend = res.send;
  res.send = function(data) {
    const latency = endTimer();
    req.logger.logApiCall(
      req.method,
      req.path,
      res.statusCode,
      latency,
      {
        client_id: req.oauth_token?.client_id,
        customer_id: req.oauth_token?.customer_id
      }
    );
    return originalSend.call(this, data);
  };
  
  next();
}

module.exports = {
  Logger,
  createLogger,
  correlationMiddleware,
  generateCorrelationId,
  redactSensitiveData,
  LOG_LEVELS
};

// Made with Bob