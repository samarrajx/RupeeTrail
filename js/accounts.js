// js/accounts.js

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('rupeetrail_auth_token')) {
        window.location.href = 'index.html';
        return;
    }
    fetchAndRenderAccounts();
});

let accounts = [];

// DOM Elements
const accountsGrid = document.getElementById('accountsGrid');
const totalNetWorth = document.getElementById('totalNetWorth');

// Forms
const accountForm = document.getElementById('accountForm');
const accId = document.getElementById('accId');
const accName = document.getElementById('accName');
const accType = document.getElementById('accType');
const accBalance = document.getElementById('accBalance');
const accIcon = document.getElementById('accIcon');
const accTheme = document.getElementById('accTheme');
const deleteAccBtn = document.getElementById('deleteAccBtn');
const accountSheetTitle = document.getElementById('accountSheetTitle');

const transferForm = document.getElementById('transferForm');
const transferFrom = document.getElementById('transferFrom');
const transferTo = document.getElementById('transferTo');
const transferAmount = document.getElementById('transferAmount');
const transferNote = document.getElementById('transferNote');

async function fetchAndRenderAccounts() {
    // ── SWR Pass 1: render from cache instantly ───────────────────────────────
    const cachedAccs = State.getCached('accounts');
    if (cachedAccs) {
        accounts = cachedAccs;
        renderAccounts(accounts);
    }

    // ── SWR Pass 2: fetch fresh in background ────────────────────────────────
    try {
        const fresh = await State.fetchAccounts();
        const changed = JSON.stringify(fresh) !== JSON.stringify(cachedAccs);
        if (!cachedAccs || changed) {
            accounts = fresh;
            renderAccounts(accounts);
        }
    } catch (err) {
        console.error('Failed to load accounts', err);
        if (!cachedAccs) {
            accountsGrid.innerHTML = UI.getEmptyStateHTML('Error Loading', 'Please try again.', '<i class="bx bx-error"></i>');
        }
    }
}

function renderAccounts(accs) {
    let total = 0;

    if (!accs || accs.length === 0) {
        accountsGrid.innerHTML = UI.getEmptyStateHTML('No Accounts', 'Add an account to track balances.', '<i class="bx bx-wallet"></i>');
        totalNetWorth.textContent = UI.formatCurrency(0);
        return;
    }

    accountsGrid.innerHTML = accs.map((acc, index) => {
        total += acc.balance;
        const icon    = UI.escapeHtml(acc.icon) || 'bx-wallet';
        const typeStr = UI.escapeHtml(acc.type) || 'Checking';
        const safeName = UI.escapeHtml(acc.name);
        return `
        <button class="account-card ${UI.escapeHtml(acc.theme) || 'primary'} animate-slide-up text-left" style="position: relative; min-height: 150px; cursor: pointer; border: none; padding: var(--space-4); display: flex; flex-direction: column; opacity: 0; animation-delay: ${index * 50}ms;" onclick="openAccountSheet('${UI.escapeHtml(acc.id)}')" aria-label="Edit ${safeName}">
            <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
                <i class='bx ${icon}' style="font-size: 1.5rem; opacity: 0.9;"></i>
                <div class="account-name" style="margin: 0; font-size: 1.1rem;">${safeName}</div>
            </div>
            <div class="account-balance" style="font-size: 1.8rem;">${UI.formatCurrency(acc.balance)}</div>
            <div style="font-size: 0.85rem; opacity: 0.8; margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
                <span>${typeStr}</span>
                <span>**** ${String(acc.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 1234567).slice(-4).padStart(4, '0')}</span>
            </div>
            <div class="btn btn-ghost" style="position: absolute; top: var(--space-2); right: var(--space-2); color: white; padding: 0.25rem;"><i class='bx bx-edit-alt'></i></div>
        </button>
        `;
    }).join('');
    totalNetWorth.textContent = UI.formatCurrency(total);
}


// Account Logic
window.openAccountSheet = function(id = null) {
    accountForm.reset();
    
    if (id) {
        const acc = accounts.find(a => a.id === id);
        if (!acc) return;
        accId.value = acc.id;
        accName.value = acc.name;
        accType.value = acc.type || 'Checking';
        accBalance.value = acc.balance;
        accIcon.value = acc.icon || 'bx-wallet';
        accTheme.value = acc.theme || 'primary';
        accountSheetTitle.textContent = "Edit Account";
        deleteAccBtn.style.display = "block";
    } else {
        accId.value = "";
        accountSheetTitle.textContent = "Add Account";
        deleteAccBtn.style.display = "none";
    }
    
    UI.openSheet('sheetOverlay', 'accountSheet');
};

accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = accId.value;
    const newAcc = {
        name: accName.value.trim(),
        type: accType.value,
        balance: parseFloat(accBalance.value),
        icon: accIcon.value,
        theme: accTheme.value
    };

    if (!newAcc.name) {
        UI.showToast("Account name is required", "error");
        return;
    }

    const btn = e.submitter;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.innerHTML = `Saving...`;

    try {
        if (id) {
            await State.updateAccount(id, newAcc);
        } else {
            newAcc.id = 'acc_' + Date.now();
            await State.addAccount(newAcc);
        }
        UI.closeSheet();
        await fetchAndRenderAccounts();
    } catch (err) {
        console.error(err);
        UI.showToast("Failed to save account", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

window.deleteAccount = async function() {
    const id = accId.value;
    if (!id) return;

    // Fetch transactions to see if there are linked ones
    const txs = await State.fetchTransactions(true);
    const hasLinked = txs.some(tx => tx.accountId === id);
    
    let msg = "Are you sure you want to delete this account?";
    if (hasLinked) {
        msg = "WARNING: This account has linked transactions. Deleting it may orphan them. Are you REALLY sure?";
    }

    UI.showConfirm("Delete Account", msg, async () => {
        const btn = deleteAccBtn;
        btn.disabled = true;
        btn.textContent = "Deleting...";
        try {
            await State.deleteAccount(id);
            UI.closeSheet();
            await fetchAndRenderAccounts();
        } catch (err) {
            console.error(err);
            UI.showToast("Failed to delete account", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "Delete";
        }
    });
};

// Transfer Logic
window.openTransferSheet = function() {
    if (accounts.length < 2) {
        UI.showToast("You need at least 2 accounts to transfer.", "error");
        return;
    }
    const opts = accounts.map(a => `<option value="${UI.escapeHtml(a.id)}">${UI.escapeHtml(a.name)} (${UI.formatCurrency(a.balance)})</option>`).join('');
    transferFrom.innerHTML = opts;
    transferTo.innerHTML = opts;
    transferTo.selectedIndex = 1;
    
    transferForm.reset();
    UI.openSheet('sheetOverlay', 'transferSheet');
};

transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fromId = transferFrom.value;
    const toId = transferTo.value;
    const amount = parseFloat(transferAmount.value);
    const note = transferNote.value.trim();

    if (fromId === toId) {
        UI.showToast("Cannot transfer to the same account.", "error");
        return;
    }
    if (!amount || amount <= 0) {
        UI.showToast("Invalid amount.", "error");
        return;
    }

    const fromAcc = accounts.find(a => a.id === fromId);
    const toAcc = accounts.find(a => a.id === toId);

    const executeTransfer = async () => {
        const btn = document.querySelector('#transferForm button[type="submit"]');
        if (btn) {
            btn.disabled = true;
            btn.textContent = `Transferring...`;
        }

        try {
            // Update both accounts
            fromAcc.balance -= amount;
            toAcc.balance += amount;

            await State.updateAccount(fromId, fromAcc);
            await State.updateAccount(toId, toAcc);

            const dateStr = new Date().toISOString().split('T')[0];
            const baseNote = note ? ` - ${note}` : '';

            // Debit Transaction
            await State.addTransaction({
                id: 'tx_out_' + Date.now(),
                date: dateStr,
                accountId: fromId,
                category: "Transfer",
                amount: amount,
                type: "transfer",
                title: `Transfer to ${toAcc.name}${baseNote}`
            });

            // Credit Transaction (small delay to ensure unique ID)
            setTimeout(async () => {
                await State.addTransaction({
                    id: 'tx_in_' + Date.now(),
                    date: dateStr,
                    accountId: toId,
                    category: "Transfer",
                    amount: amount,
                    type: "transfer",
                    title: `Transfer from ${fromAcc.name}${baseNote}`
                });
            }, 50);

            UI.closeSheet();
            UI.showToast("Transfer complete", "success");
            await fetchAndRenderAccounts();
        } catch (err) {
            console.error(err);
            UI.showToast("Transfer failed", "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Transfer";
            }
        }
    };

    if (fromAcc.balance < amount) {
        UI.showConfirm("Insufficient Balance", "The from account doesn't have enough balance. Proceed anyway?", executeTransfer);
        return;
    }

    executeTransfer();
});

const formatCurrencyInput = (e) => {
    e.target.value = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
};
if(accBalance) accBalance.addEventListener('input', formatCurrencyInput);
if(transferAmount) transferAmount.addEventListener('input', formatCurrencyInput);

const overlay = document.getElementById('sheetOverlay');
if(overlay) overlay.addEventListener('click', UI.closeSheet);
