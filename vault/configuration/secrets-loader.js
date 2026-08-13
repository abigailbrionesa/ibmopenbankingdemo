/**
 * Secrets Loader
 * Loads secrets at runtime and injects them into application configuration
 * 
 * This module ensures that:
 * 1. No secrets are hardcoded in source code
 * 2. Secrets are loaded from vault at startup
 * 3. Missing secrets cause application to fail closed
 * 4. Secrets are never exposed in logs or error messages
 */

const vaultClient = require('./vault-client');

/**
 * Required secrets for the application
 * Add new secrets here as needed
 */
const REQUIRED_SECRETS = {
  // Database credentials
  DATABASE_URL: 'database/url',
  
  // JWT signing
  JWT_SECRET: 'jwt/secret',
  
  // Encryption keys
  DATA_ENCRYPTION_KEY: 'encryption/data-encryption',
  
  // External API keys (if needed)
  // EXTERNAL_API_KEY: 'api-keys/external-service'
};

/**
 * Optional secrets (won't fail if missing)
 */
const OPTIONAL_SECRETS = {
  // Monitoring/observability
  SENTRY_DSN: 'monitoring/sentry-dsn',
  DATADOG_API_KEY: 'monitoring/datadog-api-key'
};

/**
 * Loaded secrets storage
 * Never log or expose these values
 */
let loadedSecrets = {};

/**
 * Load all required secrets from vault
 * Application will fail to start if any required secret is missing
 * 
 * @returns {Promise<Object>} Loaded secrets
 * @throws {Error} If any required secret is missing
 */
async function loadSecrets() {
  console.log('Loading secrets from vault...');
  
  const secrets = {};
  const errors = [];
  
  // Load required secrets
  for (const [key, secretPath] of Object.entries(REQUIRED_SECRETS)) {
    try {
      const value = await vaultClient.getRequiredSecret(secretPath);
      secrets[key] = value;
      console.log(`✓ Loaded required secret: ${key}`);
    } catch (error) {
      errors.push(`Failed to load required secret ${key}: ${error.message}`);
      console.error(`✗ Failed to load required secret: ${key}`);
    }
  }
  
  // Load optional secrets
  for (const [key, secretPath] of Object.entries(OPTIONAL_SECRETS)) {
    try {
      const value = await vaultClient.getSecret(secretPath);
      if (value) {
        secrets[key] = value;
        console.log(`✓ Loaded optional secret: ${key}`);
      } else {
        console.log(`⚠ Optional secret not found: ${key}`);
      }
    } catch (error) {
      console.warn(`⚠ Failed to load optional secret ${key}: ${error.message}`);
    }
  }
  
  // Fail if any required secrets are missing
  if (errors.length > 0) {
    throw new Error(`Failed to load required secrets:\n${errors.join('\n')}`);
  }
  
  loadedSecrets = secrets;
  console.log(`Successfully loaded ${Object.keys(secrets).length} secrets`);
  
  return secrets;
}

/**
 * Get a loaded secret by key
 * 
 * @param {string} key - Secret key
 * @returns {string|null} Secret value or null
 */
function getLoadedSecret(key) {
  return loadedSecrets[key] || null;
}

/**
 * Get database URL from loaded secrets
 * 
 * @returns {string} Database URL
 * @throws {Error} If not loaded
 */
function getDatabaseUrl() {
  const url = getLoadedSecret('DATABASE_URL');
  if (!url) {
    throw new Error('DATABASE_URL not loaded from vault');
  }
  return url;
}

/**
 * Get JWT secret from loaded secrets
 * 
 * @returns {string} JWT secret
 * @throws {Error} If not loaded
 */
function getJwtSecret() {
  const secret = getLoadedSecret('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET not loaded from vault');
  }
  return secret;
}

/**
 * Get encryption key from loaded secrets
 * 
 * @returns {string} Encryption key
 * @throws {Error} If not loaded
 */
function getEncryptionKey() {
  const key = getLoadedSecret('DATA_ENCRYPTION_KEY');
  if (!key) {
    throw new Error('DATA_ENCRYPTION_KEY not loaded from vault');
  }
  return key;
}

/**
 * Reload secrets from vault
 * Call this after rotating secrets
 * 
 * @returns {Promise<Object>} Reloaded secrets
 */
async function reloadSecrets() {
  console.log('Reloading secrets from vault...');
  
  // Clear vault cache
  vaultClient.clearSecretCache();
  
  // Reload all secrets
  return loadSecrets();
}

/**
 * Validate that all required secrets are loaded
 * 
 * @returns {boolean} True if all required secrets are loaded
 */
function validateSecrets() {
  const missingSecrets = [];
  
  for (const key of Object.keys(REQUIRED_SECRETS)) {
    if (!loadedSecrets[key]) {
      missingSecrets.push(key);
    }
  }
  
  if (missingSecrets.length > 0) {
    console.error('Missing required secrets:', missingSecrets);
    return false;
  }
  
  return true;
}

/**
 * Get secrets health status
 * 
 * @returns {Object} Health status
 */
function getSecretsHealth() {
  const requiredCount = Object.keys(REQUIRED_SECRETS).length;
  const loadedCount = Object.keys(loadedSecrets).length;
  const missingRequired = Object.keys(REQUIRED_SECRETS).filter(
    key => !loadedSecrets[key]
  );
  
  return {
    healthy: missingRequired.length === 0,
    required: requiredCount,
    loaded: loadedCount,
    missing: missingRequired
  };
}

/**
 * Sanitize error messages to prevent secret leakage
 * 
 * @param {Error} error - Error object
 * @returns {Error} Sanitized error
 */
function sanitizeError(error) {
  // Remove any potential secret values from error messages
  let message = error.message;
  
  // Replace any loaded secret values with [REDACTED]
  for (const value of Object.values(loadedSecrets)) {
    if (value && message.includes(value)) {
      message = message.replace(new RegExp(value, 'g'), '[REDACTED]');
    }
  }
  
  const sanitized = new Error(message);
  sanitized.name = error.name;
  sanitized.stack = error.stack;
  
  return sanitized;
}

/**
 * Initialize secrets on application startup
 * This should be called before any other initialization
 * 
 * @returns {Promise<void>}
 */
async function initializeSecrets() {
  try {
    await loadSecrets();
    
    if (!validateSecrets()) {
      throw new Error('Secret validation failed');
    }
    
    console.log('✓ Secrets initialized successfully');
  } catch (error) {
    console.error('✗ Failed to initialize secrets:', error.message);
    throw error;
  }
}

module.exports = {
  loadSecrets,
  reloadSecrets,
  getLoadedSecret,
  getDatabaseUrl,
  getJwtSecret,
  getEncryptionKey,
  validateSecrets,
  getSecretsHealth,
  sanitizeError,
  initializeSecrets,
  REQUIRED_SECRETS,
  OPTIONAL_SECRETS
};

// Made with Bob
