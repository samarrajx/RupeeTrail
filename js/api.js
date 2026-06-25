// api.js
// Frontend API layer handling communication with the Google Apps Script backend.

class ApiClient {
    constructor() {
        this.baseUrl = CONFIG.API_URL;
    }

    /**
     * Core Fetch Wrapper
     * Handles authentication tokens, timeouts, and standardizing responses.
     */
    async request(endpoint, params = {}) {
        const url = new URL(this.baseUrl);
        
        // Append action/endpoint to query params for Apps Script routing
        url.searchParams.append('action', endpoint);
        
        // Append auth token if available
        const token = localStorage.getItem('rupeetrail_auth_token');
        if (token) {
            url.searchParams.append('token', token);
        }

        const options = {
            method: 'POST', // Apps Script web apps usually handle POST better for JSON payloads
            body: JSON.stringify(params),
            headers: {
                // text/plain bypasses CORS preflight checks which is necessary for Apps Script
                'Content-Type': 'text/plain;charset=utf-8', 
            }
        };

        try {
            // Setup timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
            options.signal = controller.signal;

            const response = await fetch(url, options);
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Standardize error handling from backend
            if (data && data.success === false) {
                throw new Error(data.error || 'API Error');
            }
            
            return data;
        } catch (error) {
            console.error(`API Request failed (${endpoint}):`, error);
            throw error;
        }
    }

    // --- Authentication Endpoints ---

    async login(pin) {
        return this.request('login', { pin });
    }

    async logout() {
        return this.request('logout', {});
    }

    async verifyToken() {
        return this.request('verifyToken', {});
    }

    async changePin(oldPin, newPin) {
        return this.request('changePin', { oldPin, newPin });
    }

    // --- Transactions Endpoints ---

    async getTransactions(filter = {}) {
        return this.request('getTransactions', filter);
    }

    async addTransaction(transaction) {
        return this.request('addTransaction', { transaction });
    }

    async updateTransaction(id, transaction) {
        return this.request('updateTransaction', { id, transaction });
    }

    async deleteTransaction(id) {
        return this.request('deleteTransaction', { id });
    }

    // --- Accounts Endpoints ---

    async getAccounts() {
        return this.request('getAccounts', {});
    }

    async addAccount(account) {
        return this.request('addAccount', { account });
    }

    async updateAccount(id, account) {
        return this.request('updateAccount', { id, account });
    }

    async deleteAccount(id) {
        return this.request('deleteAccount', { id });
    }

    // --- Categories Endpoints ---

    async getCategories() {
        return this.request('getCategories', {});
    }

    async addCategory(category) {
        return this.request('addCategory', { category });
    }

    async updateCategory(id, category) {
        return this.request('updateCategory', { id, category });
    }

    async deleteCategory(id) {
        return this.request('deleteCategory', { id });
    }

    // --- Settings Endpoints ---

    async getSettings() {
        return this.request('getSettings', {});
    }

    async updateSettings(settings) {
        return this.request('updateSettings', { settings });
    }
}

// Export a global singleton instance
const api = new ApiClient();
