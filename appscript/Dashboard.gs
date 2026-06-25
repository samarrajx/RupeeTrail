/**
 * Dashboard.gs
 * Handles aggregating and caching highly optimized metrics for the main dashboard.
 */

const Dashboard = {

  /**
   * Orchestrates the dashboard fetch, leveraging CacheService safely.
   */
  getDashboard: function(payload) {
    const startTime = Date.now();
    const forceRefresh = payload && payload.forceRefresh === true;
    const cacheKey = "dashboard_summary";
    
    if (!forceRefresh) {
      const cached = Utils.getCache(cacheKey);
      if (cached) {
        Utils.log("DASHBOARD_CACHE", "System", "Hit", `Loaded in ${Date.now() - startTime}ms`);
        return Utils.buildSuccess(cached);
      }
    }
    
    // Cache miss or force refresh
    const data = this._computeDashboardData();
    Utils.setCache(cacheKey, data);
    
    Utils.log(
      forceRefresh ? "DASHBOARD_FORCE_REFRESH" : "DASHBOARD_CACHE", 
      "System", 
      forceRefresh ? "Refresh" : "Miss", 
      `Computed in ${Date.now() - startTime}ms`
    );
    
    return Utils.buildSuccess(data);
  },

  /**
   * Internally computes all metrics by parsing Transactions natively.
   */
  _computeDashboardData: function() {
    const transactions = Utils.readSheetData("Transactions");
    const accounts = Utils.readSheetData("Accounts");
    const categories = Utils.readSheetData("Categories");
    
    // Time boundaries (calculated once to save memory)
    const now = new Date();
    const currentMonthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0');
    const todayStr = now.toISOString().split('T')[0];
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);
    const oneWeekAgoTime = oneWeekAgo.getTime();
    
    // Account Aggregation Map
    let totalBalance = 0;
    const activeAccounts = [];
    
    for (let i = 0; i < accounts.length; i++) {
      if (String(accounts[i].is_active).toUpperCase() === "TRUE") {
        const bal = Number(accounts[i].current_balance) || 0;
        totalBalance += bal;
        activeAccounts.push({
          id: accounts[i].account_id,
          name: accounts[i].name,
          balance: bal,
          theme: accounts[i].color
        });
      }
    }
    
    // Fast O(1) Category Mapping
    const catMap = {};
    for (let i = 0; i < categories.length; i++) {
      catMap[categories[i].category_id] = { 
        name: categories[i].name, 
        color: categories[i].color 
      };
    }
    
    let monthlyExpense = 0;
    let monthlyIncome = 0;
    let weeklyExpense = 0;
    let todayExpense = 0;
    
    const categorySpending = {};
    const dailyTrendMap = {};
    const recentTxBuffer = [];

    // Parse Transactions
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      
      // Safety guards against entirely corrupted rows
      if (!tx.date || !tx.type || isNaN(Number(tx.amount))) continue;
      
      const type = String(tx.type).toLowerCase();
      const amount = Number(tx.amount);
      const dateStr = Utils.formatDate(tx.date);
      const monthStr = dateStr.substring(0, 7);
      
      // We parse Date only once per row safely
      const txDateObj = new Date(tx.date);
      const txTime = txDateObj.getTime();
      
      // Push ALL valid transactions into buffer for true chronological sorting later
      recentTxBuffer.push({
        id: tx.transaction_id,
        title: tx.note || "",
        amount: amount,
        type: type,
        date: dateStr,
        timestamp: txTime,
        category: catMap[tx.category_id] ? catMap[tx.category_id].name : "Other"
      });
      
      if (monthStr === currentMonthStr) {
        if (type === 'expense') {
          monthlyExpense += amount;
          
          if (!categorySpending[tx.category_id]) categorySpending[tx.category_id] = 0;
          categorySpending[tx.category_id] += amount;
          
          if (!dailyTrendMap[dateStr]) dailyTrendMap[dateStr] = 0;
          dailyTrendMap[dateStr] += amount;
        } else if (type === 'income') {
          monthlyIncome += amount;
        }
        // Strict Isolation: 'transfer' types are explicitly ignored in income/expense tracking
      }
      
      if (type === 'expense') {
        if (dateStr === todayStr) {
          todayExpense += amount;
        }
        if (txTime >= oneWeekAgoTime) {
          weeklyExpense += amount;
        }
      }
    }
    
    const savings = monthlyIncome - monthlyExpense;
    
    // Sort transactions chronologically, newest first, then limit to top 5
    recentTxBuffer.sort((a, b) => b.timestamp - a.timestamp);
    const recentTransactions = recentTxBuffer.slice(0, 5).map(tx => {
      // Remove timestamp to match strict API payload output
      const cleanTx = { ...tx };
      delete cleanTx.timestamp;
      return cleanTx;
    });
    
    // Format top categories descending
    const topCategories = [];
    for (const cId in categorySpending) {
      topCategories.push({
        categoryId: cId,
        name: catMap[cId] ? catMap[cId].name : "Other",
        color: catMap[cId] ? catMap[cId].color : "#999",
        amount: categorySpending[cId]
      });
    }
    topCategories.sort((a, b) => b.amount - a.amount);
    
    // Build daily trend array safely respecting leap years/days natively
    const dailyTrend = [];
    // Calculate accurate days in current month safely
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = currentMonthStr + "-" + String(d).padStart(2, '0');
      dailyTrend.push({
        date: dStr,
        amount: dailyTrendMap[dStr] || 0
      });
    }

    return {
      summary: {
        totalBalance: totalBalance,
        monthlyExpense: monthlyExpense,
        monthlyIncome: monthlyIncome,
        weeklyExpense: weeklyExpense,
        todayExpense: todayExpense,
        savings: savings
      },
      accounts: activeAccounts,
      recentTransactions: recentTransactions,
      topCategories: topCategories,
      charts: {
        dailyTrend: dailyTrend
      }
    };
  }

};
