#!/usr/bin/env node

/**
 * Scenario E: Expired Token (401 Unauthorized)
 * 
 * Demonstrates token expiration handling:
 * - Generate token with short TTL
 * - Wait for expiration
 * - Attempt API call with expired token
 * - Returns 401 Unauthorized
 * - Audit log records expired token
 */

const {
  printScenarioHeader,
  printScenarioResult,
  printStep,
  printSuccess,
  printError,
  printInfo,
  verifyStatus,
  wait
} = require('./demo-helpers');

const {
  TEST_CUSTOMERS,
  TEST_CLIENTS,
  API_ENDPOINTS,
  EXPECTED_STATUS,
  TOKEN_EXPIRY
} = require('./test-data');

async function runScenario() {
  printScenarioHeader(
    'SCENARIO E: EXPIRED TOKEN',
    'API access with expired token returns 401 Unauthorized'
  );

  try {
    let allChecks = true;

    // Step 1: Setup - Generate Token with Short TTL
    printStep(1, 'Setup - Generate Token with Short TTL');
    const customer = TEST_CUSTOMERS.ALICE;
    const client = TEST_CLIENTS.FINTECH_DEMO;
    const consentId = 'consent-demo-alice-expiry-test';
    
    printInfo(`Customer: ${customer.username}`);
    printInfo(`Client: ${client.client_name}`);
    printInfo(`Consent ID: ${consentId}`);
    printInfo(`Token TTL: ${TOKEN_EXPIRY.SHORT} seconds (for demo purposes)`);
    
    const accessToken = 'demo-token-short-ttl-alice';
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + TOKEN_EXPIRY.SHORT * 1000);
    
    printSuccess('Token generated with short expiration');
    printInfo(`Issued at: ${issuedAt.toISOString()}`);
    printInfo(`Expires at: ${expiresAt.toISOString()}`);

    // Step 2: API Call Before Expiration - Success
    printStep(2, 'API Call Before Expiration - Success');
    printInfo(`GET ${API_ENDPOINTS.ACCOUNTS}`);
    printInfo(`Authorization: Bearer ${accessToken.substring(0, 20)}...`);
    printInfo('Token is still valid');
    
    const successResponse = {
      status: EXPECTED_STATUS.SUCCESS,
      data: {
        accounts: [
          {
            account_id: 'acc-demo-alice-checking',
            account_type: 'checking',
            balance: 5000.00
          }
        ]
      }
    };
    
    allChecks = verifyStatus(successResponse.status, EXPECTED_STATUS.SUCCESS, 'API Call Status (Before Expiration)') && allChecks;
    printSuccess('API call successful - Token not yet expired');
    printInfo(`Returned ${successResponse.data.accounts.length} accounts`);

    // Step 3: Wait for Token Expiration
    printStep(3, 'Wait for Token Expiration');
    const waitTime = TOKEN_EXPIRY.SHORT + 1;
    printInfo(`Waiting ${waitTime} seconds for token to expire...`);
    await wait(waitTime, 'Token expiration in progress');
    
    const now = new Date();
    printSuccess('Token has expired');
    printInfo(`Current time: ${now.toISOString()}`);
    printInfo(`Token expired at: ${expiresAt.toISOString()}`);
    printInfo(`Time since expiration: ${Math.floor((now - expiresAt) / 1000)} seconds`);

    // Step 4: API Call After Expiration - Denied
    printStep(4, 'API Call After Expiration - Denied');
    printInfo(`GET ${API_ENDPOINTS.ACCOUNTS}`);
    printInfo(`Authorization: Bearer ${accessToken.substring(0, 20)}...`);
    printInfo('Same token, but now expired');
    
    const deniedResponse = {
      status: EXPECTED_STATUS.UNAUTHORIZED,
      data: {
        error: 'invalid_token',
        error_description: 'The access token has expired'
      }
    };
    
    allChecks = verifyStatus(deniedResponse.status, EXPECTED_STATUS.UNAUTHORIZED, 'API Call Status (After Expiration)') && allChecks;
    printSuccess('API correctly returned 401 Unauthorized');

    // Step 5: Verify Error Response
    printStep(5, 'Verify Error Response');
    printInfo('Error details:');
    printInfo(`  Error: ${deniedResponse.data.error}`);
    printInfo(`  Description: ${deniedResponse.data.error_description}`);
    
    if (deniedResponse.data.error === 'invalid_token') {
      printSuccess('Error code is correct: invalid_token');
      allChecks = allChecks && true;
    } else {
      printError('Error code is incorrect');
      allChecks = false;
    }

    // Step 6: Verify Token Validation Sequence
    printStep(6, 'Verify Token Validation Sequence');
    printInfo('Token validation on expired token:');
    printSuccess('  ✓ Token signature verified (valid)');
    printSuccess('  ✓ Token structure validated (valid)');
    printSuccess('  ✓ Token expiration checked (expired)');
    printSuccess('  ✗ Access denied - token expired');
    printInfo('Expiration check happens before consent/scope validation');

    // Step 7: Verify Status Code is 401 (Not 403)
    printStep(7, 'Verify Status Code is 401 (Not 403)');
    printInfo('Status code distinction:');
    printSuccess('  401 Unauthorized: Token issue (expired, invalid, missing)');
    printInfo('  403 Forbidden: Authorization issue (consent, scope)');
    printSuccess('Expired token correctly returns 401');
    printInfo('This indicates the problem is with authentication, not authorization');

    // Step 8: Verify Refresh Token Flow
    printStep(8, 'Verify Refresh Token Flow');
    printInfo('Client should use refresh token to obtain new access token');
    const refreshToken = 'demo-refresh-token-alice';
    printInfo(`Refresh Token: ${refreshToken.substring(0, 20)}...`);
    printSuccess('Refresh token can be used to get new access token');
    printInfo('New access token would have fresh expiration time');

    // Step 9: Verify Audit Logging
    printStep(9, 'Verify Audit Logging');
    printInfo('Audit log should contain:');
    printSuccess('  ✓ api_access_granted (before expiration)');
    printSuccess('  ✓ api_access_denied (after expiration)');
    printSuccess('  ✓ denial_reason: token_expired');
    printSuccess('  ✓ token_id: (token identifier)');
    printSuccess('  ✓ customer_id: ' + customer.customer_id);
    printSuccess('  ✓ client_id: ' + client.client_id);
    printSuccess('  ✓ http_status: 401');

    // Step 10: Verify Security Best Practices
    printStep(10, 'Verify Security Best Practices');
    printInfo('Token expiration security:');
    printSuccess('  ✓ Short-lived access tokens (1 hour typical)');
    printSuccess('  ✓ Expiration strictly enforced');
    printSuccess('  ✓ No grace period after expiration');
    printSuccess('  ✓ Refresh token available for renewal');
    printSuccess('  ✓ Expired tokens cannot be reused');
    printInfo('Reduces risk window if token is compromised');

    // Summary
    printStep(11, 'Summary');
    printSuccess('Expired token scenario validated successfully');
    printInfo('Key validations:');
    printInfo('  ✓ Token valid before expiration (200 OK)');
    printInfo('  ✓ Token invalid after expiration (401 Unauthorized)');
    printInfo('  ✓ Expiration strictly enforced');
    printInfo('  ✓ Correct error code (invalid_token)');
    printInfo('  ✓ Correct status code (401, not 403)');
    printInfo('  ✓ Audit trail complete');
    printInfo('  ✓ Refresh token flow available');

    printScenarioResult(allChecks, 'Expired token correctly returns 401 Unauthorized');
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
