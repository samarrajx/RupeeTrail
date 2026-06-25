/**
 * Transaction.gs
 * Handles CRUD operations and business logic for Transactions.
 * Guarantees referential integrity, accurate balance application, and advanced filtering.
 * Schema: transaction_id, date, type, amount, category_id, account_id, transfer_account_id, payment_mode, note, tags, created_at, updated_at
 */

const Transaction = {

  /**
   * Internal helper to load related Maps exactly once.
   * Prevents repeated sheet iterations during validations.
   */
  _getReferenceMaps: function() {
    const cats = Utils.readSheetData("Categories");
    const accs = Utils.readSheetData("Accounts");
    
    const catMap = {};
    for (let i = 0; i < cats.length; i++) {
      catMap[cats[i].category_id] = cats[i].name;
      catMap[String(cats[i].name).toLowerCase()] = cats[i].category_id;
    }
    
    const accMap = {};
    for (let i = 0; i < accs.length; i++) {
      accMap[accs[i].account_id] = accs[i].name;
    }

    return { catMap, accMap };
  },

  /**
   * Ensures the category ID resolves correctly.
   */
  _resolveCategoryId: function(categoryNameOrId, catMap) {
    if (!categoryNameOrId) return "CAT-GENERIC";
    const str = String(categoryNameOrId);
    if (catMap[str]) return str; // It's an exact ID match
    const lower = str.toLowerCase();
    if (catMap[lower]) return catMap[lower]; // It's a name match
    return "CAT-GENERIC"; 
  },

  /**
   * Safely applies balance impact for a transaction.
   * Throws error if accounts don't exist.
   */
  _applyBalance: function(type, amount, accId, transferAccId, accMap) {
    if (!accMap[accId]) {
      throw new Error(`Invalid Account ID: ${accId}`);
    }

    if (type === 'expense') {
      Account.updateBalance(accId, -amount);
    } else if (type === 'income') {
      Account.updateBalance(accId, amount);
    } else if (type === 'transfer') {
      if (!transferAccId || !accMap[transferAccId]) {
        throw new Error(`Invalid Transfer Destination Account ID: ${transferAccId}`);
      }
      if (accId === transferAccId) {
        throw new Error("Cannot transfer to the same account.");
      }
      Account.updateBalance(accId, -amount);
      Account.updateBalance(transferAccId, amount);
    }
  },

  /**
   * Reverts balance impact for a transaction (used during edits and deletions).
   */
  _revertBalance: function(type, amount, accId, transferAccId) {
    if (type === 'expense') {
      Account.updateBalance(accId, amount);
    } else if (type === 'income') {
      Account.updateBalance(accId, -amount);
    } else if (type === 'transfer') {
      Account.updateBalance(accId, amount);
      if (transferAccId) {
        Account.updateBalance(transferAccId, -amount);
      }
    }
  },

  /**
   * Fetches, filters, sorts, and paginates transactions.
   */
  getTransactions: function(payload) {
    const data = Utils.readSheetData("Transactions");
    const { catMap } = this._getReferenceMaps();
    
    // Fallback safely if filter/sort object doesn't exist
    const filters = payload.filter || {};
    const sort = payload.sort || {};

    const filterType = filters.type ? String(filters.type).toLowerCase() : 'all';
    const filterSearch = filters.search ? String(filters.search).toLowerCase() : '';
    const filterAccount = filters.accountId || null;
    const filterCategory = filters.categoryId || null;
    const filterStartDate = filters.startDate ? new Date(filters.startDate).getTime() : null;
    const filterEndDate = filters.endDate ? new Date(filters.endDate).getTime() : null;
    
    const results = [];
    
    for (let i = 0; i < data.length; i++) {
      const rowType = String(data[i].type).toLowerCase();
      
      // 1. Type Match
      if (filterType !== 'all' && rowType !== filterType) continue;
      
      // 2. Account Match
      if (filterAccount && data[i].account_id !== filterAccount && data[i].transfer_account_id !== filterAccount) {
        continue;
      }

      // 3. Category Match
      if (filterCategory && data[i].category_id !== filterCategory) {
        continue;
      }

      // 4. Date Match
      const rowDateTs = new Date(data[i].date).getTime();
      if (filterStartDate && rowDateTs < filterStartDate) continue;
      if (filterEndDate && rowDateTs > filterEndDate) continue;
      
      const catName = catMap[data[i].category_id] || "Unknown";
      const note = String(data[i].note || "");
      const tags = String(data[i].tags || "");
      
      // 5. Search Match
      if (filterSearch) {
        const matchNote = note.toLowerCase().includes(filterSearch);
        const matchCat = catName.toLowerCase().includes(filterSearch);
        const matchTags = tags.toLowerCase().includes(filterSearch);
        if (!matchNote && !matchCat && !matchTags) continue;
      }
      
      results.push({
        id: data[i].transaction_id,
        date: Utils.formatDate(data[i].date),
        type: rowType,
        amount: Number(data[i].amount),
        category: catName,
        categoryId: data[i].category_id,
        accountId: data[i].account_id,
        transferAccountId: data[i].transfer_account_id,
        paymentMode: data[i].payment_mode,
        title: note,
        tags: data[i].tags
      });
    }
    
    // Sort implementation
    const sortBy = sort.by ? String(sort.by).toLowerCase() : 'date';
    const sortDir = sort.dir === 'asc' ? 1 : -1;

    results.sort((a, b) => {
      let valA, valB;
      if (sortBy === 'amount') {
        valA = a.amount;
        valB = b.amount;
      } else if (sortBy === 'category') {
        valA = a.category.toLowerCase();
        valB = b.category.toLowerCase();
      } else {
        // default to date
        valA = new Date(a.date).getTime();
        valB = new Date(b.date).getTime();
      }

      if (valA < valB) return -1 * sortDir;
      if (valA > valB) return 1 * sortDir;
      return 0;
    });
    
    // Pagination via Utils
    const page = payload.page || 1;
    const limit = payload.limit || (typeof CONFIG !== 'undefined' ? CONFIG.DEFAULT_PAGINATION_LIMIT : 50);
    const paginated = Utils.paginate(results, page, limit);
    
    // Backwards compatible response with extra metadata
    return Utils.buildSuccess({
      data: paginated.items,
      total: paginated.totalItems,
      page: paginated.page,
      limit: paginated.pageSize,
      totalPages: paginated.totalPages,
      hasNext: paginated.hasNext
    });
  },

  createTransaction: function(payload) {
    const tx = payload.transaction;
    if (!tx) throw new Error("Transaction payload is missing");

    Utils.validateRequired(tx, ['amount', 'type', 'date']); 
    
    const amount = Utils.validateNumber(tx.amount);
    if (amount <= 0) throw new Error("Amount must be positive");
    
    const type = Utils.sanitizeString(tx.type).toLowerCase();
    if (type !== 'income' && type !== 'expense' && type !== 'transfer') {
      throw new Error("Invalid transaction type");
    }

    const { catMap, accMap } = this._getReferenceMaps();

    const accountId = tx.accountId || "ACC-CASH"; 
    const transferAccId = tx.transferAccountId || "";
    const catId = this._resolveCategoryId(tx.category || tx.categoryId || "Other", catMap);
    
    // Apply balance impact (This helper also validates that the accounts exist)
    this._applyBalance(type, amount, accountId, transferAccId, accMap);

    const id = "TXN-" + Utils.generateUUID();
    const ts = Utils.getTimestamp();
    
    const row = [
      id,
      Utils.formatDate(tx.date),
      type.charAt(0).toUpperCase() + type.slice(1),
      amount,
      catId,
      accountId,
      transferAccId,
      Utils.sanitizeString(tx.paymentMode || "Cash"),
      Utils.sanitizeString(tx.title || tx.note || ""),
      Utils.sanitizeString(tx.tags || ""),
      ts,
      ts
    ];
    
    Utils.writeRow("Transactions", row);
    
    Utils.log("TXN_CREATE", "Transaction", id, `Type: ${type}`);
    Utils.invalidateCache("dashboard_summary");
    
    tx.id = id;
    return Utils.buildSuccess(tx);
  },

  editTransaction: function(payload) {
    const id = payload.id;
    const tx = payload.transaction;
    Utils.validateRequired(payload, ['id', 'transaction']);
    
    const existing = Utils.readSheetData("Transactions");
    let currentObj = null;
    let idx = -1;

    for (let i = 0; i < existing.length; i++) {
      if (existing[i].transaction_id === id) {
        currentObj = existing[i];
        idx = existing[i]._rowIndex;
        break;
      }
    }
    
    if (idx === -1 || !currentObj) throw new Error("Transaction not found");

    const oldAmount = Number(currentObj.amount);
    const oldType = String(currentObj.type).toLowerCase();
    const oldAccountId = currentObj.account_id;
    const oldTransferAccId = currentObj.transfer_account_id;
    
    const newAmount = tx.amount !== undefined ? Utils.validateNumber(tx.amount) : oldAmount;
    const newType = tx.type !== undefined ? Utils.sanitizeString(tx.type).toLowerCase() : oldType;
    const newAccountId = tx.accountId !== undefined ? tx.accountId : oldAccountId;
    const newTransferAccId = tx.transferAccountId !== undefined ? tx.transferAccountId : oldTransferAccId;
    
    if (newAmount <= 0) throw new Error("Amount must be positive");

    const { catMap, accMap } = this._getReferenceMaps();

    // 1. Revert old transaction balances completely
    this._revertBalance(oldType, oldAmount, oldAccountId, oldTransferAccId);

    // 2. Apply new transaction balances
    try {
      this._applyBalance(newType, newAmount, newAccountId, newTransferAccId, accMap);
    } catch(e) {
      // Rollback the revert if the new application fails (e.g. invalid account ID)
      this._applyBalance(oldType, oldAmount, oldAccountId, oldTransferAccId, accMap);
      throw new Error(`Edit failed during balance update: ${e.message}`);
    }

    let catId = currentObj.category_id;
    if (tx.category || tx.categoryId) {
      catId = this._resolveCategoryId(tx.category || tx.categoryId, catMap);
    }

    const ts = Utils.getTimestamp();
    const row = [
      id,
      tx.date ? Utils.formatDate(tx.date) : currentObj.date,
      newType.charAt(0).toUpperCase() + newType.slice(1),
      newAmount,
      catId,
      newAccountId,
      newTransferAccId,
      tx.paymentMode !== undefined ? Utils.sanitizeString(tx.paymentMode) : currentObj.payment_mode,
      tx.title !== undefined ? Utils.sanitizeString(tx.title) : currentObj.note,
      tx.tags !== undefined ? Utils.sanitizeString(tx.tags) : currentObj.tags,
      currentObj.created_at,
      ts
    ];

    Utils.updateRow("Transactions", idx, row);
    
    Utils.log("TXN_EDIT", "Transaction", id, `Updated to ${newType}`);
    Utils.invalidateCache("dashboard_summary");

    tx.id = id;
    return Utils.buildSuccess(tx);
  },

  deleteTransaction: function(payload) {
    const id = payload.id;
    Utils.validateRequired(payload, ['id']);
    
    const existing = Utils.readSheetData("Transactions");
    let currentObj = null;
    let idx = -1;

    for (let i = 0; i < existing.length; i++) {
      if (existing[i].transaction_id === id) {
        currentObj = existing[i];
        idx = existing[i]._rowIndex;
        break;
      }
    }
    
    if (idx === -1 || !currentObj) throw new Error("Transaction not found");

    const oldAmount = Number(currentObj.amount);
    const oldType = String(currentObj.type).toLowerCase();
    const oldAccountId = currentObj.account_id;
    const oldTransferAccId = currentObj.transfer_account_id;

    // Reverse balance impact safely
    this._revertBalance(oldType, oldAmount, oldAccountId, oldTransferAccId);

    Utils.deleteRow("Transactions", idx);
    
    Utils.log("TXN_DELETE", "Transaction", id, "Successfully removed");
    Utils.invalidateCache("dashboard_summary");

    return Utils.buildSuccess({ message: "Transaction deleted successfully" });
  },

  duplicateTransaction: function(payload) {
    const id = payload.id;
    Utils.validateRequired(payload, ['id']);
    
    const existing = Utils.readSheetData("Transactions");
    let currentObj = null;

    for (let i = 0; i < existing.length; i++) {
      if (existing[i].transaction_id === id) {
        currentObj = existing[i];
        break;
      }
    }
    
    if (!currentObj) throw new Error("Transaction not found to duplicate");
    
    const newTx = {
      date: Utils.today(),
      type: currentObj.type,
      amount: currentObj.amount,
      categoryId: currentObj.category_id,
      accountId: currentObj.account_id,
      transferAccountId: currentObj.transfer_account_id,
      paymentMode: currentObj.payment_mode,
      title: currentObj.note + " (Copy)",
      tags: currentObj.tags
    };

    // Forward to creation module which natively handles validations and balance application
    return this.createTransaction({ transaction: newTx });
  }

};
