// offline.js - Handles Offline Queue and Syncing

window.OfflineSync = (() => {
  const QUEUE_KEY = 'rupeetrail_offline_queue';

  function getQueue() {
    const data = localStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  }

  function saveQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    updateOfflineBanner();
  }

  function enqueueRequest(action, payload) {
    const queue = getQueue();
    queue.push({ action, payload, id: Date.now() });
    saveQueue(queue);
    window.UI.showToast('Saved offline. Will sync when online.', 'warning');
    
    // Register background sync if supported
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(registration => {
        registration.sync.register('sync-transactions').then(() => {
          console.log('[OfflineSync] Registered background sync');
        }).catch(err => {
          console.error('[OfflineSync] Background sync registration failed', err);
        });
      });
    }
  }

  function dequeueRequest(id) {
    const queue = getQueue();
    saveQueue(queue.filter(q => q.id !== id));
  }

  async function syncQueue() {
    if (!navigator.onLine) return;
    const queue = getQueue();
    if (queue.length === 0) return;

    window.UI.showToast(`Syncing ${queue.length} items...`, 'info');
    let successCount = 0;

    for (const item of queue) {
      try {
        // Attempt API request
        let res;
        if (item.action.startsWith('add')) {
          res = await window.api[item.action](item.payload);
        } else if (item.action.startsWith('update')) {
          res = await window.api[item.action](item.payload.id, item.payload.data);
        } else if (item.action.startsWith('delete')) {
          res = await window.api[item.action](item.payload.id);
        }

        dequeueRequest(item.id);
        successCount++;
      } catch (err) {
        console.error("Sync failed for item", item, err);
      }
    }

    if (successCount > 0) {
      window.UI.showToast(`Successfully synced ${successCount} items!`, 'success');
      // Trigger a re-render if data was pushed
      window.dispatchEvent(new Event('stateChanged'));
    }
  }

  function updateOfflineBanner() {
    let banner = document.getElementById('offline-banner');
    const queue = getQueue();
    
    if (!navigator.onLine || queue.length > 0) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.style.cssText = 'background: var(--color-warning); color: #fff; text-align: center; padding: 4px; font-size: 12px; font-weight: bold; position: fixed; top: 0; left: 0; right: 0; z-index: 9999;';
        document.body.appendChild(banner);
      }
      if (!navigator.onLine) {
        banner.textContent = queue.length > 0 ? `Offline - ${queue.length} items pending sync` : 'You are offline';
        banner.style.background = 'var(--color-danger)';
      } else {
        banner.textContent = `Syncing ${queue.length} pending items...`;
        banner.style.background = 'var(--color-warning)';
        syncQueue();
      }
    } else if (banner) {
      banner.remove();
    }
  }

  window.addEventListener('online', syncQueue);
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);

  // Initial check
  document.addEventListener('DOMContentLoaded', updateOfflineBanner);

  // Listen for background sync triggers from Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data && event.data.type === 'PROCESS_SYNC_QUEUE') {
        console.log('[OfflineSync] Received background sync trigger from SW');
        syncQueue();
      }
    });
  }

  return { enqueueRequest, getQueue };
})();
