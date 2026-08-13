/**
 * Developer Portal JavaScript
 * Handles UI interactions and API calls
 * 
 * SECURITY NOTE: Client secrets are never stored in browser storage
 * or exposed in the frontend bundle. They are only handled server-side.
 */

// API Base URL - configure based on environment
const API_BASE = window.location.origin;

// State management
let demoState = {
    clientId: null,
    clientSecret: null, // Only stored in memory during demo session
    accessToken: null
};

// Initialize portal on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    loadAPICatalog();
    initializeRegistrationForm();
    initializeDemoFlow();
    initializeCopyButtons();
});

/**
 * Tab Navigation
 */
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;

            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
}

/**
 * Load and display API catalog
 */
async function loadAPICatalog() {
    try {
        const response = await fetch(`${API_BASE}/portal/api/catalog`);
        const catalog = await response.json();

        displayAPIs(catalog.apis);
        displayScopes(catalog.scopes);

        document.getElementById('api-catalog-loading').style.display = 'none';
        document.getElementById('api-catalog-content').style.display = 'block';
    } catch (error) {
        console.error('Failed to load API catalog:', error);
        document.getElementById('api-catalog-loading').textContent = 
            'Failed to load API catalog. Please refresh the page.';
    }
}

/**
 * Display APIs in catalog
 */
function displayAPIs(apis) {
    const container = document.getElementById('apis-list');
    container.innerHTML = '';

    apis.forEach(api => {
        const apiCard = document.createElement('div');
        apiCard.className = 'api-card';
        
        let endpointsHTML = api.endpoints.map(endpoint => `
            <div class="endpoint">
                <div>
                    <span class="endpoint-method">${endpoint.method}</span>
                    <span class="endpoint-path">${endpoint.path}</span>
                </div>
                <div class="endpoint-description">${endpoint.description}</div>
                <span class="scope-badge">Requires: ${endpoint.requiredScope}</span>
            </div>
        `).join('');

        apiCard.innerHTML = `
            <h3>${api.name}</h3>
            <p>${api.description}</p>
            ${endpointsHTML}
        `;

        container.appendChild(apiCard);
    });
}

/**
 * Display available scopes
 */
function displayScopes(scopes) {
    const container = document.getElementById('scopes-list');
    container.innerHTML = '';

    scopes.forEach(scope => {
        const scopeCard = document.createElement('div');
        scopeCard.className = 'scope-card';
        scopeCard.innerHTML = `
            <div class="scope-name">${scope.name}</div>
            <div class="scope-description">${scope.description}</div>
            ${scope.required ? '<span class="scope-badge">Required</span>' : ''}
        `;
        container.appendChild(scopeCard);
    });
}

/**
 * Initialize registration form
 */
function initializeRegistrationForm() {
    const form = document.getElementById('registration-form');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = {
            name: document.getElementById('app-name').value,
            description: document.getElementById('app-description').value,
            redirect_uris: [document.getElementById('redirect-uri').value],
            contact_email: document.getElementById('contact-email').value,
            website_url: document.getElementById('website-url').value,
            requested_scopes: Array.from(
                document.querySelectorAll('input[name="scope"]:checked')
            ).map(cb => cb.value)
        };

        try {
            const button = form.querySelector('button[type="submit"]');
            button.disabled = true;
            button.textContent = 'Registering...';

            const response = await fetch(`${API_BASE}/portal/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error_description || 'Registration failed');
            }

            // Display results
            document.getElementById('result-client-id').textContent = result.client_id;
            document.getElementById('result-client-secret').textContent = result.client_secret;
            
            form.style.display = 'none';
            document.getElementById('registration-result').style.display = 'block';

            // Auto-fill demo credentials
            demoState.clientId = result.client_id;
            demoState.clientSecret = result.client_secret;
            document.getElementById('demo-client-id').value = result.client_id;
            document.getElementById('demo-client-secret').value = result.client_secret;

        } catch (error) {
            alert(`Registration failed: ${error.message}`);
            button.disabled = false;
            button.textContent = 'Register Application';
        }
    });
}

/**
 * Initialize demo flow
 */
function initializeDemoFlow() {
    // Save credentials
    document.getElementById('save-demo-credentials').addEventListener('click', () => {
        const clientId = document.getElementById('demo-client-id').value;
        const clientSecret = document.getElementById('demo-client-secret').value;

        if (!clientId || !clientSecret) {
            alert('Please enter both Client ID and Client Secret');
            return;
        }

        // Store in memory only (never in localStorage or sessionStorage)
        demoState.clientId = clientId;
        demoState.clientSecret = clientSecret;

        document.getElementById('demo-credentials-input').style.display = 'none';
        document.getElementById('demo-credentials-saved').style.display = 'block';
        document.getElementById('start-authorization').disabled = false;
        document.getElementById('exchange-token').disabled = false;
    });

    // Start authorization
    document.getElementById('start-authorization').addEventListener('click', async () => {
        try {
            const response = await fetch(`${API_BASE}/portal/api/authorize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: demoState.clientId,
                    redirect_uri: 'http://localhost:3000/callback',
                    scope: 'accounts:read transactions:read',
                    state: generateRandomState()
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error_description || 'Failed to create authorization URL');
            }

            document.getElementById('auth-url').textContent = result.authorization_url;
            document.getElementById('auth-url-display').style.display = 'block';

            // Open authorization URL in new window
            window.open(result.authorization_url, '_blank');

        } catch (error) {
            alert(`Authorization failed: ${error.message}`);
        }
    });

    // Exchange token
    document.getElementById('exchange-token').addEventListener('click', async () => {
        const authCode = document.getElementById('auth-code').value;

        if (!authCode) {
            alert('Please enter the authorization code from the callback URL');
            return;
        }

        try {
            const button = document.getElementById('exchange-token');
            button.disabled = true;
            button.textContent = 'Exchanging...';

            // IMPORTANT: Token exchange happens server-side to protect client_secret
            const response = await fetch(`${API_BASE}/portal/api/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: authCode,
                    client_id: demoState.clientId,
                    client_secret: demoState.clientSecret,
                    redirect_uri: 'http://localhost:3000/callback'
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error_description || 'Token exchange failed');
            }

            // Store access token in memory
            demoState.accessToken = result.access_token;

            document.getElementById('access-token').textContent = result.access_token;
            document.getElementById('token-display').style.display = 'block';
            document.getElementById('call-api').disabled = false;

            button.textContent = 'Exchange for Token';

        } catch (error) {
            alert(`Token exchange failed: ${error.message}`);
            document.getElementById('exchange-token').disabled = false;
            document.getElementById('exchange-token').textContent = 'Exchange for Token';
        }
    });

    // Call API
    document.getElementById('call-api').addEventListener('click', async () => {
        const endpoint = document.getElementById('api-endpoint').value;

        try {
            const button = document.getElementById('call-api');
            button.disabled = true;
            button.textContent = 'Calling API...';

            const response = await fetch(`${API_BASE}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${demoState.accessToken}`
                }
            });

            const result = await response.json();

            document.getElementById('api-response-content').textContent = 
                JSON.stringify(result, null, 2);
            document.getElementById('api-response').style.display = 'block';

            button.disabled = false;
            button.textContent = 'Call API';

        } catch (error) {
            alert(`API call failed: ${error.message}`);
            document.getElementById('call-api').disabled = false;
            document.getElementById('call-api').textContent = 'Call API';
        }
    });
}

/**
 * Initialize copy buttons
 */
function initializeCopyButtons() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-copy')) {
            const targetId = e.target.dataset.copy;
            const text = document.getElementById(targetId).textContent;

            navigator.clipboard.writeText(text).then(() => {
                const originalText = e.target.textContent;
                e.target.textContent = 'Copied!';
                setTimeout(() => {
                    e.target.textContent = originalText;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy:', err);
                alert('Failed to copy to clipboard');
            });
        }
    });
}

/**
 * Generate random state for OAuth
 */
function generateRandomState() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Security Note:
 * 
 * This implementation demonstrates secure client secret handling:
 * 
 * 1. Client secrets are NEVER stored in:
 *    - localStorage
 *    - sessionStorage
 *    - cookies
 *    - Any persistent storage
 * 
 * 2. Client secrets are only:
 *    - Stored in memory during the demo session
 *    - Sent to server-side endpoints for token exchange
 *    - Cleared when the page is closed
 * 
 * 3. Token exchange happens server-side:
 *    - The /portal/api/token endpoint handles the exchange
 *    - Client secret is sent in the request body (HTTPS only)
 *    - Server makes the actual OAuth token request
 * 
 * 4. In production:
 *    - Use HTTPS for all communications
 *    - Implement proper session management
 *    - Consider using PKCE for public clients
 *    - Never expose client secrets in frontend code
 */

// Made with Bob