// state.js - Centralized Data Management and Cache

window.State = (() => {
  const CACHE_PREFIX = 'rupeetrail_data_';
  const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  // Internal cache helper
  function getFromCache(key) {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp > CACHE_EXPIRY_MS) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return parsed.data;
    } catch {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
  }

  function setInCache(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn("Local storage full or error", e);
    }
  }

  function clearCache() {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }

  // --- Actions ---

  async function fetchAccounts(force = false) {
    if (!force) {
      const cached = getFromCache('accounts');
      if (cached && Array.isArray(cached)) return cached;
    }

    if (!navigator.onLine) {
      const cached = getFromCache('accounts');
      return Array.isArray(cached) ? cached : [];
    }

    try {
      const res = await window.api.getAccounts();
      const data = (res.data && Array.isArray(res.data.data)) ? res.data.data : (res.data || res || []);
      setInCache('accounts', data);
      return data;
    } catch (err) {
      console.error(err);
      window.UI.showToast("Failed to fetch accounts", "error");
      return getFromCache('accounts') || [];
    }
  }

  async function fetchCategories(force = false) {
    if (!force) {
      const cached = getFromCache('categories');
      if (cached && Array.isArray(cached)) return cached;
    }

    if (!navigator.onLine) {
      const cached = getFromCache('categories');
      return Array.isArray(cached) ? cached : [];
    }

    try {
      const res = await window.api.getCategories();
      const data = (res.data && Array.isArray(res.data.data)) ? res.data.data : (res.data || res || []);
      setInCache('categories', data);
      return data;
    } catch (err) {
      console.error(err);
      window.UI.showToast("Failed to fetch categories", "error");
      return getFromCache('categories') || [];
    }
  }

  async function fetchTransactions(force = false) {
    if (!force) {
      const cached = getFromCache('transactions');
      if (cached && Array.isArray(cached)) return cached;
    }

    if (!navigator.onLine) {
      const cached = getFromCache('transactions');
      return Array.isArray(cached) ? cached : [];
    }

    try {
      const res = await window.api.getTransactions();
      const data = (res.data && Array.isArray(res.data.data)) ? res.data.data : (res.data || res || []);
      setInCache('transactions', data);
      return data;
    } catch (err) {
      console.error(err);
      window.UI.showToast("Failed to fetch transactions", "error");
      return getFromCache('transactions') || [];
    }
  }

  async function addTransaction(tx) {
    if (!navigator.onLine) {
      window.OfflineSync.enqueueRequest('addTransaction', tx);
      return tx; 
    }
    try {
      const res = await window.api.addTransaction(tx);
      clearCache(); // Invalidate cache
      window.UI.showToast("Transaction saved", "success");
      return res.data || res;
    } catch (e) {
      window.UI.showToast("Error saving transaction", "error");
      throw e;
    }
  }

  async function updateTransaction(id, tx) {
    if (!navigator.onLine) {
      window.OfflineSync.enqueueRequest('updateTransaction', { id, data: tx });
      return tx;
    }
    try {
      const res = await window.api.updateTransaction(id, tx);
      clearCache();
      window.UI.showToast("Transaction updated", "success");
      return res.data || res;
    } catch (e) {
      window.UI.showToast("Error updating transaction", "error");
      throw e;
    }
  }

  async function deleteTransaction(id) {
    if (!navigator.onLine) {
      window.OfflineSync.enqueueRequest('deleteTransaction', { id });
      return;
    }
    try {
      await window.api.deleteTransaction(id);
      clearCache();
      window.UI.showToast("Transaction deleted", "success");
    } catch (e) {
      window.UI.showToast("Error deleting transaction", "error");
      throw e;
    }
  }

  async function addAccount(acc) {
    if (!navigator.onLine) {
      window.OfflineSync.enqueueRequest('addAccount', acc);
      return acc;
    }
    try {
      const res = await window.api.addAccount(acc);
      clearCache();
      window.UI.showToast("Account saved", "success");
      return res.data || res;
    } catch (e) {
      window.UI.showToast("Error saving account", "error");
      throw e;
    }
  }

  async function updateAccount(id, acc) {
    if (!navigator.onLine) {
      window.OfflineSync.enqueueRequest('updateAccount', { id, data: acc });
      return acc;
    }
    try {
      const res = await window.api.updateAccount(id, acc);
      clearCache();
      window.UI.showToast("Account updated", "success");
      return res.data || res;
    } catch (e) {
      window.UI.showToast("Error updating account", "error");
      throw e;
    }
  }

  async function deleteAccount(id) {
    if (!navigator.onLine) {
      window.OfflineSync.enqueueRequest('deleteAccount', { id });
      return;
    }
    try {
      await window.api.deleteAccount(id);
      clearCache();
      window.UI.showToast("Account deleted", "success");
    } catch (e) {
      window.UI.showToast("Error deleting account", "error");
      throw e;
    }
  }

  return {
    fetchAccounts,
    fetchCategories,
    fetchTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addAccount,
    updateAccount,
    deleteAccount,
    clearCache
  };
})();
