# Secret Management and Vault Integration

## Overview

The Open Banking MVP implements a comprehensive secret management system that ensures **no backend credentials are hardcoded** in source code, configuration files, or frontend applications. All secrets are retrieved at runtime from a secure vault backend.

## Architecture

```
┌─────────────────┐
│   Application   │
│    Startup      │
└────────┬────────┘
         │
         │ 1. Initialize
         ▼
┌─────────────────┐
│ Secrets Loader  │◄──── Loads required secrets
└────────┬────────┘      Fails if any missing
         │
         │ 2. Retrieve
         ▼
┌─────────────────┐
│  Vault Client   │◄──── Connects to vault backend
└────────┬────────┘      Caches results (5 min TTL)
         │
         │ 3. Fetch
         ▼
┌─────────────────┐
│ Vault Backend   │
│  - Environment  │◄──── Development
│  - HashiCorp    │◄──── Production
│  - AWS Secrets  │◄──── Alternative
│  - Azure KeyVault│◄──── Alternative
└─────────────────┘
```

## Supported Vault Backends

### Environment Variables (Development)

**Use Case**: Local development and testing

**Configuration**:
```bash
VAULT_BACKEND=env
DATABASE_URL=postgresql://user:pass@localhost:5432/db
JWT_SECRET=your-jwt-secret-key
DATA_ENCRYPTION_KEY=your-encryption-key
```

**Pros**:
- Simple setup for local development
- No external dependencies
- Fast retrieval

**Cons**:
- Not suitable for production
- Secrets stored in process environment

### HashiCorp Vault (Production)

**Use Case**: Production deployments

**Configuration**:
```bash
VAULT_BACKEND=hashicorp
VAULT_ADDR=https://vault.example.com:8200
VAULT_TOKEN=s.xxxxxxxxxxxxxxxx
VAULT_NAMESPACE=openbanking
VAULT_MOUNT_PATH=secret
```

**Pros**:
- Industry-standard secret management
- Dynamic secrets support
- Audit logging
- Access control policies
- Secret rotation

**Cons**:
- Requires vault infrastructure
- Additional operational complexity

### AWS Secrets Manager

**Use Case**: AWS-hosted deployments

**Configuration**:
```bash
VAULT_BACKEND=aws
AWS_REGION=us-east-1
AWS_SECRET_PREFIX=openbanking/
```

**Pros**:
- Native AWS integration
- IAM-based access control
- Automatic rotation support
- No additional infrastructure

**Cons**:
- AWS-specific
- Cost per secret

### Azure Key Vault

**Use Case**: Azure-hosted deployments

**Configuration**:
```bash
VAULT_BACKEND=azure
AZURE_VAULT_URL=https://your-vault.vault.azure.net
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
```

**Pros**:
- Native Azure integration
- Azure AD authentication
- Hardware security module (HSM) support

**Cons**:
- Azure-specific
- Requires Azure AD setup

## Secret Naming Convention

Secrets follow a hierarchical naming structure:

```
category/secret-name
```

### Standard Secrets

| Secret Path | Description | Required |
|-------------|-------------|----------|
| `database/url` | PostgreSQL connection string | Yes |
| `jwt/secret` | JWT signing key | Yes |
| `encryption/data-encryption` | Data encryption key | Yes |
| `oauth/fintech-client-secret` | OAuth client secret | Yes |
| `redis/password` | Redis password | No |
| `smtp/user` | SMTP username | No |
| `smtp/password` | SMTP password | No |
| `monitoring/sentry-dsn` | Sentry DSN | No |
| `monitoring/datadog-api-key` | Datadog API key | No |

## Runtime Secret Loading

### Application Initialization

Secrets are loaded during application startup:

```javascript
const { initializeSecrets } = require('./vault/configuration/secrets-loader');

async function startApplication() {
  try {
    // Load secrets from vault
    await initializeSecrets();
    
    // Secrets are now available
    const dbUrl = getDatabaseUrl();
    const jwtSecret = getJwtSecret();
    
    // Start application
    await startServer();
    
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1); // Fail closed
  }
}
```

### Accessing Loaded Secrets

```javascript
const { getDatabaseUrl, getJwtSecret, getEncryptionKey } = require('./vault/configuration/secrets-loader');

// Get database URL
const dbUrl = getDatabaseUrl();

// Get JWT secret
const jwtSecret = getJwtSecret();

// Get encryption key
const encryptionKey = getEncryptionKey();
```

### Fail-Closed Behavior

The application **fails to start** if any required secret is missing:

```javascript
// Missing required secret
await initializeSecrets();
// Throws: Error: Failed to load required secrets:
//         Failed to load required secret JWT_SECRET: Required secret not found
```

This ensures the application never runs with incomplete configuration.

## Secret Rotation

### Rotation Process

1. **Update Secret in Vault**
   ```bash
   # HashiCorp Vault example
   vault kv put secret/openbanking/jwt/secret value="new-jwt-secret-key"
   ```

2. **Invalidate Application Cache**
   ```javascript
   const { reloadSecrets } = require('./vault/configuration/secrets-loader');
   
   // Reload all secrets
   await reloadSecrets();
   ```

3. **Verify New Secret**
   ```javascript
   const newSecret = getJwtSecret();
   console.log('Secret rotated successfully');
   ```

### Zero-Downtime Rotation

For zero-downtime rotation of critical secrets like JWT keys:

1. **Add New Key**: Add new key alongside old key
2. **Deploy Update**: Update application to accept both keys
3. **Rotate**: Switch to new key for signing
4. **Grace Period**: Keep old key for verification
5. **Remove Old Key**: After grace period, remove old key

### Rotation Schedule

| Secret Type | Rotation Frequency | Method |
|-------------|-------------------|--------|
| JWT Secret | Every 90 days | Manual or automated |
| Database Password | Every 90 days | Coordinated with DB |
| Encryption Keys | Every 180 days | Key versioning |
| OAuth Client Secrets | Every 180 days | Coordinated with clients |
| API Keys | As needed | On compromise |

## Security Best Practices

### 1. Never Commit Secrets

**❌ Bad**:
```javascript
const JWT_SECRET = 'hardcoded-secret-key';
```

**✅ Good**:
```javascript
const { getJwtSecret } = require('./vault/configuration/secrets-loader');
const JWT_SECRET = getJwtSecret();
```

### 2. Use Placeholders in Examples

**`.env.example`**:
```bash
# ❌ Bad
JWT_SECRET=actual-secret-key-here

# ✅ Good
JWT_SECRET=PLACEHOLDER_JWT_SECRET
```

### 3. Sanitize Error Messages

```javascript
const { sanitizeError } = require('./vault/configuration/secrets-loader');

try {
  await connectDatabase(dbUrl);
} catch (error) {
  // Remove secrets from error messages
  const sanitized = sanitizeError(error);
  console.error('Database connection failed:', sanitized.message);
}
```

### 4. Limit Secret Scope

Only load secrets that are actually needed:

```javascript
// ❌ Bad: Load all secrets everywhere
await loadAllSecrets();

// ✅ Good: Load only required secrets
const dbUrl = await getRequiredSecret('database/url');
```

### 5. Use Short Cache TTL

Secrets are cached for 5 minutes by default. This balances:
- **Performance**: Reduces vault calls
- **Security**: Limits exposure window
- **Rotation**: Allows relatively quick rotation

## Repository Security

### .gitignore Rules

Ensure these patterns are in `.gitignore`:

```gitignore
# Environment files with secrets
.env
.env.local
.env.*.local

# Vault tokens
.vault-token
vault-token.txt

# Secret files
secrets/
*.secret
*.key
*.pem
*.p12

# Backup files that might contain secrets
*.backup
*.bak
*.old
```

### Pre-commit Hooks

Use tools like `git-secrets` to prevent accidental commits:

```bash
# Install git-secrets
brew install git-secrets  # macOS
apt-get install git-secrets  # Linux

# Configure
git secrets --install
git secrets --register-aws
git secrets --add 'password\s*=\s*.+'
git secrets --add 'secret\s*=\s*.+'
git secrets --add 'token\s*=\s*.+'
```

### Secret Scanning

Run regular scans to detect accidentally committed secrets:

```bash
# Using trufflehog
trufflehog filesystem . --only-verified

# Using gitleaks
gitleaks detect --source . --verbose
```

## Vault Setup

### Local Development (Environment Variables)

1. **Copy example environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Set secrets** (never commit `.env`):
   ```bash
   # .env
   VAULT_BACKEND=env
   DATABASE_URL=postgresql://user:pass@localhost:5432/openbanking_dev
   JWT_SECRET=your-local-jwt-secret-key-min-32-chars
   DATA_ENCRYPTION_KEY=your-local-encryption-key-32-bytes
   ```

3. **Start application**:
   ```bash
   npm start
   ```

### Production (HashiCorp Vault)

1. **Install Vault**:
   ```bash
   # Using Docker
   docker run -d --name vault \
     -p 8200:8200 \
     --cap-add=IPC_LOCK \
     vault server -dev
   ```

2. **Initialize Vault**:
   ```bash
   export VAULT_ADDR='http://localhost:8200'
   vault operator init
   vault operator unseal
   ```

3. **Store Secrets**:
   ```bash
   # Database credentials
   vault kv put secret/openbanking/database/url \
     value="postgresql://user:pass@db.example.com:5432/openbanking"
   
   # JWT secret
   vault kv put secret/openbanking/jwt/secret \
     value="production-jwt-secret-key-min-32-chars"
   
   # Encryption key
   vault kv put secret/openbanking/encryption/data-encryption \
     value="production-encryption-key-32-bytes-long"
   ```

4. **Configure Application**:
   ```bash
   export VAULT_BACKEND=hashicorp
   export VAULT_ADDR=http://localhost:8200
   export VAULT_TOKEN=s.xxxxxxxxxxxxxxxx
   export VAULT_NAMESPACE=openbanking
   ```

5. **Start Application**:
   ```bash
   npm start
   ```

## Monitoring and Auditing

### Secret Access Logging

All secret retrievals are logged:

```
INFO: Loading secrets from vault...
✓ Loaded required secret: DATABASE_URL
✓ Loaded required secret: JWT_SECRET
✓ Loaded required secret: DATA_ENCRYPTION_KEY
Successfully loaded 3 secrets
```

### Health Checks

Monitor vault connectivity:

```javascript
const { healthCheck } = require('./vault/configuration/vault-client');

const health = await healthCheck();
console.log('Vault health:', health);
// {
//   healthy: true,
//   backend: 'hashicorp',
//   message: 'Vault connection successful'
// }
```

### Metrics

Track key metrics:
- Secret retrieval latency
- Cache hit rate
- Failed secret retrievals
- Rotation events

## Troubleshooting

### Issue: Application Won't Start

**Symptoms**: Application exits immediately with secret loading error

**Diagnosis**:
```bash
# Check which secrets are missing
npm start 2>&1 | grep "Failed to load"
```

**Solution**:
1. Verify vault backend is configured: `echo $VAULT_BACKEND`
2. Check vault connectivity: `vault status` (for HashiCorp)
3. Verify secrets exist in vault
4. Check vault token has read permissions

### Issue: Secrets Not Updating

**Symptoms**: Application still uses old secret after rotation

**Diagnosis**:
```javascript
const { getCacheStats } = require('./vault/configuration/vault-client');
console.log('Cache stats:', getCacheStats());
```

**Solution**:
1. Invalidate cache: `invalidateSecret('secret-name')`
2. Or reload all secrets: `await reloadSecrets()`
3. Restart application for immediate effect

### Issue: Vault Connection Timeout

**Symptoms**: Slow startup or timeout errors

**Diagnosis**:
```bash
# Test vault connectivity
curl -v $VAULT_ADDR/v1/sys/health
```

**Solution**:
1. Check network connectivity to vault
2. Verify vault address is correct
3. Check firewall rules
4. Increase timeout if needed

## API Reference

### Vault Client

#### getSecret(secretName, useCache)

Retrieve a secret from vault.

**Parameters**:
- `secretName` (string): Secret path (e.g., 'database/url')
- `useCache` (boolean): Use cache (default: true)

**Returns**: Promise<string|null>

**Example**:
```javascript
const secret = await getSecret('database/url');
```

#### getRequiredSecret(secretName)

Retrieve a required secret or throw error.

**Parameters**:
- `secretName` (string): Secret path

**Returns**: Promise<string>

**Throws**: Error if secret not found

**Example**:
```javascript
const secret = await getRequiredSecret('jwt/secret');
```

#### invalidateSecret(secretName)

Invalidate cached secret.

**Parameters**:
- `secretName` (string): Secret path

**Example**:
```javascript
invalidateSecret('jwt/secret');
```

### Secrets Loader

#### initializeSecrets()

Load all required secrets at startup.

**Returns**: Promise<void>

**Throws**: Error if any required secret missing

**Example**:
```javascript
await initializeSecrets();
```

#### getDatabaseUrl()

Get database URL from loaded secrets.

**Returns**: string

**Throws**: Error if not loaded

**Example**:
```javascript
const dbUrl = getDatabaseUrl();
```

#### reloadSecrets()

Reload all secrets from vault.

**Returns**: Promise<Object>

**Example**:
```javascript
await reloadSecrets();
```
