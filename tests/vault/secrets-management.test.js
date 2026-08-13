/**
 * Secrets Management Tests
 * Tests vault-backed secret retrieval and runtime loading
 */

const vaultClient = require('../../vault/configuration/vault-client');
const secretsLoader = require('../../vault/configuration/secrets-loader');

describe('Vault Secret Management', () => {
  beforeEach(() => {
    // Clear cache before each test
    vaultClient.clearSecretCache();
    
    // Set test environment variables
    process.env.VAULT_BACKEND = 'env';
    process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
    process.env.DATA_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long';
  });
  
  afterEach(() => {
    // Clean up
    vaultClient.clearSecretCache();
  });
  
  describe('Vault Client', () => {
    test('should retrieve secret from environment variables', async () => {
      const secret = await vaultClient.getSecret('database/url');
      
      expect(secret).toBe('postgresql://testuser:testpass@localhost:5432/testdb');
    });
    
    test('should cache secrets', async () => {
      // First call
      const secret1 = await vaultClient.getSecret('database/url');
      
      // Change environment variable
      process.env.DATABASE_URL = 'postgresql://changed:changed@localhost:5432/changed';
      
      // Second call should return cached value
      const secret2 = await vaultClient.getSecret('database/url');
      
      expect(secret2).toBe(secret1);
      expect(secret2).not.toBe('postgresql://changed:changed@localhost:5432/changed');
    });
    
    test('should bypass cache when requested', async () => {
      // First call with cache
      const secret1 = await vaultClient.getSecret('database/url', true);
      
      // Change environment variable
      process.env.DATABASE_URL = 'postgresql://changed:changed@localhost:5432/changed';
      
      // Second call without cache should return new value
      const secret2 = await vaultClient.getSecret('database/url', false);
      
      expect(secret2).toBe('postgresql://changed:changed@localhost:5432/changed');
      expect(secret2).not.toBe(secret1);
    });
    
    test('should invalidate specific secret', async () => {
      // Cache secret
      await vaultClient.getSecret('database/url');
      
      // Change environment variable
      process.env.DATABASE_URL = 'postgresql://changed:changed@localhost:5432/changed';
      
      // Invalidate cache
      vaultClient.invalidateSecret('database/url');
      
      // Next call should get new value
      const secret = await vaultClient.getSecret('database/url');
      expect(secret).toBe('postgresql://changed:changed@localhost:5432/changed');
    });
    
    test('should return null for missing secret', async () => {
      delete process.env.DATABASE_URL;
      
      const secret = await vaultClient.getSecret('database/url');
      
      expect(secret).toBeNull();
    });
    
    test('should throw error for missing required secret', async () => {
      delete process.env.JWT_SECRET;
      
      await expect(
        vaultClient.getRequiredSecret('jwt/secret')
      ).rejects.toThrow('Required secret not found: jwt/secret');
    });
    
    test('should check if secret exists', async () => {
      const exists = await vaultClient.secretExists('database/url');
      expect(exists).toBe(true);
      
      delete process.env.DATABASE_URL;
      const notExists = await vaultClient.secretExists('database/url');
      expect(notExists).toBe(false);
    });
    
    test('should retrieve multiple secrets', async () => {
      const secrets = await vaultClient.getSecrets([
        'database/url',
        'jwt/secret',
        'encryption/data-encryption'
      ]);
      
      expect(secrets['database/url']).toBeDefined();
      expect(secrets['jwt/secret']).toBeDefined();
      expect(secrets['encryption/data-encryption']).toBeDefined();
    });
    
    test('should perform health check', async () => {
      const health = await vaultClient.healthCheck();
      
      expect(health.backend).toBe('env');
      // Health check may pass or fail depending on test secret availability
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('message');
    });
  });
  
  describe('Secrets Loader', () => {
    test('should load all required secrets', async () => {
      const secrets = await secretsLoader.loadSecrets();
      
      expect(secrets.DATABASE_URL).toBeDefined();
      expect(secrets.JWT_SECRET).toBeDefined();
      expect(secrets.DATA_ENCRYPTION_KEY).toBeDefined();
    });
    
    test('should fail when required secret is missing', async () => {
      delete process.env.JWT_SECRET;
      
      await expect(
        secretsLoader.loadSecrets()
      ).rejects.toThrow('Failed to load required secrets');
    });
    
    test('should get loaded secret by key', async () => {
      await secretsLoader.loadSecrets();
      
      const dbUrl = secretsLoader.getLoadedSecret('DATABASE_URL');
      expect(dbUrl).toBe('postgresql://testuser:testpass@localhost:5432/testdb');
    });
    
    test('should get database URL from loaded secrets', async () => {
      await secretsLoader.loadSecrets();
      
      const dbUrl = secretsLoader.getDatabaseUrl();
      expect(dbUrl).toBe('postgresql://testuser:testpass@localhost:5432/testdb');
    });
    
    test('should get JWT secret from loaded secrets', async () => {
      await secretsLoader.loadSecrets();
      
      const jwtSecret = secretsLoader.getJwtSecret();
      expect(jwtSecret).toBe('test-jwt-secret-key-for-testing-only');
    });
    
    test('should get encryption key from loaded secrets', async () => {
      await secretsLoader.loadSecrets();
      
      const encryptionKey = secretsLoader.getEncryptionKey();
      expect(encryptionKey).toBe('test-encryption-key-32-bytes-long');
    });
    
    test('should throw error when getting unloaded secret', () => {
      expect(() => {
        secretsLoader.getDatabaseUrl();
      }).toThrow('DATABASE_URL not loaded from vault');
    });
    
    test('should validate loaded secrets', async () => {
      await secretsLoader.loadSecrets();
      
      const isValid = secretsLoader.validateSecrets();
      expect(isValid).toBe(true);
    });
    
    test('should detect missing required secrets', async () => {
      // Don't load secrets
      const isValid = secretsLoader.validateSecrets();
      expect(isValid).toBe(false);
    });
    
    test('should get secrets health status', async () => {
      await secretsLoader.loadSecrets();
      
      const health = secretsLoader.getSecretsHealth();
      
      expect(health.healthy).toBe(true);
      expect(health.required).toBeGreaterThan(0);
      expect(health.loaded).toBeGreaterThan(0);
      expect(health.missing).toEqual([]);
    });
    
    test('should reload secrets', async () => {
      await secretsLoader.loadSecrets();
      
      // Change environment variable
      process.env.DATABASE_URL = 'postgresql://reloaded:reloaded@localhost:5432/reloaded';
      
      // Reload
      await secretsLoader.reloadSecrets();
      
      const dbUrl = secretsLoader.getDatabaseUrl();
      expect(dbUrl).toBe('postgresql://reloaded:reloaded@localhost:5432/reloaded');
    });
    
    test('should sanitize errors to prevent secret leakage', async () => {
      await secretsLoader.loadSecrets();
      
      const error = new Error('Connection failed: postgresql://testuser:testpass@localhost:5432/testdb');
      const sanitized = secretsLoader.sanitizeError(error);
      
      expect(sanitized.message).not.toContain('testpass');
      expect(sanitized.message).toContain('[REDACTED]');
    });
    
    test('should initialize secrets successfully', async () => {
      await expect(
        secretsLoader.initializeSecrets()
      ).resolves.not.toThrow();
    });
    
    test('should fail initialization when secrets missing', async () => {
      delete process.env.JWT_SECRET;
      
      await expect(
        secretsLoader.initializeSecrets()
      ).rejects.toThrow();
    });
  });
  
  describe('Fail Closed Behavior', () => {
    test('should fail closed when vault is unavailable', async () => {
      // Simulate vault unavailability by using invalid backend
      process.env.VAULT_BACKEND = 'hashicorp';
      delete process.env.VAULT_TOKEN;
      
      // Should fall back to env and fail if secrets not in env
      delete process.env.DATABASE_URL;
      
      const secret = await vaultClient.getSecret('database/url');
      expect(secret).toBeNull();
    });
    
    test('should not start application without required secrets', async () => {
      delete process.env.JWT_SECRET;
      
      await expect(
        secretsLoader.initializeSecrets()
      ).rejects.toThrow();
    });
    
    test('should throw error when accessing unloaded secret', () => {
      expect(() => {
        secretsLoader.getJwtSecret();
      }).toThrow('JWT_SECRET not loaded from vault');
    });
  });
  
  describe('Secret Rotation', () => {
    test('should support secret rotation via reload', async () => {
      await secretsLoader.loadSecrets();
      
      const oldSecret = secretsLoader.getJwtSecret();
      
      // Rotate secret
      process.env.JWT_SECRET = 'new-rotated-jwt-secret-key';
      
      // Reload secrets
      await secretsLoader.reloadSecrets();
      
      const newSecret = secretsLoader.getJwtSecret();
      
      expect(newSecret).not.toBe(oldSecret);
      expect(newSecret).toBe('new-rotated-jwt-secret-key');
    });
    
    test('should invalidate cache on rotation', async () => {
      await vaultClient.getSecret('jwt/secret');
      
      // Rotate secret
      process.env.JWT_SECRET = 'rotated-secret';
      
      // Invalidate cache
      vaultClient.invalidateSecret('jwt/secret');
      
      // Get new secret
      const newSecret = await vaultClient.getSecret('jwt/secret');
      expect(newSecret).toBe('rotated-secret');
    });
  });
  
  describe('Security', () => {
    test('should not expose secrets in logs', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await secretsLoader.loadSecrets();
      
      // Check that no console.log contains actual secret values
      const logs = consoleSpy.mock.calls.map(call => call.join(' '));
      const hasSecretInLogs = logs.some(log => 
        log.includes('testpass') || 
        log.includes('test-jwt-secret-key-for-testing-only')
      );
      
      expect(hasSecretInLogs).toBe(false);
      
      consoleSpy.mockRestore();
    });
    
    test('should sanitize errors containing secrets', async () => {
      await secretsLoader.loadSecrets();
      
      const dbUrl = secretsLoader.getDatabaseUrl();
      const error = new Error(`Database connection failed: ${dbUrl}`);
      
      const sanitized = secretsLoader.sanitizeError(error);
      
      expect(sanitized.message).not.toContain('testpass');
      expect(sanitized.message).toContain('[REDACTED]');
    });
  });
});

// Made with Bob
