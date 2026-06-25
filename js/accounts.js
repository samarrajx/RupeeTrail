// js/accounts.js

let accounts = [];

// DOM Elements
const accountsGrid = document.getElementById('accountsGrid');
const totalNetWorth = document.getElementById('totalNetWorth');

// Forms
const accountForm = document.getElementById('accountForm');
const accId = document.getElementById('accId');
const accName = document.getElementById('accName');
const accBalance = document.getElementById('accBalance');
const accTheme = document.getElementById('accTheme');
const deleteAccBtn = document.getElementById('deleteAccBtn');
const accountSheetTitle = document.getElementById('accountSheetTitle');

const transferForm = document.getElementById('transferForm');
const transferFrom = document.getElementById('transferFrom');
const transferTo = document.getElementById('transferTo');
const transferAmount = document.getElementById('transferAmount');

async function fetchAndRenderAccounts() {
    try {
        accounts = await State.fetchAccounts();
        
        let total = 0;
        
        if (accounts.length === 0) {
            accountsGrid.innerHTML = UI.getEmptyStateHTML('No Accounts', 'Add an account to track balances.', '<path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7m8 2-3-3m3 3-3 3m3-3h-6"/>');
            totalNetWorth.textContent = UI.formatCurrency(0);
            return;
        }

        accountsGrid.innerHTML = accounts.map(acc => {
            total += acc.balance;
            return `
            <button class="account-card ${acc.theme} w-full text-left" style="position: relative; min-height: 140px; cursor: pointer; border: none; padding: var(--space-4); display: flex; flex-direction: column;" onclick="openAccountSheet('${acc.id}')" aria-label="Edit ${acc.name}">
                <div class="account-name">${acc.name}</div>
                <div class="account-balance">${UI.formatCurrency(acc.balance)}</div>
                <div style="font-size: 0.75rem; opacity: 0.7; margin-top: auto;">**** **** **** ${Math.floor(1000 + Math.random() * 9000)}</div>
                <div class="btn btn-ghost" style="position: absolute; top: var(--space-2); right: var(--space-2); color: white; padding: 0.25rem;"><i class='bx bx-edit-alt'></i></div>
            </button>
            `;
        }).join('');
        totalNetWorth.textContent = UI.formatCurrency(total);
    } catch (err) {
        console.error("Failed to load accounts", err);
        accountsGrid.innerHTML = UI.getEmptyStateHTML('Error Loading', 'Please pull to refresh.', '<path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />');
    }
}

// Account Logic
window.openAccountSheet = function(id = null) {
    accountForm.reset();
    
    if (id) {
        const acc = accounts.find(a => a.id === id);
        if (!acc) return;
        accId.value = acc.id;
        accName.value = acc.name;
        accBalance.value = acc.balance;
        accTheme.value = acc.theme;
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
        name: accName.value,
        balance: parseFloat(accBalance.value),
        theme: accTheme.value
    };

    const btn = e.submitter;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Saving...`;

    try {
        if (id) {
            await State.updateAccount(id, newAcc);
        } else {
            await State.addAccount(newAcc);
        }
        UI.closeSheet();
        await fetchAndRenderAccounts();
        UI.showToast("Account saved successfully", "success");
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
    if (confirm("Are you sure you want to delete this account?")) {
        const btn = deleteAccBtn;
        btn.disabled = true;
        btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i>`;
        try {
            await State.deleteAccount(id);
            UI.closeSheet();
            await fetchAndRenderAccounts();
            UI.showToast("Account deleted", "success");
        } catch (err) {
            console.error(err);
            UI.showToast("Failed to delete account", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "Delete";
        }
    }
};

// Transfer Logic
window.openTransferSheet = function() {
    if (accounts.length < 2) {
        UI.showToast("You need at least 2 accounts to transfer.", "error");
        return;
    }
    const opts = accounts.map(a => `<option value="${a.id}">${a.name} (${UI.formatCurrency(a.balance)})</option>`).join('');
    transferFrom.innerHTML = opts;
    transferTo.innerHTML = opts;
    // Set To as the second account by default
    transferTo.selectedIndex = 1;
    
    transferForm.reset();
    UI.openSheet('sheetOverlay', 'transferSheet');
};

transferForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fromId = transferFrom.value;
    const toId = transferTo.value;
    const amount = parseFloat(transferAmount.value);

    if (fromId === toId) {
        UI.showToast("Cannot transfer to the same account.", "error");
        return;
    }

    const fromAcc = accounts.find(a => a.id === fromId);
    const toAcc = accounts.find(a => a.id === toId);

    if (fromAcc.balance < amount) {
        UI.showToast("Insufficient funds.", "error");
        return;
    }

    const btn = e.submitter;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Transferring...`;

    try {
        // Update both accounts
        fromAcc.balance -= amount;
        toAcc.balance += amount;

        await State.updateAccount(fromId, fromAcc);
        await State.updateAccount(toId, toAcc);

        // Add transfer transaction
        await State.addTransaction({
            date: new Date().toISOString().split('T')[0],
            accountId: fromId,
            category: "Transfer",
            amount: amount,
            type: "expense",
            title: `Transfer to ${toAcc.name}`
        });

        UI.closeSheet();
        await fetchAndRenderAccounts();
        UI.showToast(`Transferred ${UI.formatCurrency(amount)} successfully`, "success");
    } catch (err) {
        console.error(err);
        UI.showToast("Transfer failed", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `Transfer`;
    }
});

// Auto Format Currency
const formatCurrencyInput = (e) => {
    e.target.value = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
};
if(accBalance) accBalance.addEventListener('input', formatCurrencyInput);
if(transferAmount) transferAmount.addEventListener('input', formatCurrencyInput);

document.getElementById('sheetOverlay').addEventListener('click', UI.closeSheet);

// Initialize
document.addEventListener('DOMContentLoaded', fetchAndRenderAccounts);
