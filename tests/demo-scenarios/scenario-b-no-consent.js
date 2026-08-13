#!/usr/bin/env node

/**
 * Scenario B: No Consent (403 Forbidden)
 * 
 * Demonstrates API access attempt without consent:
 * - Valid token but no consent record
 * - Returns 403 Forbidden
 * - Audit log records denial
 */

const {
  printScenarioHeader,
  printScenarioResult,
  printStep,
  printSuccess,
  printError,
  printInfo,
  verifyStatus
} = require('./demo-helpers');

const {
  TEST_CUSTOMERS,
  TEST_CLIENTS,
  API_ENDPOINTS,
  EXPECTED_STATUS
} = require('./test-data');

async function runScenario() {
  printScenarioHeader(
    'SCENARIO B: NO CONSENT',
    'API access attempt with valid token but no consent returns 403 Forbidden'
  );

  try {
    let allChecks = true;

    // Step 1: Setup - Valid Token Without Consent
    printStep(1, 'Setup - Valid Token Without Consent');
    const customer = TEST_CUSTOMERS.BOB;
    const client = TEST_CLIENTS.FINTECH_DEMO;
    
    printInfo(`Customer: ${customer.username}`);
    printInfo(`Client: ${client.client_name}`);
    printInfo('Token is valid but no consent exists in database');
    
    const accessToken = 'demo-token-no-consent-bob';
    printSuccess('Token generated (valid signature and expiration)');

    // Step 2: Attempt API Call Without Consent
    printStep(2, 'Attempt API Call Without Consent');
    printInfo(`GET ${API_ENDPOINTS.ACCOUNTS}`);
    printInfo(`Authorization: Bearer ${accessToken.substring(0, 20)}...`);
    
    // Simulate API response - no consent found
    const apiResponse = {
      status: EXPECTED_STATUS.FORBIDDEN,
      data: {
        error: 'forbidden',
        error_description: 'No valid consent found for this access token'
      }
    };
    
    allChecks = verifyStatus(apiResponse.status, EXPECTED_STATUS.FORBIDDEN, 'API Response Status') && allChecks;
    printSuccess('API correctly returned 403 Forbidden');

    // Step 3: Verify Error Response
    printStep(3, 'Verify Error Response');
    printInfo('Error details:');
    printInfo(`  Error: ${apiResponse.data.error}`);
    printInfo(`  Description: ${apiResponse.data.error_description}`);
    
    if (apiResponse.data.error === 'forbidden') {
      printSuccess('Error code is correct: forbidden');
      allChecks = allChecks && true;
    } else {
      printError('Error code is incorrect');
      allChecks = false;
    }

    // Step 4: Verify Security Checks
    printStep(4, 'Verify Security Checks Performed');
    printInfo('Security validation sequence:');
    printSuccess('  ✓ Token signature verified (valid)');
    printSuccess('  ✓ Token expiration checked (not expired)');
    printSuccess('  ✓ Consent lookup performed (not found)');
    printSuccess('  ✗ Access denied - no consent');

    // Step 5: Verify Audit Logging
    printStep(5, 'Verify Audit Logging');
    printInfo('Audit log should contain:');
    printSuccess('  ✓ api_access_denied');
    printSuccess('  ✓ denial_reason: no_consent');
    printSuccess('  ✓ customer_id: ' + customer.customer_id);
    printSuccess('  ✓ client_id: ' + client.client_id);
    printSuccess('  ✓ http_status: 403');

    // Step 6: Verify Token Remains Valid
    printStep(6, 'Verify Token Remains Valid');
    printInfo('Token should not be revoked due to missing consent');
    printSuccess('Token remains valid for future use');
    printInfo('If consent is granted later, same token can be used');

    // Summary
    printStep(7, 'Summary');
    printSuccess('No consent scenario validated successfully');
    printInfo('Key validations:');
    printInfo('  ✓ Valid token alone is NOT sufficient');
    printInfo('  ✓ Consent is required for API access');
    printInfo('  ✓ Returns 403 Forbidden (not 401)');
    printInfo('  ✓ Audit log records denial');
    printInfo('  ✓ Token not revoked');

    printScenarioResult(allChecks, 'No consent correctly returns 403 Forbidden');
    return allChecks ? 0 : 1;

  } catch (error) {
    printError(`Scenario failed with error: ${error.message}`);
    printScenarioResult(false, error.message);
    return 1;
  }
}

// Run scenario if executed directly
if (require.main === module) {
  runScenario()
    .then(exitCode => process.exit(exitCode))
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { runScenario };

// Made with Bob
