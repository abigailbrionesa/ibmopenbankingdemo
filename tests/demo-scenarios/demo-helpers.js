/**
 * Demo Helper Functions
 * Utility functions for making API calls and verifying results
 */

const axios = require('axios');
const chalk = require('chalk');

/**
 * Colors for console output
 */
const colors = {
  success: chalk.green,
  error: chalk.red,
  info: chalk.blue,
  warning: chalk.yellow,
  step: chalk.cyan,
  data: chalk.gray
};

/**
 * Print a step header
 */
function printStep(stepNumber, description) {
  console.log('\n' + colors.step(`━━━ Step ${stepNumber}: ${description} ━━━`));
}

/**
 * Print success message
 */
function printSuccess(message) {
  console.log(colors.success(`✓ ${message}`));
}

/**
 * Print error message
 */
function printError(message) {
  console.log(colors.error(`✗ ${message}`));
}

/**
 * Print info message
 */
function printInfo(message) {
  console.log(colors.info(`ℹ ${message}`));
}

/**
 * Print warning message
 */
function printWarning(message) {
  console.log(colors.warning(`⚠ ${message}`));
}

/**
 * Print data in a formatted way
 */
function printData(label, data) {
  console.log(colors.data(`  ${label}:`), JSON.stringify(data, null, 2));
}

/**
 * Make HTTP request with detailed logging
 */
async function makeRequest(method, url, options = {}) {
  const { headers = {}, data = null, params = null, expectedStatus = 200 } = options;
  
  printInfo(`${method.toUpperCase()} ${url}`);
  
  if (headers && Object.keys(headers).length > 0) {
    printData('Headers', headers);
  }
  
  if (data) {
    printData('Request Body', data);
  }
  
  if (params) {
    printData('Query Params', params);
  }
  
  try {
    const response = await axios({
      method,
      url,
      headers,
      data,
      params,
      validateStatus: () => true // Don't throw on any status
    });
    
    const statusColor = response.status === expectedStatus ? colors.success : colors.error;
    console.log(statusColor(`  Status: ${response.status} ${response.statusText}`));
    
    if (response.data) {
      printData('Response', response.data);
    }
    
    return {
      success: response.status === expectedStatus,
      status: response.status,
      data: response.data,
      headers: response.headers
    };
  } catch (error) {
    printError(`Request failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Register OAuth client
 */
async function registerClient(clientData) {
  printStep('Client Registration', 'Registering OAuth client');
  
  const response = await makeRequest('POST', 'http://localhost:8080/oauth/register', {
    data: clientData,
    expectedStatus: 201
  });
  
  if (response.success) {
    printSuccess('Client registered successfully');
    return response.data;
  } else {
    printError('Client registration failed');
    throw new Error('Client registration failed');
  }
}

/**
 * Authenticate customer
 */
async function authenticateCustomer(username, password) {
  printStep('Customer Authentication', 'Authenticating customer');
  
  const response = await makeRequest('POST', 'http://localhost:3001/auth/login', {
    data: { username, password },
    expectedStatus: 200
  });
  
  if (response.success) {
    printSuccess('Customer authenticated successfully');
    return response.data;
  } else {
    printError('Customer authentication failed');
    throw new Error('Customer authentication failed');
  }
}

/**
 * Initiate OAuth authorization
 */
async function initiateAuthorization(clientId, redirectUri, scope, state) {
  printStep('Authorization Request', 'Initiating OAuth authorization');
  
  const params = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scope,
    state: state
  };
  
  const response = await makeRequest('GET', 'http://localhost:8080/oauth/authorize', {
    params,
    expectedStatus: 302
  });
  
  if (response.success || response.status === 302) {
    printSuccess('Authorization initiated');
    return response.data;
  } else {
    printError('Authorization initiation failed');
    throw new Error('Authorization initiation failed');
  }
}

/**
 * Approve consent
 */
async function approveConsent(sessionToken, clientId, scope) {
  printStep('Consent Approval', 'Customer approving consent');
  
  const response = await makeRequest('POST', 'http://localhost:3001/consent/approve', {
    headers: {
      'Authorization': `Bearer ${sessionToken}`
    },
    data: {
      client_id: clientId,
      scope: scope,
      approved: true
    },
    expectedStatus: 200
  });
  
  if (response.success) {
    printSuccess('Consent approved successfully');
    return response.data;
  } else {
    printError('Consent approval failed');
    throw new Error('Consent approval failed');
  }
}

/**
 * Exchange authorization code for token
 */
async function exchangeCodeForToken(code, clientId, clientSecret, redirectUri) {
  printStep('Token Exchange', 'Exchanging authorization code for access token');
  
  const response = await makeRequest('POST', 'http://localhost:8080/oauth/token', {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    data: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    }).toString(),
    expectedStatus: 200
  });
  
  if (response.success) {
    printSuccess('Token obtained successfully');
    return response.data;
  } else {
    printError('Token exchange failed');
    throw new Error('Token exchange failed');
  }
}

/**
 * Call Banking API
 */
async function callBankingAPI(endpoint, accessToken, expectedStatus = 200) {
  printStep('API Call', `Calling ${endpoint}`);
  
  const response = await makeRequest('GET', endpoint, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    expectedStatus
  });
  
  return response;
}

/**
 * Revoke consent
 */
async function revokeConsent(consentId, sessionToken) {
  printStep('Consent Revocation', 'Revoking customer consent');
  
  const response = await makeRequest('POST', `http://localhost:3001/consent/${consentId}/revoke`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`
    },
    expectedStatus: 200
  });
  
  if (response.success) {
    printSuccess('Consent revoked successfully');
    return response.data;
  } else {
    printError('Consent revocation failed');
    throw new Error('Consent revocation failed');
  }
}

/**
 * Verify audit log entry
 */
async function verifyAuditLog(filters) {
  printStep('Audit Verification', 'Checking audit logs');
  
  const response = await makeRequest('GET', 'http://localhost:8080/admin/audit-logs', {
    params: filters,
    expectedStatus: 200
  });
  
  if (response.success && response.data.logs && response.data.logs.length > 0) {
    printSuccess(`Found ${response.data.logs.length} audit log entries`);
    return response.data.logs;
  } else {
    printWarning('No audit log entries found');
    return [];
  }
}

/**
 * Wait for a specified duration
 */
async function wait(seconds, message = null) {
  if (message) {
    printInfo(message);
  }
  printInfo(`Waiting ${seconds} seconds...`);
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Print scenario header
 */
function printScenarioHeader(scenarioName, description) {
  console.log('\n' + '='.repeat(80));
  console.log(colors.step.bold(`  ${scenarioName}`));
  console.log(colors.info(`  ${description}`));
  console.log('='.repeat(80));
}

/**
 * Print scenario result
 */
function printScenarioResult(success, message) {
  console.log('\n' + '─'.repeat(80));
  if (success) {
    console.log(colors.success.bold(`  ✓ SCENARIO PASSED: ${message}`));
  } else {
    console.log(colors.error.bold(`  ✗ SCENARIO FAILED: ${message}`));
  }
  console.log('─'.repeat(80) + '\n');
}

/**
 * Verify response status
 */
function verifyStatus(actual, expected, description) {
  if (actual === expected) {
    printSuccess(`${description}: ${actual} (expected ${expected})`);
    return true;
  } else {
    printError(`${description}: ${actual} (expected ${expected})`);
    return false;
  }
}

/**
 * Verify response contains field
 */
function verifyField(response, fieldPath, description) {
  const fields = fieldPath.split('.');
  let value = response;
  
  for (const field of fields) {
    if (value && typeof value === 'object' && field in value) {
      value = value[field];
    } else {
      printError(`${description}: Field '${fieldPath}' not found`);
      return false;
    }
  }
  
  printSuccess(`${description}: Field '${fieldPath}' exists`);
  return true;
}

module.exports = {
  colors,
  printStep,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  printData,
  makeRequest,
  registerClient,
  authenticateCustomer,
  initiateAuthorization,
  approveConsent,
  exchangeCodeForToken,
  callBankingAPI,
  revokeConsent,
  verifyAuditLog,
  wait,
  printScenarioHeader,
  printScenarioResult,
  verifyStatus,
  verifyField
};

// Made with Bob
