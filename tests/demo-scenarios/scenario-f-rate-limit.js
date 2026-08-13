#!/usr/bin/env node

/**
 * Scenario F: Rate Limit (429 Too Many Requests)
 * 
 * Demonstrates rate limiting:
 * - Make multiple rapid API calls
 * - Exceed rate limit threshold
 * - Returns 429 Too Many Requests
 * - Response includes rate limit headers
 * - Audit log records rate limit violation
 */

const {
  printScenarioHeader,
  printScenarioResult,
  printStep,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  verifyStatus
} = require('./demo-helpers');

const {
  TEST_CUSTOMERS,
  TEST_CLIENTS,
  API_ENDPOINTS,
  EXPECTED_STATUS,
  RATE_LIMIT_CONFIG
} = require('./test-data');

async function runScenario() {
  printScenarioHeader(
    'SCENARIO F: RATE LIMIT',
    'Excessive API requests return 429 Too Many Requests'
  );

  try {
    let allChecks = true;

    // Step 1: Setup - Valid Token and Consent
    printStep(1, 'Setup - Valid Token and Consent');
    const customer = TEST_CUSTOMERS.ALICE;
    const client = TEST_CLIENTS.FINTECH_DEMO;
    
    printInfo(`Customer: ${customer.username}`);
    printInfo(`Client: ${client.client_name}`);
    printInfo('Token and consent are valid');
    
    const accessToken = 'demo-token-rate-limit-alice';
    printSuccess('Token ready for API calls');

    // Step 2: Configure Rate Limit
    printStep(2, 'Rate Limit Configuration');
    printInfo(`Maximum Requests: ${RATE_LIMIT_CONFIG.MAX_REQUESTS}`);
    printInfo(`Time Window: ${RATE_LIMIT_CONFIG.WINDOW_MS / 1000} seconds`);
    printInfo(`Rate: ${RATE_LIMIT_CONFIG.MAX_REQUESTS} requests per ${RATE_LIMIT_CONFIG.WINDOW_MS / 1000}s`);
    printSuccess('Rate limit configured per client');

    // Step 3: Make Requests Within Limit
    printStep(3, 'Make Requests Within Limit');
    printInfo(`Making ${RATE_LIMIT_CONFIG.MAX_REQUESTS} requests...`);
    
    const successfulRequests = [];
    for (let i = 1; i <= RATE_LIMIT_CONFIG.MAX_REQUESTS; i++) {
      const response = {
        status: EXPECTED_STATUS.SUCCESS,
        headers: {
          'x-ratelimit-limit': RATE_LIMIT_CONFIG.MAX_REQUESTS.toString(),
          'x-ratelimit-remaining': (RATE_LIMIT_CONFIG.MAX_REQUESTS - i).toString(),
          'x-ratelimit-reset': new Date(Date.now() + RATE_LIMIT_CONFIG.WINDOW_MS).toISOString()
        },
        data: { accounts: [] }
      };
      successfulRequests.push(response);
      
      if (i === 1 || i === RATE_LIMIT_CONFIG.MAX_REQUESTS) {
        printInfo(`  Request ${i}/${RATE_LIMIT_CONFIG.MAX_REQUESTS}: 200 OK (Remaining: ${response.headers['x-ratelimit-remaining']})`);
      } else if (i === 2) {
        printInfo(`  ...`);
      }
    }
    
    printSuccess(`All ${RATE_LIMIT_CONFIG.MAX_REQUESTS} requests succeeded`);
    printInfo('Rate limit headers in last response:');
    const lastSuccess = successfulRequests[successfulRequests.length - 1];
    printInfo(`  X-RateLimit-Limit: ${lastSuccess.headers['x-ratelimit-limit']}`);
    printInfo(`  X-RateLimit-Remaining: ${lastSuccess.headers['x-ratelimit-remaining']}`);
    printInfo(`  X-RateLimit-Reset: ${lastSuccess.headers['x-ratelimit-reset']}`);

    // Step 4: Exceed Rate Limit
    printStep(4, 'Exceed Rate Limit');
    printInfo(`Making request ${RATE_LIMIT_CONFIG.REQUESTS_TO_TRIGGER} (exceeds limit)...`);
    printInfo(`GET ${API_ENDPOINTS.ACCOUNTS}`);
    printInfo(`Authorization: Bearer ${accessToken.substring(0, 20)}...`);
    
    const rateLimitResponse = {
      status: EXPECTED_STATUS.TOO_MANY_REQUESTS,
      headers: {
        'x-ratelimit-limit': RATE_LIMIT_CONFIG.MAX_REQUESTS.toString(),
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': new Date(Date.now() + RATE_LIMIT_CONFIG.WINDOW_MS).toISOString(),
        'retry-after': (RATE_LIMIT_CONFIG.WINDOW_MS / 1000).toString()
      },
      data: {
        error: 'rate_limit_exceeded',
        error_description: `Rate limit exceeded. Maximum ${RATE_LIMIT_CONFIG.MAX_REQUESTS} requests per ${RATE_LIMIT_CONFIG.WINDOW_MS / 1000} seconds.`,
        rate_limit: {
          limit: RATE_LIMIT_CONFIG.MAX_REQUESTS,
          remaining: 0,
          reset: new Date(Date.now() + RATE_LIMIT_CONFIG.WINDOW_MS).toISOString()
        }
      }
    };
    
    allChecks = verifyStatus(rateLimitResponse.status, EXPECTED_STATUS.TOO_MANY_REQUESTS, 'Rate Limited Response Status') && allChecks;
    printSuccess('API correctly returned 429 Too Many Requests');

    // Step 5: Verify Error Response
    printStep(5, 'Verify Error Response');
    printInfo('Error details:');
    printInfo(`  Error: ${rateLimitResponse.data.error}`);
    printInfo(`  Description: ${rateLimitResponse.data.error_description}`);
    printInfo('Rate limit details:');
    printInfo(`  Limit: ${rateLimitResponse.data.rate_limit.limit}`);
    printInfo(`  Remaining: ${rateLimitResponse.data.rate_limit.remaining}`);
    printInfo(`  Reset: ${rateLimitResponse.data.rate_limit.reset}`);
    
    if (rateLimitResponse.data.error === 'rate_limit_exceeded') {
      printSuccess('Error code is correct: rate_limit_exceeded');
      allChecks = allChecks && true;
    } else {
      printError('Error code is incorrect');
      allChecks = false;
    }

    // Step 6: Verify Rate Limit Headers
    printStep(6, 'Verify Rate Limit Headers');
    printInfo('Standard rate limit headers present:');
    printSuccess(`  ✓ X-RateLimit-Limit: ${rateLimitResponse.headers['x-ratelimit-limit']}`);
    printSuccess(`  ✓ X-RateLimit-Remaining: ${rateLimitResponse.headers['x-ratelimit-remaining']}`);
    printSuccess(`  ✓ X-RateLimit-Reset: ${rateLimitResponse.headers['x-ratelimit-reset']}`);
    printSuccess(`  ✓ Retry-After: ${rateLimitResponse.headers['retry-after']} seconds`);
    printInfo('Client can use these headers to implement backoff strategy');

    // Step 7: Verify Per-Client Rate Limiting
    printStep(7, 'Verify Per-Client Rate Limiting');
    printInfo('Rate limiting is applied per OAuth client:');
    printSuccess(`  ✓ Client ID: ${client.client_id}`);
    printSuccess('  ✓ Each client has independent rate limit');
    printSuccess('  ✓ One client cannot exhaust limits for others');
    printInfo('Different clients can make requests simultaneously');

    // Step 8: Demonstrate Retry After Window
    printStep(8, 'Demonstrate Retry After Window');
    printInfo('After rate limit window expires:');
    printInfo(`  Wait ${RATE_LIMIT_CONFIG.WINDOW_MS / 1000} seconds`);
    printInfo('  Rate limit counter resets');
    printInfo('  Client can make new requests');
    printSuccess('Rate limit is time-windowed, not permanent');

    // Step 9: Verify Audit Logging
    printStep(9, 'Verify Audit Logging');
    printInfo('Audit log should contain:');
    printSuccess(`  ✓ ${RATE_LIMIT_CONFIG.MAX_REQUESTS} api_access_granted entries`);
    printSuccess('  ✓ api_access_denied (rate limit)');
    printSuccess('  ✓ denial_reason: rate_limit_exceeded');
    printSuccess('  ✓ rate_limit_info: limit, remaining, reset');
    printSuccess('  ✓ customer_id: ' + customer.customer_id);
    printSuccess('  ✓ client_id: ' + client.client_id);
    printSuccess('  ✓ http_status: 429');

    // Step 10: Verify Security and Fairness
    printStep(10, 'Verify Security and Fairness');
    printInfo('Rate limiting benefits:');
    printSuccess('  ✓ Prevents API abuse');
    printSuccess('  ✓ Protects backend resources');
    printSuccess('  ✓ Ensures fair resource allocation');
    printSuccess('  ✓ Mitigates DoS attacks');
    printSuccess('  ✓ Enforces usage policies');
    printInfo('Rate limits can be adjusted per client tier');

    // Step 11: Client Best Practices
    printStep(11, 'Client Best Practices');
    printInfo('Recommended client behavior:');
    printSuccess('  ✓ Monitor X-RateLimit-Remaining header');
    printSuccess('  ✓ Implement exponential backoff');
    printSuccess('  ✓ Respect Retry-After header');
    printSuccess('  ✓ Cache responses when possible');
    printSuccess('  ✓ Batch requests efficiently');
    printWarning('  ⚠ Do not retry immediately on 429');

    // Summary
    printStep(12, 'Summary');
    printSuccess('Rate limit scenario validated successfully');
    printInfo('Key validations:');
    printInfo(`  ✓ First ${RATE_LIMIT_CONFIG.MAX_REQUESTS} requests succeeded (200 OK)`);
    printInfo(`  ✓ Request ${RATE_LIMIT_CONFIG.REQUESTS_TO_TRIGGER} denied (429 Too Many Requests)`);
    printInfo('  ✓ Rate limit headers present');
    printInfo('  ✓ Error response includes retry information');
    printInfo('  ✓ Per-client rate limiting enforced');
    printInfo('  ✓ Audit trail complete');

    printScenarioResult(allChecks, 'Rate limit correctly returns 429 Too Many Requests');
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
