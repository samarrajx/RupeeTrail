// js/transactions.js

let transactions = [];
let accounts = [];
let currentFilter = 'all';

// DOM Elements
const searchInput = document.getElementById('searchInput');
const filterChips = document.querySelectorAll('.chip');
const transactionsContainer = document.getElementById('transactionsContainer');
const emptyState = document.getElementById('emptyState');
const fabBtn = document.getElementById('fabBtn');
const desktopAddBtn = document.getElementById('desktopAddBtn');

// Form Elements
const txForm = document.getElementById('txForm');
const fId = document.getElementById('txId');
const fType = document.getElementById('txType');
const fTitle = document.getElementById('txTitle');
const fAmount = document.getElementById('txAmount');
const fCategory = document.getElementById('txCategory');
const fAccount = document.getElementById('txAccount');
const fDate = document.getElementById('txDate');
const btnExpense = document.getElementById('btnExpense');
const btnIncome = document.getElementById('btnIncome');
const sheetTitle = document.getElementById('sheetTitle');
const deleteTxBtn = document.getElementById('deleteTxBtn');
const closeSheetBtn = document.getElementById('closeSheetBtn');

async function fetchAndRenderTransactions() {
    try {
        const [txs, accs] = await Promise.all([
            State.fetchTransactions(),
            State.fetchAccounts()
        ]);
        transactions = txs;
        accounts = accs;
        
        // Sort newest first
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        renderTransactions();
        
        // Populate account dropdown
        if (fAccount) {
            const opts = accounts.map(a => `<option value="${a.id}">${a.name} (${UI.formatCurrency(a.balance)})</option>`).join('');
            fAccount.innerHTML = opts || '<option value="" disabled>No accounts available</option>';
        }
    } catch (err) {
        console.error("Failed to load transactions", err);
        transactionsContainer.innerHTML = UI.getEmptyStateHTML('Error Loading', 'Please pull to refresh', '<path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />');
    }
}

function renderTransactions() {
    const searchTerm = searchInput.value.toLowerCase();
    
    const filtered = transactions.filter(tx => {
        const matchesFilter = currentFilter === 'all' || tx.type === currentFilter;
        const matchesSearch = tx.title.toLowerCase().includes(searchTerm) || tx.category.toLowerCase().includes(searchTerm);
        return matchesFilter && matchesSearch;
    });

    if (filtered.length === 0) {
        transactionsContainer.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    const catIcons = {"Salary":"bx-briefcase", "Food & Dining":"bx-restaurant", "Transportation":"bx-bus", "Utilities":"bx-plug", "Shopping":"bx-shopping-bag"};

    transactionsContainer.innerHTML = filtered.map(tx => {
        const isIncome = tx.type === 'income';
        const icon = catIcons[tx.category] || 'bx-receipt';
        return `
        <button class="transaction-item w-full text-left" onclick="editTransaction('${tx.id}')" aria-label="Edit ${tx.title}">
            <div class="transaction-details">
                <div class="transaction-icon" style="background-color: ${isIncome ? '#D1FAE5' : '#FEE2E2'}; color: ${isIncome ? '#059669' : '#DC2626'}">
                    <i class='bx ${icon}'></i>
                </div>
                <div class="transaction-info">
                    <p class="transaction-title">${tx.title}</p>
                    <p class="transaction-date">${tx.date} • ${tx.category}</p>
                </div>
            </div>
            <div class="transaction-amount ${tx.type}">
                ${isIncome ? '+' : '-'}${UI.formatCurrency(tx.amount)}
            </div>
        </button>
        `;
    }).join('');
}

// Filters & Search
const debouncedSearch = UI.debounce(renderTransactions, 300);
searchInput.addEventListener('input', debouncedSearch);

filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.getAttribute('data-filter');
        renderTransactions();
    });
});

// Bottom Sheet Types
function setTxType(type) {
    fType.value = type;
    if (type === 'expense') {
        btnExpense.style.background = 'var(--bg-surface)';
        btnExpense.style.boxShadow = 'var(--shadow-sm)';
        btnExpense.style.color = 'var(--color-danger)';
        btnIncome.style.background = 'transparent';
        btnIncome.style.boxShadow = 'none';
        btnIncome.style.color = 'var(--text-secondary)';
    } else {
        btnIncome.style.background = 'var(--bg-surface)';
        btnIncome.style.boxShadow = 'var(--shadow-sm)';
        btnIncome.style.color = 'var(--color-secondary)';
        btnExpense.style.background = 'transparent';
        btnExpense.style.boxShadow = 'none';
        btnExpense.style.color = 'var(--text-secondary)';
    }
}

btnExpense.addEventListener('click', (e) => { e.preventDefault(); setTxType('expense'); });
btnIncome.addEventListener('click', (e) => { e.preventDefault(); setTxType('income'); });

closeSheetBtn.addEventListener('click', (e) => { e.preventDefault(); UI.closeSheet(); });
document.getElementById('sheetOverlay').addEventListener('click', UI.closeSheet);

fabBtn.addEventListener('click', () => {
    sheetTitle.textContent = "Add Transaction";
    fId.value = "";
    txForm.reset();
    setTxType('expense'); // Default
    fDate.valueAsDate = new Date(); // Set today
    deleteTxBtn.style.display = 'none';
    UI.openSheet('sheetOverlay', 'bottomSheet');
});

if (desktopAddBtn) {
    desktopAddBtn.addEventListener('click', () => fabBtn.click());
}

// CRUD Operations
window.editTransaction = function(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    sheetTitle.textContent = "Edit Transaction";
    fId.value = tx.id;
    fTitle.value = tx.title;
    fAmount.value = tx.amount;
    fCategory.value = tx.category;
    if (fAccount && tx.accountId) fAccount.value = tx.accountId;
    fDate.value = tx.date;
    setTxType(tx.type);
    
    deleteTxBtn.style.display = 'block';
    UI.openSheet('sheetOverlay', 'bottomSheet');
};

deleteTxBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (confirm("Are you sure you want to delete this transaction?")) {
        const id = fId.value;
        const btn = deleteTxBtn;
        btn.disabled = true;
        btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i>`;
        
        try {
            const txToDelete = transactions.find(t => t.id === id);
            if (txToDelete) {
                // Reverse the balance effect
                const acc = accounts.find(a => a.id === txToDelete.accountId);
                if (acc) {
                    if (txToDelete.type === 'expense') acc.balance += txToDelete.amount;
                    if (txToDelete.type === 'income') acc.balance -= txToDelete.amount;
                    await State.updateAccount(acc.id, acc);
                }
            }

            await State.deleteTransaction(id);
            transactions = transactions.filter(t => t.id !== id);
            UI.closeSheet();
            renderTransactions();
        } catch (err) {
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.textContent = "Delete";
        }
    }
});

txForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newTx = {
        title: fTitle.value,
        amount: parseFloat(fAmount.value),
        type: fType.value,
        category: fCategory.value,
        date: fDate.value,
        accountId: fAccount ? fAccount.value : null
    };

    if (!newTx.accountId && accounts.length > 0) {
        newTx.accountId = accounts[0].id;
    }

    const btn = e.submitter;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Saving...`;

    try {
        if (fId.value) {
            const oldTx = transactions.find(t => t.id === fId.value);
            if (oldTx) {
                // Reverse old transaction from old account
                const oldAcc = accounts.find(a => a.id === oldTx.accountId);
                if (oldAcc) {
                    if (oldTx.type === 'expense') oldAcc.balance += oldTx.amount;
                    if (oldTx.type === 'income') oldAcc.balance -= oldTx.amount;
                    await State.updateAccount(oldAcc.id, oldAcc);
                }
            }
            
            // Apply new transaction to new account
            const newAcc = accounts.find(a => a.id === newTx.accountId);
            if (newAcc) {
                if (newTx.type === 'expense') newAcc.balance -= newTx.amount;
                if (newTx.type === 'income') newAcc.balance += newTx.amount;
                await State.updateAccount(newAcc.id, newAcc);
            }

            const updatedTx = await State.updateTransaction(fId.value, newTx);
            const index = transactions.findIndex(t => t.id === fId.value);
            if (index !== -1) transactions[index] = updatedTx;
        } else {
            // Apply new transaction to account
            const newAcc = accounts.find(a => a.id === newTx.accountId);
            if (newAcc) {
                if (newTx.type === 'expense') newAcc.balance -= newTx.amount;
                if (newTx.type === 'income') newAcc.balance += newTx.amount;
                await State.updateAccount(newAcc.id, newAcc);
            }

            const createdTx = await State.addTransaction(newTx);
            transactions.unshift(createdTx); // add to top
        }
        UI.closeSheet();
        
        // Repopulate options with new balances
        if (fAccount) {
            const opts = accounts.map(a => `<option value="${a.id}">${a.name} (${UI.formatCurrency(a.balance)})</option>`).join('');
            fAccount.innerHTML = opts || '<option value="" disabled>No accounts available</option>';
        }

        renderTransactions();
    } catch (err) {
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// Auto Format Currency
fAmount.addEventListener('input', (e) => {
    // Only allow numbers and one decimal
    e.target.value = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
});

// Initialize
document.addEventListener('DOMContentLoaded', fetchAndRenderTransactions);
