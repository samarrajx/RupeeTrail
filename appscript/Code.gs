/**
 * Code.gs
 * Centralized REST API router for RupeeTrail.
 * Handles request validation, routing, authentication, and execution logging.
 */

/**
 * Central Route Configuration
 * Defines supported HTTP methods, authentication requirements, and business logic handlers.
 * Note: Most endpoints require POST because the frontend ApiClient always sends POST 
 * with a JSON body to bypass CORS preflight issues effectively.
 */
const ROUTES = {
  // --- Public Routes ---
  'health': { method: 'GET', auth: false, handler: () => getHealth() },
  'login': { method: 'POST', auth: false, handler: (payload) => Auth.login(payload) },
  'verifyToken': { method: 'POST', auth: false, handler: (payload) => Auth.verifyToken(payload.token) },

  // --- Protected Routes (Auth Required) ---
  'logout': { method: 'POST', auth: true, handler: (payload) => Auth.logout(payload.token) },
  'changePin': { method: 'POST', auth: true, handler: (payload) => Auth.changePin(payload) },

  // Accounts
  'getAccounts': { method: 'POST', auth: true, handler: (payload) => Account.getAccounts(payload) },
  'addAccount': { method: 'POST', auth: true, handler: (payload) => Account.createAccount(payload) },
  'updateAccount': { method: 'POST', auth: true, handler: (payload) => Account.editAccount(payload) },
  'deleteAccount': { method: 'POST', auth: true, handler: (payload) => Account.deleteAccount(payload) },
  'transfer': { method: 'POST', auth: true, handler: (payload) => Account.transfer(payload) },

  // Categories
  'getCategories': { method: 'POST', auth: true, handler: (payload) => Category.getCategories(payload) },
  'addCategory': { method: 'POST', auth: true, handler: (payload) => Category.createCategory(payload) },
  'updateCategory': { method: 'POST', auth: true, handler: (payload) => Category.editCategory(payload) },
  'deleteCategory': { method: 'POST', auth: true, handler: (payload) => Category.deleteCategory(payload) },

  // Transactions
  'getTransactions': { method: 'POST', auth: true, handler: (payload) => Transaction.getTransactions(payload) },
  'addTransaction': { method: 'POST', auth: true, handler: (payload) => Transaction.createTransaction(payload) },
  'updateTransaction': { method: 'POST', auth: true, handler: (payload) => Transaction.editTransaction(payload) },
  'deleteTransaction': { method: 'POST', auth: true, handler: (payload) => Transaction.deleteTransaction(payload) },
  'duplicateTransaction': { method: 'POST', auth: true, handler: (payload) => Transaction.duplicateTransaction(payload) },

  // Budgets
  'getBudgets': { method: 'POST', auth: true, handler: (payload) => Budget.getBudgets(payload) },
  'updateBudget': { method: 'POST', auth: true, handler: (payload) => Budget.updateBudget(payload) },
  'copyPreviousMonthBudget': { method: 'POST', auth: true, handler: (payload) => Budget.copyPreviousMonth(payload) },

  // Dashboard
  'getDashboard': { method: 'POST', auth: true, handler: (payload) => Dashboard.getDashboard(payload) },

  // Settings
  'getSettings': { method: 'POST', auth: true, handler: () => Settings.getSettings() },
  'updateSettings': { method: 'POST', auth: true, handler: (payload) => Settings.updateSettings(payload) },

  // Export (Usually triggered via direct browser navigation, thus GET)
  'exportData': { method: 'GET', auth: true, handler: (payload) => Export.generateExport(payload) }
};

/**
 * Entry point for HTTP GET requests.
 */
function doGet(e) {
  return _handleRequest(e, 'GET');
}

/**
 * Entry point for HTTP POST requests.
 */
function doPost(e) {
  return _handleRequest(e, 'POST');
}

/**
 * Defensive request parsing logic.
 * Safely extracts the action and payload regardless of GET/POST formatting.
 */
function _parseRequest(e, method) {
  if (!e) {
    throw new Error("Missing request object (e). Did you execute this directly from the Apps Script editor?");
  }
  
  const parameters = e.parameter || {};
  let action = parameters.action;
  
  if (!action) {
    throw new Error("Missing 'action' parameter. Ensure the endpoint URL includes ?action=...");
  }
  
  action = action.trim();
  if (action === "") {
    throw new Error("Action parameter cannot be empty.");
  }

  const payload = {};
  
  // Parse POST body safely (JSON expected from frontend)
  if (method === 'POST' && e.postData && e.postData.contents) {
    try {
      const parsedBody = JSON.parse(e.postData.contents);
      if (typeof parsedBody === 'object' && parsedBody !== null) {
        Object.assign(payload, parsedBody);
      }
    } catch (err) {
      throw new Error("Invalid JSON payload in POST body.");
    }
  }

  // Merge GET query parameters into payload (query params override body keys if collision occurs)
  for (const key in parameters) {
    if (key !== 'action') {
      payload[key] = parameters[key];
    }
  }

  return { action, payload };
}

/**
 * Main HTTP request handler wrapper.
 * Provides logging, error catching, authentication, and route execution.
 */
function _handleRequest(e, method) {
  const requestId = Utils.generateUUID();
  const startTime = Date.now();
  
  try {
    const { action, payload } = _parseRequest(e, method);
    
    // 1. Verify Action exists in Route Configuration
    const route = ROUTES[action];
    if (!route) {
      throw new Error(`Unknown action requested: '${action}'. Verify the endpoint spelling.`);
    }

    // 2. Validate HTTP Method
    if (route.method !== method) {
      throw new Error(`HTTP ${method} is not allowed for action '${action}'. Expected ${route.method}.`);
    }

    // 3. Handle Authentication (if protected route)
    if (route.auth) {
      const token = payload.token || "";
      const authCheck = Auth.validateSession(token);
      if (!authCheck.valid) {
        Utils.log("AUTH_FAILED", "Router", requestId, `Unauthorized access attempt on action: ${action}`);
        return Utils.buildError("Unauthorized. Please log in.");
      }
    }

    // 4. Execute Business Logic Handler
    const response = route.handler(payload);
    
    // 5. Log Success Execution
    const execTime = Date.now() - startTime;
    // We omit logging the full payload here to prevent accidentally logging sensitive PINs/Tokens.
    Utils.log("ROUTER_SUCCESS", "Router", requestId, `Action: ${action} | Method: ${method} | ExecTime: ${execTime}ms`);
    
    return response;

  } catch (err) {
    const execTime = Date.now() - startTime;
    const errorMsg = err.message || "Internal server error";
    
    // Fallback error logging 
    Utils.log("ROUTER_ERROR", "Router", requestId, `ExecTime: ${execTime}ms | Error: ${errorMsg}`);
    
    // Return structured, sanitized JSON error response to client (No stack traces)
    return Utils.buildError(errorMsg);
  }
}

/**
 * Health check endpoint implementation.
 * Provides basic system status without requiring authentication.
 */
function getHealth() {
  const data = {
    app: (typeof CONFIG !== 'undefined' && CONFIG.APP_NAME) ? CONFIG.APP_NAME : "RupeeTrail",
    version: (typeof CONFIG !== 'undefined' && CONFIG.VERSION) ? CONFIG.VERSION : "1.0.0",
    timestamp: Utils.getTimestamp(),
    status: "healthy",
    environment: "production"
  };
  return Utils.buildSuccess(data);
}
