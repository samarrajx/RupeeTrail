// ui.js - Global UI Utilities (Toasts, Modals, Interactions, Skeletons)

window.UI = (() => {
  // --- Toast System ---
  const toastQueue = [];
  let isToastActive = false;

  function createToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type = 'info', duration = 3000) {
    toastQueue.push({ message, type, duration });
    processToastQueue();
  }

  function processToastQueue() {
    if (isToastActive || toastQueue.length === 0) return;
    isToastActive = true;
    
    const { message, type, duration } = toastQueue.shift();
    const container = createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Icons
    let icon = 'bx-info-circle';
    if (type === 'success') icon = 'bx-check-circle';
    if (type === 'error') icon = 'bx-x-circle';
    if (type === 'warning') icon = 'bx-error';

    toast.innerHTML = `<i class='bx ${icon}' style="font-size: 1.5rem;"></i><span>${message}</span>`;
    
    // Swipe to dismiss setup
    let startX = 0;
    toast.addEventListener('touchstart', e => startX = e.touches[0].clientX, { passive: true });
    toast.addEventListener('touchmove', e => {
      const diffX = e.touches[0].clientX - startX;
      if (diffX > 50) dismissToast(toast); // Swipe right to dismiss
    }, { passive: true });

    container.appendChild(toast);

    setTimeout(() => {
      dismissToast(toast);
    }, duration);
  }

  function dismissToast(toast) {
    if (toast.classList.contains('toast-closing')) return;
    toast.classList.add('toast-closing');
    toast.addEventListener('animationend', () => {
      toast.remove();
      isToastActive = false;
      processToastQueue();
    }, { once: true });
  }

  // --- Modals & Bottom Sheets ---
  let activeModal = null;
  let previousFocus = null;

  function openSheet(overlayId, sheetId) {
    const overlay = document.getElementById(overlayId);
    const sheet = document.getElementById(sheetId);
    if (!overlay || !sheet) return;

    previousFocus = document.activeElement;
    overlay.classList.add('active');
    sheet.classList.add('active');
    activeModal = { overlay, sheet };
    
    // Trap Focus roughly
    const focusableElements = sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusableElements.length) focusableElements[0].focus();
  }

  function closeSheet() {
    if (!activeModal) return;
    activeModal.overlay.classList.remove('active');
    activeModal.sheet.classList.remove('active');
    activeModal = null;
    if (previousFocus) previousFocus.focus();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeModal) {
      closeSheet();
    }
  });

  // --- Empty States ---
  function getEmptyStateHTML(title, subtitle, svgPath) {
    return `
      <div class="empty-state animate-fade-in">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${svgPath}
        </svg>
        <p style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">${title}</p>
        <p style="font-size: var(--font-size-sm);">${subtitle}</p>
      </div>
    `;
  }

  // --- Utilities ---
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => { clearTimeout(timeout); func(...args); };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function formatCurrency(num) {
    let sym = '₹';
    let fmt = 'en-IN';
    try {
      const stored = localStorage.getItem('rupeetrail_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.currencySymbol) sym = parsed.currencySymbol;
        if (parsed.numberFormat) fmt = parsed.numberFormat;
      }
    } catch(e) {}
    return sym + Number(num).toLocaleString(fmt);
  }

  function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  async function logout() {
    try {
        if (window.api && window.api.logout) await window.api.logout();
    } catch (e) {
        console.error("Logout API failed, continuing local logout", e);
    }
    localStorage.removeItem('rupeetrail_auth_token');
    window.location.href = 'index.html';
  }

  return {
    showToast,
    openSheet,
    closeSheet,
    getEmptyStateHTML,
    debounce,
    formatCurrency,
    escapeHtml,
    logout
  };
})();
