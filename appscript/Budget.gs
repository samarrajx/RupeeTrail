/**
 * Budget.gs
 * Handles Budgeting logic and dynamically synchronizes with Transactions.
 * Schema: month, category_id, budget_limit, amount_spent, remaining, percentage_used
 */

const Budget = {

  /**
   * Returns current month mapped as "YYYY-MM"
   */
  _getCurrentMonthStr: function() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
  },
  
  /**
   * Returns previous month mapped as "YYYY-MM"
   */
  _getPreviousMonthStr: function() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
  },

  /**
   * Validates month format (YYYY-MM).
   * @param {string} monthStr - Month string to validate
   * @returns {string} Sanitized month string
   */
  _validateMonth: function(monthStr) {
    if (!monthStr || typeof monthStr !== 'string') {
      throw new Error("Month is required.");
    }
    const sanitized = monthStr.trim();
    if (!/^\d{4}-\d{2}$/.test(sanitized)) {
      throw new Error("Invalid month format. Expected YYYY-MM.");
    }
    return sanitized;
  },

  /**
   * Checks if category exists in database.
   */
  _categoryExists: function(categoryId) {
    const categories = Utils.readSheetData("Categories");
    for (let i = 0; i < categories.length; i++) {
      if (categories[i].category_id === categoryId) return true;
    }
    return false;
  },

  /**
   * Retrieves budget summaries, dynamically synchronized against Transactions.
   */
  getBudgets: function(payload) {
    const rawMonth = payload && payload.month ? payload.month : this._getCurrentMonthStr();
    const month = this._validateMonth(rawMonth);
    
    const data = Utils.readSheetData("Budgets");
    const categories = Utils.readSheetData("Categories");
    
    // Create map for extremely fast Category O(1) lookups
    const catMap = {};
    for (let i = 0; i < categories.length; i++) {
      catMap[categories[i].category_id] = categories[i];
    }
    
    // Calculate actual spending dynamically from live transactions
    const txs = Utils.readSheetData("Transactions");
    const spendingMap = {};
    
    for (let i = 0; i < txs.length; i++) {
      const tMonth = Utils.formatDate(txs[i].date).substring(0, 7); // Extracts YYYY-MM
      // Strictly isolate 'expense' types to avoid counting transfers or incomes
      if (tMonth === month && String(txs[i].type).toLowerCase() === 'expense') {
        const cId = txs[i].category_id;
        if (!spendingMap[cId]) spendingMap[cId] = 0;
        spendingMap[cId] += Number(txs[i].amount);
      }
    }

    const budgets = [];
    const sheet = Utils.getSheet("Budgets");
    
    for (let i = 0; i < data.length; i++) {
      if (data[i].month === month) {
        const cId = data[i].category_id;
        const limit = Number(data[i].budget_limit);
        const spent = spendingMap[cId] || 0;
        const remaining = limit - spent;
        const percent = limit > 0 ? (spent / limit) * 100 : 0;
        
        const catInfo = catMap[cId] || {};
        
        // ONLY update sheet if dynamically calculated spent is drastically out of sync
        // Floating point safety tolerance check
        if (Math.abs(Number(data[i].amount_spent) - spent) > 0.01) {
          const row = [
            month,
            cId,
            limit,
            spent,
            remaining,
            percent
          ];
          Utils.updateRow("Budgets", data[i]._rowIndex, row);
        }
        
        budgets.push({
          month: month,
          categoryId: cId,
          categoryName: catInfo.name || "Unknown",
          limit: limit,
          spent: spent,
          remaining: remaining,
          percentage: Number(percent.toFixed(1))
        });
        
        // Remove handled category from spending map
        delete spendingMap[cId]; 
      }
    }
    
    // Inject dynamic zero-limit records for categories with spending but no formal budget limit
    for (const cId in spendingMap) {
       const spent = spendingMap[cId];
       const catInfo = catMap[cId] || {};
       budgets.push({
          month: month,
          categoryId: cId,
          categoryName: catInfo.name || "Unknown",
          limit: 0,
          spent: spent,
          remaining: -spent,
          percentage: spent > 0 ? 100 : 0
       });
    }

    return Utils.buildSuccess(budgets);
  },

  /**
   * Sets or Updates a monthly budget limit for a specific category.
   */
  updateBudget: function(payload) {
    if (!payload) throw new Error("Missing payload.");
    Utils.validateRequired(payload, ['categoryId', 'limit']);
    
    const rawMonth = payload.month ? payload.month : this._getCurrentMonthStr();
    const month = this._validateMonth(rawMonth);
    const cId = String(payload.categoryId).trim();
    const limit = Utils.validateNumber(payload.limit);
    
    if (limit < 0) {
      throw new Error("Budget limit cannot be negative.");
    }
    if (!this._categoryExists(cId)) {
      throw new Error(`Referenced category does not exist: ${cId}`);
    }
    
    const data = Utils.readSheetData("Budgets");
    let idx = -1;
    let existingSpent = 0;

    for (let i = 0; i < data.length; i++) {
      if (data[i].month === month && data[i].category_id === cId) {
        idx = data[i]._rowIndex;
        existingSpent = Number(data[i].amount_spent) || 0;
        break;
      }
    }
    
    // Maintain existing spent to preserve real-time sync
    const remaining = limit - existingSpent;
    const percent = limit > 0 ? (existingSpent / limit) * 100 : 0;
    
    const row = [month, cId, limit, existingSpent, remaining, percent];
    
    if (idx !== -1) {
      Utils.updateRow("Budgets", idx, row);
    } else {
      Utils.writeRow("Budgets", row);
    }
    
    Utils.log("BUDGET_UPDATE", "Budget", cId, `Updated ${month} limit`);
    
    // Synchronize to frontend by resolving full updated budgets
    return this.getBudgets({ month: month });
  },

  /**
   * Bulk migrates budget limits from the previous calendar month.
   */
  copyPreviousMonth: function(payload) {
    // Optionally accept explicit month mapping, fallback to dynamic dates
    const currentMonth = payload && payload.month ? this._validateMonth(payload.month) : this._getCurrentMonthStr();
    
    let prevMonth = this._getPreviousMonthStr();
    // Complex mapping if the user forces an explicit target
    if (payload && payload.month) {
      const [y, m] = currentMonth.split('-');
      const d = new Date(y, Number(m) - 1, 1);
      d.setMonth(d.getMonth() - 1);
      prevMonth = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
    }
    
    const data = Utils.readSheetData("Budgets");
    const prevBudgets = [];
    let currentExists = false;
    
    for (let i = 0; i < data.length; i++) {
      if (data[i].month === prevMonth) {
        prevBudgets.push(data[i]);
      }
      if (data[i].month === currentMonth) {
        currentExists = true;
      }
    }
    
    if (currentExists) {
      throw new Error(`Budgets for ${currentMonth} already exist. Please clear them manually before attempting a bulk copy.`);
    }
    if (prevBudgets.length === 0) {
      throw new Error(`No budgets found in ${prevMonth} to copy.`);
    }
    
    const sheet = Utils.getSheet("Budgets");
    for (let i = 0; i < prevBudgets.length; i++) {
      const limit = Number(prevBudgets[i].budget_limit);
      if (limit > 0) { // Only copy logically valid limits
        // Reset dynamic spent amounts instantly to zero
        sheet.appendRow([currentMonth, prevBudgets[i].category_id, limit, 0, limit, 0]);
      }
    }
    
    Utils.log("BUDGET_COPY", "Budget", currentMonth, `Imported from ${prevMonth}`);
    
    return this.getBudgets({ month: currentMonth });
  }

};
