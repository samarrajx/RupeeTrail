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

    // Touch Drag to Close
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    sheet.ontouchstart = (e) => {
        if (e.target.closest('.bottom-sheet-body')) return;
        startY = e.touches[0].clientY;
        isDragging = true;
        sheet.style.transition = 'none';
    };

    sheet.ontouchmove = (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const dragDistance = currentY - startY;
        if (dragDistance > 0) {
            sheet.style.transform = `translateY(${dragDistance}px)`;
        }
    };

    sheet.ontouchend = () => {
        if (!isDragging) return;
        isDragging = false;
        const dragDistance = currentY - startY;
        sheet.style.transition = 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)';
        
        if (dragDistance > 80) {
            closeSheet();
        } else {
            sheet.style.transform = 'translateY(0)';
            setTimeout(() => {
                if (activeModal && activeModal.sheet === sheet) {
                    sheet.style.transform = '';
                    sheet.style.transition = '';
                }
            }, 250);
        }
    };
  }

  function closeSheet() {
    if (!activeModal) return;
    activeModal.sheet.style.transform = '';
    activeModal.sheet.style.transition = '';
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

  function showConfirm(title, message, onConfirm) {
    let overlay = document.getElementById('confirmOverlay');
    let sheet = document.getElementById('confirmSheet');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'confirmOverlay';
        overlay.className = 'bottom-sheet-overlay';
        
        sheet = document.createElement('div');
        sheet.id = 'confirmSheet';
        sheet.className = 'bottom-sheet';
        sheet.innerHTML = `
            <div class="bottom-sheet-header">
                <h3 id="confirmTitle" class="bottom-sheet-title"></h3>
            </div>
            <div class="bottom-sheet-body">
                <p id="confirmMessage" style="margin-bottom: var(--space-6);"></p>
                <div style="display: flex; gap: var(--space-4);">
                    <button class="btn btn-secondary" style="flex:1;" onclick="UI.closeSheet()">Cancel</button>
                    <button id="confirmBtn" class="btn btn-primary" style="flex:1; background: var(--color-danger); border-color: var(--color-danger);">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.appendChild(sheet);
    }
    
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    
    const confirmBtn = document.getElementById('confirmBtn');
    confirmBtn.onclick = () => {
        closeSheet();
        if (onConfirm) onConfirm();
    };
    
    openSheet('confirmOverlay', 'confirmSheet');
  }

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

  function toggleUserDropdown(e) {
      if (e) {
          e.stopPropagation();
      }
      const popover = document.getElementById('userPopover');
      if (popover) {
          popover.classList.toggle('active');
      }
  }

  document.addEventListener('click', (e) => {
      const popover = document.getElementById('userPopover');
      if (popover && popover.classList.contains('active') && !e.target.closest('.user-popover-container')) {
          popover.classList.remove('active');
      }
  });

  function navigateTo(url) {
      document.body.style.transition = 'opacity 150ms ease-out, transform 150ms ease-out';
      document.body.style.opacity = '0';
      document.body.style.transform = 'translateY(6px)';
      setTimeout(() => {
          window.location.href = url;
      }, 150);
  }

  return {
    showToast,
    openSheet,
    closeSheet,
    getEmptyStateHTML,
    debounce,
    formatCurrency,
    escapeHtml,
    logout,
    toggleUserDropdown,
    navigateTo,
    showConfirm
  };
})();
