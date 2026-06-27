// state.js - Centralized Data Management with Stale-While-Revalidate (SWR) Cache

window.State = (() => {
  const CACHE_PREFIX = 'rupeetrail_data_';
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — we background-refresh anyway

  // ─── Cache Helpers ─────────────────────────────────────────────────────────

  function getRaw(key) {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function getCached(key) {
    const entry = getRaw(key);
    return (entry && Array.isArray(entry.data)) ? entry.data : null;
  }

  function hasCached(key) {
    return getCached(key) !== null;
  }

  function isStale(key) {
    const entry = getRaw(key);
    if (!entry) return true;
    return (Date.now() - entry.timestamp) > CACHE_TTL_MS;
  }

  function setInCache(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('[State] localStorage write failed:', e);
    }
  }

  function clearCache() {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    });
  }

  // ─── Sync Indicator ────────────────────────────────────────────────────────

  let syncTimer = null;

  function showSyncing() {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    el.textContent = '\u21BB Syncing';
    el.classList.add('visible', 'syncing');
    el.classList.remove('done');
  }

  function showSynced() {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    el.textContent = '\u2713 Updated';
    el.classList.remove('syncing');
    el.classList.add('done');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      el.classList.remove('visible', 'done');
    }, 2000);
  }

  function hideSyncIndicator() {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    el.classList.remove('visible', 'syncing', 'done');
  }

  // ─── SWR Core ──────────────────────────────────────────────────────────────

  function normaliseResponse(res) {
    if (res && res.data && Array.isArray(res.data.data)) return res.data.data;
    if (res && Array.isArray(res.data)) return res.data;
    if (Array.isArray(res)) return res;
    return [];
  }

  /**
   * fetchWithSWR(key, apiFn, callbacks)
   *
   * 1. If cache exists  -> call callbacks.onCache(data) immediately (instant render)
   * 2. If stale/missing -> hit API, then call callbacks.onFresh(data)
   * 3. If offline       -> return cached data only
   */
  async function fetchWithSWR(key, apiFn, callbacks = {}) {
    const cached = getCached(key);
    const stale  = isStale(key);

    // Step 1: Serve cache immediately
    if (cached) {
      if (callbacks.onCache) callbacks.onCache(cached);
      if (!stale) return cached; // Cache is still fresh, skip network
    }

    // Step 2: Offline fallback
    if (!navigator.onLine) {
      if (!cached && callbacks.onCache) callbacks.onCache([]);
      return cached || [];
    }

    // Step 3: Background network fetch
    showSyncing();
    try {
      const res  = await apiFn();
      const data = normaliseResponse(res);

      setInCache(key, data);

      if (callbacks.onFresh) {
        callbacks.onFresh(data);
        showSynced();
      } else {
        hideSyncIndicator();
      }
      return data;
    } catch (err) {
      console.error('[State] fetch failed for "' + key + '":', err);
      hideSyncIndicator();
      if (!cached) window.UI.showToast('Failed to load ' + key, 'error');
      return cached || [];
    }
  }

  // ─── Public Fetch Methods ──────────────────────────────────────────────────
  //
  // Two calling styles supported:
  //
  //   Classic await (blocks if no cache):
  //     const data = await State.fetchTransactions();
  //
  //   SWR callbacks (instant cache + background refresh):
  //     State.fetchTransactions({ onCache: render, onFresh: render });

  function fetchTransactions(optionsOrForce) {
    if (optionsOrForce === true) {
      clearCache();
      return fetchWithSWR('transactions', () => window.api.getTransactions());
    }
    const cb = (optionsOrForce && typeof optionsOrForce === 'object') ? optionsOrForce : {};
    return fetchWithSWR('transactions', () => window.api.getTransactions(), cb);
  }

  function fetchAccounts(optionsOrForce) {
    if (optionsOrForce === true) {
      clearCache();
      return fetchWithSWR('accounts', () => window.api.getAccounts());
    }
    const cb = (optionsOrForce && typeof optionsOrForce === 'object') ? optionsOrForce : {};
    return fetchWithSWR('accounts', () => window.api.getAccounts(), cb);
  }

  function fetchCategories(optionsOrForce) {
    if (optionsOrForce === true) {
      clearCache();
      return fetchWithSWR('categories', () => window.api.getCategories());
    }
    const cb = (optionsOrForce && typeof optionsOrForce === 'object') ? optionsOrForce : {};
    return fetchWithSWR('categories', () => window.api.getCategories(), cb);
  }

  // ─── Mutation Methods ──────────────────────────────────────────────────────

  async function addTransaction(tx) {
    if (!navigator.onLine) {
      window.OfflineSync.enqueueRequest('addTransaction', tx);
      return tx;
    }
    try {
      const res = await window.api.addTransaction(tx);
      clearCache();
      return res.data || res;
    } catch (e) {
      window.UI.showToast('Error saving transaction', 'error');
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
      return res.data || res;
    } catch (e) {
      window.UI.showToast('Error updating transaction', 'error');
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
    } catch (e) {
      window.UI.showToast('Error deleting transaction', 'error');
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
      return res.data || res;
    } catch (e) {
      window.UI.showToast('Error saving account', 'error');
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
      return res.data || res;
    } catch (e) {
      window.UI.showToast('Error updating account', 'error');
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
    } catch (e) {
      window.UI.showToast('Error deleting account', 'error');
      throw e;
    }
  }

  return {
    fetchTransactions,
    fetchAccounts,
    fetchCategories,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addAccount,
    updateAccount,
    deleteAccount,
    clearCache,
    getCached,
    hasCached,
  };
})();
