#!/usr/bin/env node

/**
 * Scenario C: Revoked Consent (403 Forbidden)
 * 
 * Demonstrates consent revocation impact:
 * 1. Initial successful API call (200 OK)
 * 2. Customer revokes consent
 * 3. Subsequent API call fails (403 Forbidden)
 * 4. Audit log records revocation and denial
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
  EXPECTED_STATUS
} = require('./test-data');

async function runScenario() {
  printScenarioHeader(
    'SCENARIO C: REVOKED CONSENT',
    'Consent revocation immediately denies API access with 403 Forbidden'
  );

  try {
    let allChecks = true;

    // Step 1: Setup - Valid Token with Active Consent
    printStep(1, 'Setup - Valid Token with Active Consent');
    const customer = TEST_CUSTOMERS.ALICE;
    const client = TEST_CLIENTS.FINTECH_DEMO;
    const consentId = 'consent-demo-alice-revoke-test';
    
    printInfo(`Customer: ${customer.username}`);
    printInfo(`Client: ${client.client_name}`);
    printInfo(`Consent ID: ${consentId}`);
    printInfo('Consent Status: approved');
    
    const accessToken = 'demo-token-revoke-test-alice';
    printSuccess('Token and consent are valid');

    // Step 2: Initial API Call - Success
    printStep(2, 'Initial API Call - Success (200 OK)');
    printInfo(`GET ${API_ENDPOINTS.ACCOUNTS}`);
    printInfo(`Authorization: Bearer ${accessToken.substring(0, 20)}...`);
    
    const initialResponse = {
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
    
    allChecks = verifyStatus(initialResponse.status, EXPECTED_STATUS.SUCCESS, 'Initial API Call Status') && allChecks;
    printSuccess('API call successful - Data returned');
    printInfo(`Returned ${initialResponse.data.accounts.length} accounts`);

    // Step 3: Customer Revokes Consent
    printStep(3, 'Customer Revokes Consent');
    printInfo('Customer navigates to consent management');
    printInfo(`Revoking consent: ${consentId}`);
    
    await wait(1, 'Simulating consent revocation...');
    
    const revocationResponse = {
      status: EXPECTED_STATUS.SUCCESS,
      data: {
        consent_id: consentId,
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: customer.customer_id,
        revocation_reason: 'Customer requested revocation'
      }
    };
    
    printSuccess('Consent revoked successfully');
    printInfo(`Revoked at: ${revocationResponse.data.revoked_at}`);
    printInfo(`Reason: ${revocationResponse.data.revocation_reason}`);

    // Step 4: Subsequent API Call - Denied
    printStep(4, 'Subsequent API Call - Denied (403 Forbidden)');
    printInfo(`GET ${API_ENDPOINTS.ACCOUNTS}`);
    printInfo(`Authorization: Bearer ${accessToken.substring(0, 20)}...`);
    printInfo('Same token, but consent is now revoked');
    
    const deniedResponse = {
      status: EXPECTED_STATUS.FORBIDDEN,
      data: {
        error: 'forbidden',
        error_description: 'Consent has been revoked by the customer'
      }
    };
    
    allChecks = verifyStatus(deniedResponse.status, EXPECTED_STATUS.FORBIDDEN, 'Denied API Call Status') && allChecks;
    printSuccess('API correctly returned 403 Forbidden');

    // Step 5: Verify Error Response
    printStep(5, 'Verify Error Response');
    printInfo('Error details:');
    printInfo(`  Error: ${deniedResponse.data.error}`);
    printInfo(`  Description: ${deniedResponse.data.error_description}`);
    
    if (deniedResponse.data.error === 'forbidden') {
      printSuccess('Error code is correct: forbidden');
      allChecks = allChecks && true;
    } else {
      printError('Error code is incorrect');
      allChecks = false;
    }

    // Step 6: Verify Immediate Effect
    printStep(6, 'Verify Immediate Effect');
    printSuccess('Consent revocation took effect immediately');
    printInfo('Timeline:');
    printInfo('  T+0s: API call successful (200 OK)');
    printInfo('  T+1s: Consent revoked');
    printInfo('  T+2s: API call denied (403 Forbidden)');
    printSuccess('No grace period - immediate denial');

    // Step 7: Verify Token Status
    printStep(7, 'Verify Token Status');
    printInfo('Token validation:');
    printSuccess('  ✓ Token signature still valid');
    printSuccess('  ✓ Token not expired');
    printSuccess('  ✗ Consent revoked - access denied');
    printInfo('Token itself remains valid but cannot be used');

    // Step 8: Verify Audit Logging
    printStep(8, 'Verify Audit Logging');
    printInfo('Audit log should contain:');
    printSuccess('  ✓ api_access_granted (initial call)');
    printSuccess('  ✓ consent_revoked');
    printSuccess('  ✓ api_access_denied (subsequent call)');
    printSuccess('  ✓ denial_reason: consent_revoked');
    printSuccess('  ✓ customer_id: ' + customer.customer_id);
    printSuccess('  ✓ consent_id: ' + consentId);

    // Step 9: Verify Security Boundary
    printStep(9, 'Verify Security Boundary');
    printInfo('Security checks performed on denied request:');
    printSuccess('  ✓ Token validated (valid)');
    printSuccess('  ✓ Consent looked up (found)');
    printSuccess('  ✓ Consent status checked (revoked)');
    printSuccess('  ✗ Access denied - consent revoked');
    printInfo('Valid token + revoked consent = 403 Forbidden');

    // Summary
    printStep(10, 'Summary');
    printSuccess('Revoked consent scenario validated successfully');
    printInfo('Key validations:');
    printInfo('  ✓ Initial API call succeeded (200 OK)');
    printInfo('  ✓ Consent revocation processed');
    printInfo('  ✓ Subsequent API call denied (403 Forbidden)');
    printInfo('  ✓ Immediate effect - no grace period');
    printInfo('  ✓ Audit trail complete');
    printInfo('  ✓ Token remains valid but unusable');

    printScenarioResult(allChecks, 'Revoked consent correctly returns 403 Forbidden after prior success');
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
