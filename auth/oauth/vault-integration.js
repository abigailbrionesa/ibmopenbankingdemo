/**
 * HashiCorp Vault Integration for OAuth Client Secrets
 * Provides secure storage and retrieval of client credentials
 */

const axios = require('axios');

// Vault configuration
const VAULT_ADDR = process.env.VAULT_ADDR || 'http://localhost:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN;
const VAULT_MOUNT_PATH = 'secret';
const VAULT_OAUTH_PATH = 'openbanking/oauth/clients';

/**
 * Store client credentials in Vault
 * @param {string} clientId - Client ID
 * @param {string} clientSecret - Plain text client secret (will be stored securely)
 * @param {Object} metadata - Additional metadata to store
 * @returns {Promise<Object>} Storage result
 */
async function storeClientCredentials(clientId, clientSecret, metadata = {}) {
  if (!VAULT_TOKEN) {
    console.warn('VAULT_TOKEN not configured. Skipping Vault storage.');
    return {
      success: false,
      error: 'Vault not configured',
      stored_in_vault: false
    };
  }
  
  try {
    const path = `${VAULT_MOUNT_PATH}/data/${VAULT_OAUTH_PATH}/${clientId}`;
    
    const data = {
      data: {
        client_id: clientId,
        client_secret: clientSecret,
        created_at: new Date().toISOString(),
        ...metadata
      }
    };
    
    const response = await axios.post(
      `${VAULT_ADDR}/v1/${path}`,
      data,
      {
        headers: {
          'X-Vault-Token': VAULT_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return {
      success: true,
      stored_in_vault: true,
      version: response.data.data.version
    };
  } catch (error) {
    console.error('Vault storage error:', error.message);
    return {
      success: false,
      error: error.message,
      stored_in_vault: false
    };
  }
}

/**
 * Retrieve client credentials from Vault
 * @param {string} clientId - Client ID
 * @returns {Promise<Object>} Retrieved credentials
 */
async function retrieveClientCredentials(clientId) {
  if (!VAULT_TOKEN) {
    return {
      success: false,
      error: 'Vault not configured'
    };
  }
  
  try {
    const path = `${VAULT_MOUNT_PATH}/data/${VAULT_OAUTH_PATH}/${clientId}`;
    
    const response = await axios.get(
      `${VAULT_ADDR}/v1/${path}`,
      {
        headers: {
          'X-Vault-Token': VAULT_TOKEN
        }
      }
    );
    
    return {
      success: true,
      credentials: response.data.data.data
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return {
        success: false,
        error: 'Credentials not found'
      };
    }
    
    console.error('Vault retrieval error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete client credentials from Vault
 * @param {string} clientId - Client ID
 * @returns {Promise<Object>} Deletion result
 */
async function deleteClientCredentials(clientId) {
  if (!VAULT_TOKEN) {
    return {
      success: false,
      error: 'Vault not configured'
    };
  }
  
  try {
    const path = `${VAULT_MOUNT_PATH}/metadata/${VAULT_OAUTH_PATH}/${clientId}`;
    
    await axios.delete(
      `${VAULT_ADDR}/v1/${path}`,
      {
        headers: {
          'X-Vault-Token': VAULT_TOKEN
        }
      }
    );
    
    return {
      success: true,
      deleted: true
    };
  } catch (error) {
    console.error('Vault deletion error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * List all stored client IDs in Vault
 * @returns {Promise<Object>} List of client IDs
 */
async function listStoredClients() {
  if (!VAULT_TOKEN) {
    return {
      success: false,
      error: 'Vault not configured'
    };
  }
  
  try {
    const path = `${VAULT_MOUNT_PATH}/metadata/${VAULT_OAUTH_PATH}`;
    
    const response = await axios.request({
      method: 'LIST',
      url: `${VAULT_ADDR}/v1/${path}`,
      headers: {
        'X-Vault-Token': VAULT_TOKEN
      }
    });
    
    return {
      success: true,
      clients: response.data.data.keys || []
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return {
        success: true,
        clients: []
      };
    }
    
    console.error('Vault list error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Rotate client secret in Vault
 * @param {string} clientId - Client ID
 * @param {string} newClientSecret - New client secret
 * @returns {Promise<Object>} Rotation result
 */
async function rotateClientSecret(clientId, newClientSecret) {
  // Retrieve existing metadata
  const existing = await retrieveClientCredentials(clientId);
  
  if (!existing.success) {
    return existing;
  }
  
  // Store new secret with updated metadata
  const metadata = {
    ...existing.credentials,
    client_secret: newClientSecret,
    rotated_at: new Date().toISOString(),
    previous_rotation: existing.credentials.rotated_at || existing.credentials.created_at
  };
  
  delete metadata.client_id; // Will be added by storeClientCredentials
  
  return storeClientCredentials(clientId, newClientSecret, metadata);
}

module.exports = {
  storeClientCredentials,
  retrieveClientCredentials,
  deleteClientCredentials,
  listStoredClients,
  rotateClientSecret
};

// Made with Bob
