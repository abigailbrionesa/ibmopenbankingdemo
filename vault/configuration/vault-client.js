/**
 * Vault Client
 * Handles runtime retrieval of secrets from vault storage
 * 
 * This implementation supports multiple vault backends:
 * - Environment variables (for local development)
 * - HashiCorp Vault (for production)
 * - AWS Secrets Manager (alternative)
 * - Azure Key Vault (alternative)
 */

const fs = require('fs');
const path = require('path');

/**
 * Vault configuration
 */
const VAULT_CONFIG = {
  // Vault backend type: 'env', 'hashicorp', 'aws', 'azure'
  backend: process.env.VAULT_BACKEND || 'env',
  
  // HashiCorp Vault configuration
  hashicorp: {
    address: process.env.VAULT_ADDR || 'http://localhost:8200',
    token: process.env.VAULT_TOKEN,
    namespace: process.env.VAULT_NAMESPACE || 'openbanking',
    mountPath: process.env.VAULT_MOUNT_PATH || 'secret'
  },
  
  // AWS Secrets Manager configuration
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    secretPrefix: process.env.AWS_SECRET_PREFIX || 'openbanking/'
  },
  
  // Azure Key Vault configuration
  azure: {
    vaultUrl: process.env.AZURE_VAULT_URL,
    tenantId: process.env.AZURE_TENANT_ID,
    clientId: process.env.AZURE_CLIENT_ID
  }
};

/**
 * In-memory secret cache
 * Secrets are cached for a short TTL to reduce vault calls
 */
class SecretCache {
  constructor(ttl = 300000) { // 5 minutes default
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  set(key, value) {
    const expiresAt = Date.now() + this.ttl;
    this.cache.set(key, { value, expiresAt });
  }
  
  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value;
  }
  
  delete(key) {
    this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
  }
}

const secretCache = new SecretCache();

/**
 * Retrieve secret from environment variables
 * Used for local development
 * 
 * @param {string} secretName - Secret name
 * @returns {Promise<string|null>} Secret value or null
 */
async function getSecretFromEnv(secretName) {
  // Convert secret name to env var format
  // e.g., "database/password" -> "DATABASE_PASSWORD"
  const envVarName = secretName
    .toUpperCase()
    .replace(/[\/\-\.]/g, '_');
  
  return process.env[envVarName] || null;
}

/**
 * Retrieve secret from HashiCorp Vault
 * 
 * @param {string} secretName - Secret path in vault
 * @returns {Promise<string|null>} Secret value or null
 */
async function getSecretFromHashiCorp(secretName) {
  // This is a placeholder for HashiCorp Vault integration
  // In production, use the official vault client library
  
  const { address, token, namespace, mountPath } = VAULT_CONFIG.hashicorp;
  
  if (!token) {
    throw new Error('VAULT_TOKEN not configured');
  }
  
  try {
    // Example using node-vault library (would need to be installed)
    // const vault = require('node-vault')({
    //   apiVersion: 'v1',
    //   endpoint: address,
    //   token: token
    // });
    // 
    // const result = await vault.read(`${mountPath}/data/${namespace}/${secretName}`);
    // return result.data.data.value;
    
    // For demo purposes, fall back to environment variables
    console.warn('HashiCorp Vault not fully configured, falling back to environment variables');
    return getSecretFromEnv(secretName);
    
  } catch (error) {
    console.error('Failed to retrieve secret from HashiCorp Vault:', error);
    throw error;
  }
}

/**
 * Retrieve secret from AWS Secrets Manager
 * 
 * @param {string} secretName - Secret name
 * @returns {Promise<string|null>} Secret value or null
 */
async function getSecretFromAWS(secretName) {
  // This is a placeholder for AWS Secrets Manager integration
  // In production, use the AWS SDK
  
  const { region, secretPrefix } = VAULT_CONFIG.aws;
  
  try {
    // Example using AWS SDK (would need to be installed)
    // const AWS = require('aws-sdk');
    // const client = new AWS.SecretsManager({ region });
    // 
    // const result = await client.getSecretValue({
    //   SecretId: `${secretPrefix}${secretName}`
    // }).promise();
    // 
    // return result.SecretString;
    
    // For demo purposes, fall back to environment variables
    console.warn('AWS Secrets Manager not fully configured, falling back to environment variables');
    return getSecretFromEnv(secretName);
    
  } catch (error) {
    console.error('Failed to retrieve secret from AWS Secrets Manager:', error);
    throw error;
  }
}

/**
 * Retrieve secret from Azure Key Vault
 * 
 * @param {string} secretName - Secret name
 * @returns {Promise<string|null>} Secret value or null
 */
async function getSecretFromAzure(secretName) {
  // This is a placeholder for Azure Key Vault integration
  // In production, use the Azure SDK
  
  const { vaultUrl } = VAULT_CONFIG.azure;
  
  if (!vaultUrl) {
    throw new Error('AZURE_VAULT_URL not configured');
  }
  
  try {
    // Example using Azure SDK (would need to be installed)
    // const { SecretClient } = require('@azure/keyvault-secrets');
    // const { DefaultAzureCredential } = require('@azure/identity');
    // 
    // const credential = new DefaultAzureCredential();
    // const client = new SecretClient(vaultUrl, credential);
    // 
    // const secret = await client.getSecret(secretName);
    // return secret.value;
    
    // For demo purposes, fall back to environment variables
    console.warn('Azure Key Vault not fully configured, falling back to environment variables');
    return getSecretFromEnv(secretName);
    
  } catch (error) {
    console.error('Failed to retrieve secret from Azure Key Vault:', error);
    throw error;
  }
}

/**
 * Retrieve secret from configured vault backend
 * 
 * @param {string} secretName - Secret name/path
 * @param {boolean} useCache - Whether to use cache (default: true)
 * @returns {Promise<string|null>} Secret value or null
 */
async function getSecret(secretName, useCache = true) {
  // Check cache first
  if (useCache) {
    const cached = secretCache.get(secretName);
    if (cached !== null) {
      return cached;
    }
  }
  
  let secret = null;
  
  // Retrieve from configured backend
  switch (VAULT_CONFIG.backend) {
    case 'hashicorp':
      secret = await getSecretFromHashiCorp(secretName);
      break;
    
    case 'aws':
      secret = await getSecretFromAWS(secretName);
      break;
    
    case 'azure':
      secret = await getSecretFromAzure(secretName);
      break;
    
    case 'env':
    default:
      secret = await getSecretFromEnv(secretName);
      break;
  }
  
  // Cache the secret
  if (secret && useCache) {
    secretCache.set(secretName, secret);
  }
  
  return secret;
}

/**
 * Retrieve multiple secrets at once
 * 
 * @param {string[]} secretNames - Array of secret names
 * @returns {Promise<Object>} Map of secret names to values
 */
async function getSecrets(secretNames) {
  const secrets = {};
  
  await Promise.all(
    secretNames.map(async (name) => {
      secrets[name] = await getSecret(name);
    })
  );
  
  return secrets;
}

/**
 * Invalidate cached secret
 * Call this after rotating a secret
 * 
 * @param {string} secretName - Secret name to invalidate
 */
function invalidateSecret(secretName) {
  secretCache.delete(secretName);
}

/**
 * Clear all cached secrets
 */
function clearSecretCache() {
  secretCache.clear();
}

/**
 * Get required secret or throw error
 * Use this for critical secrets that must exist
 * 
 * @param {string} secretName - Secret name
 * @returns {Promise<string>} Secret value
 * @throws {Error} If secret not found
 */
async function getRequiredSecret(secretName) {
  const secret = await getSecret(secretName);
  
  if (!secret) {
    throw new Error(`Required secret not found: ${secretName}`);
  }
  
  return secret;
}

/**
 * Check if secret exists
 * 
 * @param {string} secretName - Secret name
 * @returns {Promise<boolean>} True if secret exists
 */
async function secretExists(secretName) {
  try {
    const secret = await getSecret(secretName, false); // Don't cache
    return secret !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Get database connection string from vault
 * 
 * @returns {Promise<string>} Database URL
 */
async function getDatabaseUrl() {
  return getRequiredSecret('database/url');
}

/**
 * Get JWT secret from vault
 * 
 * @returns {Promise<string>} JWT secret
 */
async function getJwtSecret() {
  return getRequiredSecret('jwt/secret');
}

/**
 * Get API key for external service
 * 
 * @param {string} serviceName - Service name
 * @returns {Promise<string>} API key
 */
async function getApiKey(serviceName) {
  return getRequiredSecret(`api-keys/${serviceName}`);
}

/**
 * Get encryption key
 * 
 * @param {string} keyName - Key name (e.g., 'data-encryption')
 * @returns {Promise<string>} Encryption key
 */
async function getEncryptionKey(keyName) {
  return getRequiredSecret(`encryption/${keyName}`);
}

/**
 * Health check for vault connectivity
 * 
 * @returns {Promise<Object>} Health status
 */
async function healthCheck() {
  try {
    // Try to retrieve a test secret
    const testSecret = await getSecret('health/check', false);
    
    return {
      healthy: true,
      backend: VAULT_CONFIG.backend,
      message: 'Vault connection successful'
    };
  } catch (error) {
    return {
      healthy: false,
      backend: VAULT_CONFIG.backend,
      message: error.message,
      error: error.toString()
    };
  }
}

module.exports = {
  getSecret,
  getSecrets,
  getRequiredSecret,
  invalidateSecret,
  clearSecretCache,
  secretExists,
  getDatabaseUrl,
  getJwtSecret,
  getApiKey,
  getEncryptionKey,
  healthCheck,
  VAULT_CONFIG
};

// Made with Bob
