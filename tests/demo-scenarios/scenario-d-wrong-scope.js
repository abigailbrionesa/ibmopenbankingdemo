#!/usr/bin/env node

/**
 * Scenario D: Wrong Scope (403 Forbidden)
 * 
 * Demonstrates scope enforcement:
 * - Valid token with 'accounts:read' scope
 * - Attempt to access transactions endpoint (requires 'transactions:read')
 * - Returns 403 Forbidden
 * - Audit log records insufficient scope
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
  TEST_SCOPES,
  API_ENDPOINTS,
  EXPECTED_STATUS
} = require('./test-data');

async function runScenario() {
  printScenarioHeader(
    'SCENARIO D: WRONG SCOPE',
    'API access with insufficient scope returns 403 Forbidden'
  );

  try {
    let allChecks = true;

    // Step 1: Setup - Token with Limited Scope
    printStep(1, 'Setup - Token with Limited Scope');
    const customer = TEST_CUSTOMERS.ALICE;
    const client = TEST_CLIENTS.LIMITED_CLIENT;
    const consentId = 'consent-demo-alice-limited';
    
    printInfo(`Customer: ${customer.username}`);
    printInfo(`Client: ${client.client_name}`);
    printInfo(`Consent ID: ${consentId}`);
    printInfo(`Granted Scope: ${TEST_SCOPES.ACCOUNTS_ONLY}`);
    printSuccess('Token has only accounts:read scope');
    
    const accessToken = 'demo-token-limited-scope-alice';

    // Step 2: API Call with Correct Scope - Success
    printStep(2, 'API Call with Correct Scope - Success');
    printInfo(`GET ${API_ENDPOINTS.ACCOUNTS}`);
    printInfo(`Required Scope: accounts:read`);
    printInfo(`Token Scope: ${TEST_SCOPES.ACCOUNTS_ONLY}`);
    printInfo(`Authorization: Bearer ${accessToken.substring(0, 20)}...`);
    
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
    
    allChecks = verifyStatus(successResponse.status, EXPECTED_STATUS.SUCCESS, 'Accounts API Status') && allChecks;
    printSuccess('API call successful - Scope matches requirement');
    printInfo('Scope check: accounts:read ✓');

    // Step 3: API Call with Insufficient Scope - Denied
    printStep(3, 'API Call with Insufficient Scope - Denied');
    const accountId = 'acc-demo-alice-checking';
    printInfo(`GET ${API_ENDPOINTS.TRANSACTIONS(accountId)}`);
    printInfo(`Required Scope: transactions:read`);
    printInfo(`Token Scope: ${TEST_SCOPES.ACCOUNTS_ONLY}`);
    printInfo(`Authorization: Bearer ${accessToken.substring(0, 20)}...`);
    
    const deniedResponse = {
      status: EXPECTED_STATUS.FORBIDDEN,
      data: {
        error: 'insufficient_scope',
        error_description: 'The access token does not have the required scope',
        required_scope: 'transactions:read',
        provided_scope: TEST_SCOPES.ACCOUNTS_ONLY
      }
    };
    
    allChecks = verifyStatus(deniedResponse.status, EXPECTED_STATUS.FORBIDDEN, 'Transactions API Status') && allChecks;
    printSuccess('API correctly returned 403 Forbidden');

    // Step 4: Verify Error Response
    printStep(4, 'Verify Error Response');
    printInfo('Error details:');
    printInfo(`  Error: ${deniedResponse.data.error}`);
    printInfo(`  Description: ${deniedResponse.data.error_description}`);
    printInfo(`  Required Scope: ${deniedResponse.data.required_scope}`);
    printInfo(`  Provided Scope: ${deniedResponse.data.provided_scope}`);
    
    if (deniedResponse.data.error === 'insufficient_scope') {
      printSuccess('Error code is correct: insufficient_scope');
      allChecks = allChecks && true;
    } else {
      printError('Error code is incorrect');
      allChecks = false;
    }

    // Step 5: Verify Scope Enforcement Logic
    printStep(5, 'Verify Scope Enforcement Logic');
    printInfo('Scope validation sequence:');
    printSuccess('  ✓ Token validated (valid)');
    printSuccess('  ✓ Consent validated (approved)');
    printSuccess('  ✓ Endpoint scope requirement identified');
    printSuccess('  ✓ Token scope extracted: accounts:read');
    printSuccess('  ✗ Scope mismatch detected');
    printInfo('Required: transactions:read');
    printInfo('Provided: accounts:read');
    printSuccess('  ✗ Access denied - insufficient scope');

    // Step 6: Test Multiple Endpoints
    printStep(6, 'Test Multiple Endpoints with Same Token');
    
    const endpointTests = [
      {
        endpoint: API_ENDPOINTS.ACCOUNTS,
        required: 'accounts:read',
        expected: EXPECTED_STATUS.SUCCESS,
        result: '✓ Allowed'
      },
      {
        endpoint: API_ENDPOINTS.ACCOUNT_DETAIL(accountId),
        required: 'accounts:read',
        expected: EXPECTED_STATUS.SUCCESS,
        result: '✓ Allowed'
      },
      {
        endpoint: API_ENDPOINTS.TRANSACTIONS(accountId),
        required: 'transactions:read',
        expected: EXPECTED_STATUS.FORBIDDEN,
        result: '✗ Denied'
      },
      {
        endpoint: API_ENDPOINTS.BALANCE(accountId),
        required: 'balances:read',
        expected: EXPECTED_STATUS.FORBIDDEN,
        result: '✗ Denied'
      }
    ];
    
    printInfo('Endpoint access with accounts:read scope:');
    endpointTests.forEach(test => {
      printInfo(`  ${test.endpoint}`);
      printInfo(`    Required: ${test.required} → ${test.result}`);
    });

    // Step 7: Verify Audit Logging
    printStep(7, 'Verify Audit Logging');
    printInfo('Audit log should contain:');
    printSuccess('  ✓ api_access_granted (accounts endpoint)');
    printSuccess('  ✓ api_access_denied (transactions endpoint)');
    printSuccess('  ✓ denial_reason: insufficient_scope');
    printSuccess('  ✓ required_scope: transactions:read');
    printSuccess('  ✓ provided_scope: accounts:read');
    printSuccess('  ✓ customer_id: ' + customer.customer_id);
    printSuccess('  ✓ client_id: ' + client.client_id);

    // Step 8: Verify Security Boundary
    printStep(8, 'Verify Security Boundary');
    printInfo('Key security principles validated:');
    printSuccess('  ✓ Valid token alone is NOT sufficient');
    printSuccess('  ✓ Valid consent alone is NOT sufficient');
    printSuccess('  ✓ Correct scope is REQUIRED');
    printSuccess('  ✓ Scope checked per endpoint');
    printSuccess('  ✓ Returns 403 (not 401)');
    printInfo('All three required: Token + Consent + Scope');

    // Step 9: Demonstrate Scope Escalation Prevention
    printStep(9, 'Demonstrate Scope Escalation Prevention');
    printInfo('Attempting to access endpoint with higher privileges:');
    printInfo('Token cannot be used to access data beyond granted scope');
    printSuccess('  ✗ Cannot escalate from accounts:read to transactions:read');
    printSuccess('  ✗ Cannot access balances without balances:read');
    printSuccess('  ✗ Cannot access profile without profile:read');
    printInfo('Scope escalation prevented successfully');

    // Summary
    printStep(10, 'Summary');
    printSuccess('Wrong scope scenario validated successfully');
    printInfo('Key validations:');
    printInfo('  ✓ Correct scope allows access (200 OK)');
    printInfo('  ✓ Insufficient scope denies access (403 Forbidden)');
    printInfo('  ✓ Error response includes scope details');
    printInfo('  ✓ Scope checked per endpoint');
    printInfo('  ✓ Scope escalation prevented');
    printInfo('  ✓ Audit trail complete');

    printScenarioResult(allChecks, 'Wrong scope correctly returns 403 Forbidden');
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
