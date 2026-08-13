#!/usr/bin/env node

/**
 * Master Demo Runner
 * Executes all demo scenarios and generates a comprehensive report
 */

const { colors } = require('./demo-helpers');

// Import all scenarios
const scenarioA = require('./scenario-a-happy-path');
const scenarioB = require('./scenario-b-no-consent');
const scenarioC = require('./scenario-c-revoked-consent');
const scenarioD = require('./scenario-d-wrong-scope');
const scenarioE = require('./scenario-e-expired-token');
const scenarioF = require('./scenario-f-rate-limit');
const scenarioG = require('./scenario-g-credential-protection');

const scenarios = [
  {
    id: 'A',
    name: 'Happy Path (200 OK)',
    description: 'Complete OAuth flow with successful API access',
    run: scenarioA.runScenario
  },
  {
    id: 'B',
    name: 'No Consent (403 Forbidden)',
    description: 'Valid token without consent',
    run: scenarioB.runScenario
  },
  {
    id: 'C',
    name: 'Revoked Consent (403 Forbidden)',
    description: 'Consent revocation after prior success',
    run: scenarioC.runScenario
  },
  {
    id: 'D',
    name: 'Wrong Scope (403 Forbidden)',
    description: 'Insufficient scope for endpoint',
    run: scenarioD.runScenario
  },
  {
    id: 'E',
    name: 'Expired Token (401 Unauthorized)',
    description: 'Token expiration handling',
    run: scenarioE.runScenario
  },
  {
    id: 'F',
    name: 'Rate Limit (429 Too Many Requests)',
    description: 'Rate limiting enforcement',
    run: scenarioF.runScenario
  },
  {
    id: 'G',
    name: 'Credential Protection',
    description: 'Backend credential protection verification',
    run: scenarioG.runScenario
  }
];

/**
 * Print banner
 */
function printBanner() {
  console.log('\n' + '═'.repeat(80));
  console.log(colors.step.bold('  OPEN BANKING MVP - AUTOMATED DEMO SCENARIOS'));
  console.log(colors.info('  Complete end-to-end demonstration of MVP requirements'));
  console.log('═'.repeat(80) + '\n');
}

/**
 * Print scenario list
 */
function printScenarioList() {
  console.log(colors.info('Scenarios to run:'));
  scenarios.forEach(scenario => {
    console.log(colors.data(`  ${scenario.id}. ${scenario.name}`));
    console.log(colors.data(`     ${scenario.description}`));
  });
  console.log('');
}

/**
 * Print final report
 */
function printFinalReport(results) {
  console.log('\n' + '═'.repeat(80));
  console.log(colors.step.bold('  FINAL REPORT'));
  console.log('═'.repeat(80) + '\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(colors.info('Scenario Results:'));
  results.forEach(result => {
    const status = result.passed ? colors.success('✓ PASSED') : colors.error('✗ FAILED');
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`  ${result.id}. ${result.name}: ${status}${duration}`);
    if (result.error) {
      console.log(colors.error(`     Error: ${result.error}`));
    }
  });

  console.log('\n' + '─'.repeat(80));
  console.log(colors.info(`Total Scenarios: ${total}`));
  console.log(colors.success(`Passed: ${passed}`));
  if (failed > 0) {
    console.log(colors.error(`Failed: ${failed}`));
  }
  console.log('─'.repeat(80));

  const successRate = ((passed / total) * 100).toFixed(1);
  if (passed === total) {
    console.log(colors.success.bold(`\n  ✓ ALL SCENARIOS PASSED (${successRate}%)`));
    console.log(colors.success('  MVP acceptance criteria validated successfully!\n'));
  } else {
    console.log(colors.warning.bold(`\n  ⚠ ${failed} SCENARIO(S) FAILED (${successRate}% success rate)`));
    console.log(colors.warning('  Review failed scenarios above\n'));
  }

  console.log('═'.repeat(80) + '\n');
}

/**
 * Run all scenarios
 */
async function runAllScenarios() {
  printBanner();
  printScenarioList();

  const results = [];
  let overallSuccess = true;

  for (const scenario of scenarios) {
    console.log(colors.step(`\n${'▶'.repeat(3)} Running Scenario ${scenario.id}: ${scenario.name} ${'▶'.repeat(3)}\n`));
    
    const startTime = Date.now();
    let exitCode = 1;
    let error = null;

    try {
      exitCode = await scenario.run();
    } catch (err) {
      error = err.message;
      exitCode = 1;
    }

    const duration = Date.now() - startTime;
    const passed = exitCode === 0;

    results.push({
      id: scenario.id,
      name: scenario.name,
      passed,
      duration,
      error
    });

    if (!passed) {
      overallSuccess = false;
    }

    // Add separator between scenarios
    console.log('\n' + '─'.repeat(80) + '\n');
  }

  printFinalReport(results);

  return overallSuccess ? 0 : 1;
}

/**
 * Run specific scenario by ID
 */
async function runSpecificScenario(scenarioId) {
  const scenario = scenarios.find(s => s.id.toUpperCase() === scenarioId.toUpperCase());
  
  if (!scenario) {
    console.error(colors.error(`Error: Scenario '${scenarioId}' not found`));
    console.log(colors.info('\nAvailable scenarios:'));
    scenarios.forEach(s => {
      console.log(colors.data(`  ${s.id}. ${s.name}`));
    });
    return 1;
  }

  printBanner();
  console.log(colors.info(`Running Scenario ${scenario.id}: ${scenario.name}\n`));

  try {
    const exitCode = await scenario.run();
    return exitCode;
  } catch (error) {
    console.error(colors.error(`Error running scenario: ${error.message}`));
    return 1;
  }
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Usage: node run-all-demos.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h           Show this help message');
  console.log('  --scenario <id>, -s  Run specific scenario (A-G)');
  console.log('  --list, -l           List all available scenarios');
  console.log('');
  console.log('Examples:');
  console.log('  node run-all-demos.js              # Run all scenarios');
  console.log('  node run-all-demos.js -s A         # Run scenario A only');
  console.log('  node run-all-demos.js --list       # List scenarios');
}

/**
 * List all scenarios
 */
function listScenarios() {
  printBanner();
  console.log(colors.info('Available Demo Scenarios:\n'));
  scenarios.forEach(scenario => {
    console.log(colors.step(`Scenario ${scenario.id}: ${scenario.name}`));
    console.log(colors.data(`  ${scenario.description}`));
    console.log('');
  });
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return 0;
  }

  if (args.includes('--list') || args.includes('-l')) {
    listScenarios();
    return 0;
  }

  const scenarioIndex = args.findIndex(arg => arg === '--scenario' || arg === '-s');
  if (scenarioIndex !== -1 && args[scenarioIndex + 1]) {
    const scenarioId = args[scenarioIndex + 1];
    return await runSpecificScenario(scenarioId);
  }

  // Run all scenarios by default
  return await runAllScenarios();
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(exitCode => process.exit(exitCode))
    .catch(error => {
      console.error(colors.error('Unexpected error:'), error);
      process.exit(1);
    });
}

module.exports = { runAllScenarios, runSpecificScenario };

// Made with Bob
