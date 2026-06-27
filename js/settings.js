// js/settings.js

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('rupeetrail_auth_token')) {
        window.location.href = 'index.html';
        return;
    }

    loadSettings();

    // Event Listeners
    document.getElementById('themeSelect').addEventListener('change', handleThemeChange);
    document.getElementById('saveRegionalBtn').addEventListener('click', saveRegionalSettings);
    document.getElementById('pinForm').addEventListener('submit', handlePinChange);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('clearDataBtn').addEventListener('click', handleClearData);
    
    const overlay = document.getElementById('sheetOverlay');
    if(overlay) overlay.addEventListener('click', UI.closeSheet);
});

function getSettings() {
    let settings = { theme: 'system', currencySymbol: '₹', numberFormat: 'en-IN' };
    try {
        const stored = localStorage.getItem('rupeetrail_settings');
        if (stored) settings = { ...settings, ...JSON.parse(stored) };
    } catch(e) {}
    return settings;
}

function saveSettings(newSettings) {
    const current = getSettings();
    const updated = { ...current, ...newSettings };
    localStorage.setItem('rupeetrail_settings', JSON.stringify(updated));
    return updated;
}

function loadSettings() {
    const settings = getSettings();
    document.getElementById('themeSelect').value = settings.theme;
    document.getElementById('currencySymbol').value = settings.currencySymbol;
    document.getElementById('numberFormat').value = settings.numberFormat;
    applyTheme(settings.theme);
}

function handleThemeChange(e) {
    const theme = e.target.value;
    saveSettings({ theme });
    applyTheme(theme);
    UI.showToast("Theme updated", "success");
}

function applyTheme(theme) {
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
        root.setAttribute('data-theme', 'light');
    }
    // If 'system', we remove attribute and let prefers-color-scheme handle it
}

function saveRegionalSettings(e) {
    const sym = document.getElementById('currencySymbol').value.trim();
    const fmt = document.getElementById('numberFormat').value;
    
    if (!sym) {
        UI.showToast("Currency symbol cannot be empty", "error");
        return;
    }
    
    saveSettings({ currencySymbol: sym, numberFormat: fmt });
    UI.showToast("Regional settings saved", "success");
    
    const btn = e ? e.target : document.getElementById('saveRegionalBtn');
    if (btn) {
        const originalText = btn.textContent;
        const originalColor = btn.style.color;
        btn.textContent = "✓ Saved";
        btn.style.color = "var(--color-secondary)";
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.color = originalColor;
        }, 1500);
    }
}

async function handlePinChange(e) {
    e.preventDefault();
    const oldPin = document.getElementById('oldPin').value;
    const newPin = document.getElementById('newPin').value;
    const confirmPin = document.getElementById('confirmPin').value;

    if (newPin !== confirmPin) {
        UI.showToast("New PINs do not match", "error");
        return;
    }

    const btn = e.submitter;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Updating...";

    try {
        const hashedOld = await window.hashPin(oldPin);
        const hashedNew = await window.hashPin(newPin);
        await window.api.changePin(hashedOld, hashedNew);
        UI.showToast("PIN updated successfully", "success");
        
        const originalColor = btn.style.color;
        btn.textContent = "✓ Saved";
        btn.style.color = "var(--color-secondary)";
        setTimeout(() => {
            UI.closeSheet();
            document.getElementById('pinForm').reset();
            btn.disabled = false;
            btn.textContent = originalText;
            btn.style.color = originalColor;
        }, 1500);
    } catch (err) {
        console.error(err);
        UI.showToast(err.message || "Failed to update PIN", "error");
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function handleLogout() {
    const btn = document.getElementById('logoutBtn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i class='bx bx-loader-alt bx-spin' style="margin-right: var(--space-2);"></i> Logging out...`;
    btn.disabled = true;

    try {
        await window.api.logout();
    } catch (e) {
        console.error("Logout API failed, continuing local logout", e);
    }

    localStorage.removeItem('rupeetrail_auth_token');
    window.location.href = 'index.html';
}

function handleClearData() {
    UI.showConfirm(
        "Clear All Data", 
        "Are you absolutely sure you want to clear ALL data? This action cannot be undone.",
        () => {
            // Clear all LocalStorage
            localStorage.clear();
            
            // Notify Service Worker to clear caches if needed
            if ('caches' in window) {
                caches.keys().then(names => {
                    for (let name of names) caches.delete(name);
                });
            }
            
            window.location.href = 'index.html';
        }
    );
}
