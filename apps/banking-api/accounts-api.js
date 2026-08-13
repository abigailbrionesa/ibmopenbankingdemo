/**
 * Banking Accounts API
 * Protected endpoints for accessing customer account data
 */

const express = require('express');
const router = express.Router();
const { query } = require('../../data/db');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('banking-api');

/**
 * GET /api/v1/accounts
 * List all accounts for the authenticated customer
 * 
 * Required scope: accounts:read
 */
router.get('/', async (req, res) => {
  const requestLogger = req.logger ? req.logger.child('get-accounts') : logger.child('get-accounts');
  const endTimer = requestLogger.startTimer();
  
  try {
    // Customer ID is set by OAuth middleware
    const customer_id = req.oauth_token.customer_id;
    
    requestLogger.info('Fetching accounts', {
      customer_id,
      client_id: req.oauth_token.client_id
    });
    
    // Fetch accounts for this customer
    const result = await query(
      `SELECT 
        account_id,
        account_number,
        account_type,
        currency,
        status,
        opened_date
       FROM accounts 
       WHERE customer_id = $1 AND status = 'active'
       ORDER BY opened_date DESC`,
      [customer_id]
    );
    
    // Fetch balances for each account
    const accounts = await Promise.all(
      result.rows.map(async (account) => {
        // Get current balance (sum of all transactions)
        const balanceResult = await query(
          `SELECT 
            COALESCE(SUM(amount), 0) as current_balance
           FROM transactions 
           WHERE account_id = $1`,
          [account.account_id]
        );
        
        const currentBalance = parseFloat(balanceResult.rows[0].current_balance);
        
        return {
          account_id: account.account_id,
          account_number: maskAccountNumber(account.account_number),
          account_type: account.account_type,
          currency: account.currency,
          balance: {
            current: currentBalance,
            available: currentBalance // Simplified: available = current
          },
          status: account.status,
          opened_date: account.opened_date
        };
      })
    );
    
    const latency = endTimer();
    requestLogger.logApiCall('GET', '/api/v1/accounts', 200, latency, {
      customer_id,
      client_id: req.oauth_token.client_id,
      account_count: accounts.length
    });
    
    res.json({
      accounts: accounts,
      total: accounts.length
    });
    
  } catch (error) {
    const latency = endTimer();
    requestLogger.error('Get accounts error', error, {
      customer_id: req.oauth_token?.customer_id,
      client_id: req.oauth_token?.client_id,
      latency_ms: latency
    });
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to retrieve accounts'
    });
  }
});

/**
 * GET /api/v1/accounts/:account_id
 * Get details for a specific account
 * 
 * Required scope: accounts:read
 */
router.get('/:account_id', async (req, res) => {
  const requestLogger = req.logger ? req.logger.child('get-account') : logger.child('get-account');
  const endTimer = requestLogger.startTimer();
  
  try {
    const customer_id = req.oauth_token.customer_id;
    const { account_id } = req.params;
    
    requestLogger.info('Fetching account details', {
      customer_id,
      client_id: req.oauth_token.client_id,
      account_id
    });
    
    // Fetch account with customer verification
    const result = await query(
      `SELECT 
        account_id,
        customer_id,
        account_number,
        account_type,
        currency,
        status,
        opened_date,
        closed_date
       FROM accounts 
       WHERE account_id = $1 AND customer_id = $2`,
      [account_id, customer_id]
    );
    
    if (result.rows.length === 0) {
      const latency = endTimer();
      requestLogger.warn('Account not found', {
        customer_id,
        client_id: req.oauth_token.client_id,
        account_id,
        latency_ms: latency
      });
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Account not found or does not belong to customer'
      });
    }
    
    const account = result.rows[0];
    
    // Get current balance
    const balanceResult = await query(
      `SELECT 
        COALESCE(SUM(amount), 0) as current_balance
       FROM transactions 
       WHERE account_id = $1`,
      [account_id]
    );
    
    const currentBalance = parseFloat(balanceResult.rows[0].current_balance);
    
    // Get transaction count
    const countResult = await query(
      'SELECT COUNT(*) as transaction_count FROM transactions WHERE account_id = $1',
      [account_id]
    );
    
    const latency = endTimer();
    requestLogger.logApiCall('GET', `/api/v1/accounts/${account_id}`, 200, latency, {
      customer_id,
      client_id: req.oauth_token.client_id,
      account_id
    });
    
    res.json({
      account_id: account.account_id,
      account_number: maskAccountNumber(account.account_number),
      account_type: account.account_type,
      currency: account.currency,
      balance: {
        current: currentBalance,
        available: currentBalance
      },
      status: account.status,
      opened_date: account.opened_date,
      closed_date: account.closed_date,
      transaction_count: parseInt(countResult.rows[0].transaction_count)
    });
    
  } catch (error) {
    const latency = endTimer();
    requestLogger.error('Get account detail error', error, {
      customer_id: req.oauth_token?.customer_id,
      client_id: req.oauth_token?.client_id,
      account_id: req.params.account_id,
      latency_ms: latency
    });
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to retrieve account details'
    });
  }
});

/**
 * GET /api/v1/accounts/:account_id/balance
 * Get balance for a specific account
 * 
 * Required scope: balances:read
 */
router.get('/:account_id/balance', async (req, res) => {
  const requestLogger = req.logger ? req.logger.child('get-balance') : logger.child('get-balance');
  const endTimer = requestLogger.startTimer();
  
  try {
    const customer_id = req.oauth_token.customer_id;
    const { account_id } = req.params;
    
    requestLogger.info('Fetching account balance', {
      customer_id,
      client_id: req.oauth_token.client_id,
      account_id
    });
    
    // Verify account belongs to customer
    const accountResult = await query(
      'SELECT account_id, currency FROM accounts WHERE account_id = $1 AND customer_id = $2',
      [account_id, customer_id]
    );
    
    if (accountResult.rows.length === 0) {
      const latency = endTimer();
      requestLogger.warn('Account not found for balance', {
        customer_id,
        client_id: req.oauth_token.client_id,
        account_id,
        latency_ms: latency
      });
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Account not found'
      });
    }
    
    const account = accountResult.rows[0];
    
    // Get current balance
    const balanceResult = await query(
      `SELECT 
        COALESCE(SUM(amount), 0) as current_balance
       FROM transactions 
       WHERE account_id = $1`,
      [account_id]
    );
    
    const currentBalance = parseFloat(balanceResult.rows[0].current_balance);
    
    const latency = endTimer();
    requestLogger.logApiCall('GET', `/api/v1/accounts/${account_id}/balance`, 200, latency, {
      customer_id,
      client_id: req.oauth_token.client_id,
      account_id,
      balance: currentBalance
    });
    
    res.json({
      account_id: account.account_id,
      currency: account.currency,
      balance: {
        current: currentBalance,
        available: currentBalance
      },
      as_of: new Date().toISOString()
    });
    
  } catch (error) {
    const latency = endTimer();
    requestLogger.error('Get balance error', error, {
      customer_id: req.oauth_token?.customer_id,
      client_id: req.oauth_token?.client_id,
      account_id: req.params.account_id,
      latency_ms: latency
    });
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to retrieve balance'
    });
  }
});

/**
 * GET /api/v1/accounts/:account_id/transactions
 * Get transactions for a specific account
 * 
 * Required scope: transactions:read
 */
router.get('/:account_id/transactions', async (req, res) => {
  const requestLogger = req.logger ? req.logger.child('get-transactions') : logger.child('get-transactions');
  const endTimer = requestLogger.startTimer();
  
  try {
    const customer_id = req.oauth_token.customer_id;
    const { account_id } = req.params;
    
    // Query parameters for pagination and filtering
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const from_date = req.query.from_date;
    const to_date = req.query.to_date;
    
    requestLogger.info('Fetching transactions', {
      customer_id,
      client_id: req.oauth_token.client_id,
      account_id,
      limit,
      offset,
      from_date,
      to_date
    });
    
    // Verify account belongs to customer
    const accountResult = await query(
      'SELECT account_id FROM accounts WHERE account_id = $1 AND customer_id = $2',
      [account_id, customer_id]
    );
    
    if (accountResult.rows.length === 0) {
      const latency = endTimer();
      requestLogger.warn('Account not found for transactions', {
        customer_id,
        client_id: req.oauth_token.client_id,
        account_id,
        latency_ms: latency
      });
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Account not found'
      });
    }
    
    // Build query with optional date filters
    let transactionQuery = `
      SELECT 
        transaction_id,
        account_id,
        transaction_date,
        amount,
        currency,
        transaction_type,
        description,
        merchant_name,
        category,
        status,
        created_at
      FROM transactions 
      WHERE account_id = $1
    `;
    
    const queryParams = [account_id];
    let paramIndex = 2;
    
    if (from_date) {
      transactionQuery += ` AND transaction_date >= $${paramIndex}`;
      queryParams.push(from_date);
      paramIndex++;
    }
    
    if (to_date) {
      transactionQuery += ` AND transaction_date <= $${paramIndex}`;
      queryParams.push(to_date);
      paramIndex++;
    }
    
    transactionQuery += ` ORDER BY transaction_date DESC, created_at DESC`;
    transactionQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);
    
    // Fetch transactions
    const result = await query(transactionQuery, queryParams);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE account_id = $1';
    const countParams = [account_id];
    let countParamIndex = 2;
    
    if (from_date) {
      countQuery += ` AND transaction_date >= $${countParamIndex}`;
      countParams.push(from_date);
      countParamIndex++;
    }
    
    if (to_date) {
      countQuery += ` AND transaction_date <= $${countParamIndex}`;
      countParams.push(to_date);
    }
    
    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    
    // Format transactions
    const transactions = result.rows.map(tx => ({
      id: tx.transaction_id,
      account_id: tx.account_id,
      date: tx.transaction_date,
      amount: parseFloat(tx.amount),
      currency: tx.currency,
      type: tx.transaction_type,
      description: tx.description,
      merchant: tx.merchant_name,
      category: tx.category,
      status: tx.status
    }));
    
    const latency = endTimer();
    requestLogger.logApiCall('GET', `/api/v1/accounts/${account_id}/transactions`, 200, latency, {
      customer_id,
      client_id: req.oauth_token.client_id,
      account_id,
      transaction_count: transactions.length,
      total_transactions: total,
      limit,
      offset
    });
    
    res.json({
      transactions: transactions,
      pagination: {
        total: total,
        limit: limit,
        offset: offset,
        has_more: offset + limit < total
      }
    });
    
  } catch (error) {
    const latency = endTimer();
    requestLogger.error('Get transactions error', error, {
      customer_id: req.oauth_token?.customer_id,
      client_id: req.oauth_token?.client_id,
      account_id: req.params.account_id,
      latency_ms: latency
    });
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to retrieve transactions'
    });
  }
});

/**
 * Mask account number for security
 * Shows only last 4 digits
 * 
 * @param {string} accountNumber - Full account number
 * @returns {string} Masked account number
 */
function maskAccountNumber(accountNumber) {
  if (!accountNumber || accountNumber.length < 4) {
    return '****';
  }
  
  const lastFour = accountNumber.slice(-4);
  return `****${lastFour}`;
}

module.exports = router;

// Made with Bob
