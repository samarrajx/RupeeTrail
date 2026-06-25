/**
 * Account.gs
 * Handles CRUD operations and business logic for Accounts.
 * Ensures strict balance integrity and referential safeguards.
 * Schema: account_id, name, type, opening_balance, current_balance, icon, color, is_active
 */

const Account = {

  /**
   * Internal helper to load and index all accounts in one pass.
   * Prevents repeated sheet iterations.
   */
  _getAccountData: function() {
    const data = Utils.readSheetData("Accounts");
    const map = {};
    for (let i = 0; i < data.length; i++) {
      map[data[i].account_id] = data[i];
    }
    return { data, map };
  },

  /**
   * Fetches the list of accounts.
   */
  getAccounts: function(payload) {
    const { data } = this._getAccountData();
    const activeOnly = payload && payload.activeOnly !== false;
    
    const accounts = [];
    for (let i = 0; i < data.length; i++) {
      if (activeOnly && String(data[i].is_active).toUpperCase() !== "TRUE") {
        continue;
      }
      
      accounts.push({
        id: data[i].account_id,
        name: data[i].name,
        type: data[i].type,
        opening_balance: Number(data[i].opening_balance),
        balance: Number(data[i].current_balance),
        icon: data[i].icon,
        theme: data[i].color // mapped to 'theme' in frontend
      });
    }
    
    return Utils.buildSuccess(accounts);
  },

  /**
   * Creates a new account.
   */
  createAccount: function(payload) {
    const account = payload.account;
    if (!account) throw new Error("Account payload is missing.");

    Utils.validateRequired(account, ['name', 'balance']);
    
    const sanitizedName = Utils.sanitizeString(account.name);
    if (sanitizedName === "") throw new Error("Account name cannot be empty.");

    const { data } = this._getAccountData();
    const lowerName = sanitizedName.toLowerCase();
    
    // Prevent duplicate active names
    for (let i = 0; i < data.length; i++) {
      if (String(data[i].name).toLowerCase() === lowerName && 
          String(data[i].is_active).toUpperCase() === "TRUE") {
        throw new Error("An active account with this name already exists.");
      }
    }

    const initialBalance = Utils.validateNumber(account.balance);
    const id = "ACC-" + Utils.generateUUID();
    
    const row = [
      id,
      sanitizedName,
      Utils.sanitizeString(account.type || "Custom"),
      initialBalance, // opening_balance
      initialBalance, // current_balance
      account.icon || "🏦",
      Utils.sanitizeString(account.theme || "blue"),
      "TRUE"
    ];
    
    Utils.writeRow("Accounts", row);
    Utils.log("ACC_CREATE", "Account", id, `Created: ${sanitizedName}`);
    Utils.invalidateCache("dashboard_summary");
    
    account.id = id;
    return Utils.buildSuccess(account);
  },

  /**
   * Edits an existing account.
   */
  editAccount: function(payload) {
    const id = payload.id;
    const account = payload.account;
    Utils.validateRequired(payload, ['id', 'account']);
    
    const { data, map } = this._getAccountData();
    const currentObj = map[id];
    
    if (!currentObj) {
      throw new Error("Account not found.");
    }
    
    const newName = account.name !== undefined ? Utils.sanitizeString(account.name) : currentObj.name;
    if (newName === "") throw new Error("Account name cannot be empty.");
    
    const lowerName = newName.toLowerCase();

    // Enforce name uniqueness on edit
    for (let i = 0; i < data.length; i++) {
      if (data[i].account_id !== id && 
          String(data[i].name).toLowerCase() === lowerName && 
          String(data[i].is_active).toUpperCase() === "TRUE") {
        throw new Error("An active account with this name already exists.");
      }
    }

    const row = [
      id,
      newName,
      account.type !== undefined ? Utils.sanitizeString(account.type) : currentObj.type,
      currentObj.opening_balance, // Opening balance remains locked structurally
      account.balance !== undefined ? Utils.validateNumber(account.balance) : currentObj.current_balance,
      account.icon !== undefined ? Utils.sanitizeString(account.icon) : currentObj.icon,
      account.theme !== undefined ? Utils.sanitizeString(account.theme) : currentObj.color,
      currentObj.is_active
    ];

    Utils.updateRow("Accounts", currentObj._rowIndex, row);
    Utils.log("ACC_EDIT", "Account", id, `Updated: ${newName}`);
    Utils.invalidateCache("dashboard_summary");

    account.id = id;
    return Utils.buildSuccess(account);
  },

  /**
   * Deletes an account if it has no associated transactions.
   */
  deleteAccount: function(payload) {
    const id = payload.id;
    Utils.validateRequired(payload, ['id']);
    
    const { map } = this._getAccountData();
    const currentObj = map[id];
    
    if (!currentObj) {
      throw new Error("Account not found.");
    }

    // Strict validation: Prevent deleting if transactions are linked
    const txs = Utils.readSheetData("Transactions");
    let hasTxs = false;
    
    for (let i = 0; i < txs.length; i++) {
      if (txs[i].account_id === id || txs[i].transfer_account_id === id) {
        hasTxs = true;
        break;
      }
    }
    
    if (hasTxs) {
      throw new Error("Cannot delete an account with linked transactions. Please archive/deactivate it, or delete its transactions first.");
    }

    Utils.deleteRow("Accounts", currentObj._rowIndex);
    Utils.log("ACC_DELETE", "Account", id, "Account permanently removed");
    Utils.invalidateCache("dashboard_summary");
    
    return Utils.buildSuccess({ message: "Account deleted successfully." });
  },

  /**
   * Internal helper to securely update balance.
   */
  updateBalance: function(accountId, deltaAmount) {
    if (!accountId) throw new Error("Account ID is required for balance update.");
    if (deltaAmount === undefined || isNaN(deltaAmount)) throw new Error("Invalid delta amount.");

    const delta = Number(deltaAmount);
    // Ignore 0 updates to save I/O
    if (delta === 0) return;

    const { map } = this._getAccountData();
    const currentObj = map[accountId];
    
    if (!currentObj) {
      throw new Error(`Account not found: ${accountId}`);
    }
    
    const newBalance = Number(currentObj.current_balance) + delta;
    
    const row = [
      currentObj.account_id,
      currentObj.name,
      currentObj.type,
      currentObj.opening_balance,
      newBalance,
      currentObj.icon,
      currentObj.color,
      currentObj.is_active
    ];
    
    Utils.updateRow("Accounts", currentObj._rowIndex, row);
  },

  /**
   * Handles money transfer between two accounts.
   */
  transfer: function(payload) {
    Utils.validateRequired(payload, ['fromAccountId', 'toAccountId', 'amount']);
    
    const fromId = String(payload.fromAccountId);
    const toId = String(payload.toAccountId);
    const amount = Utils.validateNumber(payload.amount);
    
    if (fromId === toId) {
      throw new Error("Cannot transfer to the same account.");
    }
    if (amount <= 0) {
      throw new Error("Transfer amount must be positive.");
    }
    
    const { map } = this._getAccountData();
    const fromAcc = map[fromId];
    const toAcc = map[toId];
    
    if (!fromAcc || !toAcc) {
      throw new Error("One or both accounts were not found.");
    }
    
    if (Number(fromAcc.current_balance) < amount) {
      throw new Error("Insufficient funds in the source account for this transfer.");
    }

    // Add transaction record
    const txId = "TXN-" + Utils.generateUUID();
    const ts = Utils.getTimestamp();
    const row = [
      txId,
      Utils.formatDate(ts),
      "Transfer",
      amount,
      "CAT-TRANSFER",
      fromId,
      toId,
      "Transfer",
      Utils.sanitizeString(payload.note || "Transfer"),
      "transfer",
      ts,
      ts
    ];
    
    // Write Transaction
    try {
      Utils.writeRow("Transactions", row);
    } catch(e) {
      throw new Error(`Transfer failed during transaction write: ${e.message}`);
    }

    // Update balances. Doing this sequentially. 
    try {
      this.updateBalance(fromId, -amount);
      this.updateBalance(toId, amount);
    } catch(e) {
      // If balance update fails after writing the transaction, it's a critical error requiring manual intervention,
      // but apps script doesn't have true multi-sheet transactions. We log a massive critical error.
      Utils.log("CRITICAL_SYNC_ERROR", "Transfer", txId, `Failed to update balances after writing TXN. ${e.message}`);
      throw new Error("Transfer partially failed. Please contact support.");
    }

    Utils.log("ACC_TRANSFER", "Account", fromId, `Transferred ${amount} to ${toId}`);
    Utils.invalidateCache("dashboard_summary");
    
    return Utils.buildSuccess({ message: "Transfer successful.", transactionId: txId });
  }

};
