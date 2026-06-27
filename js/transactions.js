// js/transactions.js

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('rupeetrail_auth_token')) {
        window.location.href = 'index.html';
        return;
    }
    fetchAndRenderTransactions();
});

let transactions = [];
let accounts = [];
let categories = [];
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
const fTags = document.getElementById('txTags');
const btnExpense = document.getElementById('btnExpense');
const btnIncome = document.getElementById('btnIncome');
const btnTransfer = document.getElementById('btnTransfer');
const sheetTitle = document.getElementById('sheetTitle');
const deleteTxBtn = document.getElementById('deleteTxBtn');
const closeSheetBtn = document.getElementById('closeSheetBtn');

async function fetchAndRenderTransactions() {
    // ── SWR Pass 1: render from cache instantly ───────────────────────────────
    const cachedTxs  = State.getCached('transactions');
    const cachedAccs = State.getCached('accounts');
    const cachedCats = State.getCached('categories');

    if (cachedTxs && cachedAccs && cachedCats) {
        transactions = cachedTxs.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
        accounts     = cachedAccs;
        categories   = cachedCats;
        renderTransactions();
        populateFormDropdowns();
    }

    // ── SWR Pass 2: fetch fresh in background ────────────────────────────────
    try {
        const [txs, accs, cats] = await Promise.all([
            State.fetchTransactions(),
            State.fetchAccounts(),
            State.fetchCategories()
        ]);

        const changed = JSON.stringify(txs)  !== JSON.stringify(cachedTxs)  ||
                        JSON.stringify(accs) !== JSON.stringify(cachedAccs) ||
                        JSON.stringify(cats) !== JSON.stringify(cachedCats);

        if (!cachedTxs || changed) {
            transactions = txs.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
            accounts     = accs;
            categories   = cats;
            renderTransactions();
            populateFormDropdowns();
        }
    } catch (err) {
        console.error('Failed to load transactions', err);
        if (!cachedTxs) {
            transactionsContainer.innerHTML = UI.getEmptyStateHTML('Error Loading', 'Please try again.', '<i class="bx bx-error"></i>');
        }
    }
}

function populateFormDropdowns() {
    if (fAccount) {
        const opts = accounts.map(a => `<option value="${UI.escapeHtml(a.id)}">${UI.escapeHtml(a.name)} (${UI.formatCurrency(a.balance)})</option>`).join('');
        fAccount.innerHTML = opts || '<option value="" disabled>No accounts available</option>';
    }
    if (fCategory) {
        const opts = categories.map(c => `<option value="${UI.escapeHtml(c.name)}">${UI.escapeHtml(c.name)}</option>`).join('');
        fCategory.innerHTML = opts || '<option value="Other">Other</option>';
    }
}


function formatDateHeader(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderTransactions() {
    // Update chip counts
    const chips = document.querySelectorAll('.filter-chips .chip');
    chips.forEach(chip => {
        const filter = chip.getAttribute('data-filter');
        if (!chip.dataset.originalText) {
            chip.dataset.originalText = chip.textContent.replace(/\s*\(\d+\)$/, '').trim();
        }
        
        let count = 0;
        if (filter === 'all') count = transactions.length;
        else count = transactions.filter(t => t.type.toLowerCase() === filter).length;
        
        chip.textContent = `${chip.dataset.originalText} (${count})`;
    });

    const searchTerm = searchInput.value.toLowerCase();
    
    const filtered = transactions.filter(tx => {
        const matchesFilter = currentFilter === 'all' || tx.type === currentFilter;
        const matchesSearch = tx.title.toLowerCase().includes(searchTerm) || tx.category.toLowerCase().includes(searchTerm);
        return matchesFilter && matchesSearch;
    });

    if (filtered.length === 0) {
        transactionsContainer.innerHTML = '';
        emptyState.style.display = 'flex';
        
        const emptyStateMsg = document.getElementById('emptyStateMsg');
        const emptyStateBtn = document.getElementById('emptyStateBtn');
        
        if (transactions.length === 0) {
            if (emptyStateMsg) emptyStateMsg.textContent = 'No transactions yet — add your first one.';
            if (emptyStateBtn) emptyStateBtn.style.display = 'inline-flex';
        } else {
            if (emptyStateMsg) emptyStateMsg.textContent = 'No results. Try a different filter.';
            if (emptyStateBtn) emptyStateBtn.style.display = 'none';
        }
        return;
    }

    emptyState.style.display = 'none';
    const catIcons = {"Salary":"bx-briefcase", "Food & Dining":"bx-restaurant", "Transportation":"bx-bus", "Utilities":"bx-plug", "Shopping":"bx-shopping-bag"};

    // Group by Date
    const grouped = {};
    filtered.forEach(tx => {
        const dateKey = tx.date;
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(tx);
    });

    let html = '';
    for (const [date, txs] of Object.entries(grouped)) {
        html += `
            <div style="padding: var(--space-4) 0 var(--space-2) var(--space-2); font-weight: var(--font-weight-bold); color: var(--text-muted); font-size: var(--font-size-sm); text-transform: uppercase; letter-spacing: 0.5px;">
                ${formatDateHeader(date)}
            </div>
            <div class="transaction-list">
        `;
        
        html += txs.map(tx => {
            const isIncome = tx.type === 'income';
            const isTransfer = tx.type === 'transfer';
            const icon = isTransfer ? 'bx-transfer' : (catIcons[tx.category] || 'bx-receipt');
            
            let bg, color, sign;
            if (isTransfer) {
                bg = 'rgba(59, 130, 246, 0.15)'; color = 'var(--color-info)'; sign = '';
            } else if (isIncome) {
                bg = 'rgba(16, 185, 129, 0.15)'; color = 'var(--color-secondary)'; sign = '+';
            } else {
                bg = 'rgba(244, 63, 94, 0.15)'; color = 'var(--color-danger)'; sign = '-';
            }

            return `
            <button type="button" class="transaction-item animate-slide-up w-full text-left" onclick="editTransaction('${tx.id}')">
                <div class="transaction-details">
                    <div class="transaction-icon" style="background: ${bg}; color: ${color}">
                        <i class='bx ${UI.escapeHtml(icon)}'></i>
                    </div>
                    <div class="transaction-info">
                        <p class="transaction-title">${UI.escapeHtml(tx.title)}</p>
                        <p class="transaction-date">${UI.escapeHtml(tx.category)}</p>
                    </div>
                </div>
                <div class="transaction-amount ${tx.type}" style="color: ${color}">
                    ${sign}${UI.formatCurrency(tx.amount)}
                </div>
            </button>
            `;
        }).join('');
        
        html += `</div>`;
    }

    transactionsContainer.innerHTML = html;
    
    document.querySelectorAll('#transactionsContainer .transaction-item').forEach((el, i) => {
        el.style.animationDelay = `${(i % 15) * 50}ms`;
    });
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

// Bottom Sheet Logic
function setTxType(type) {
    fType.value = type;
    btnExpense.style.background = 'transparent'; btnExpense.style.boxShadow = 'none'; btnExpense.style.color = 'var(--text-secondary)';
    btnIncome.style.background = 'transparent'; btnIncome.style.boxShadow = 'none'; btnIncome.style.color = 'var(--text-secondary)';
    btnTransfer.style.background = 'transparent'; btnTransfer.style.boxShadow = 'none'; btnTransfer.style.color = 'var(--text-secondary)';
    
    if (type === 'expense') {
        btnExpense.style.background = 'var(--bg-surface)'; btnExpense.style.boxShadow = 'var(--shadow-sm)'; btnExpense.style.color = 'var(--color-danger)';
    } else if (type === 'income') {
        btnIncome.style.background = 'var(--bg-surface)'; btnIncome.style.boxShadow = 'var(--shadow-sm)'; btnIncome.style.color = 'var(--color-secondary)';
    } else {
        btnTransfer.style.background = 'var(--bg-surface)'; btnTransfer.style.boxShadow = 'var(--shadow-sm)'; btnTransfer.style.color = 'var(--color-info)';
    }
}

if(btnExpense) btnExpense.addEventListener('click', (e) => { e.preventDefault(); setTxType('expense'); });
if(btnIncome) btnIncome.addEventListener('click', (e) => { e.preventDefault(); setTxType('income'); });
if(btnTransfer) btnTransfer.addEventListener('click', (e) => { e.preventDefault(); setTxType('transfer'); });

if(closeSheetBtn) closeSheetBtn.addEventListener('click', (e) => { e.preventDefault(); UI.closeSheet(); });
const overlay = document.getElementById('sheetOverlay');
if(overlay) overlay.addEventListener('click', UI.closeSheet);

function openAddSheet() {
    sheetTitle.textContent = "Add Transaction";
    fId.value = "";
    txForm.reset();
    setTxType('expense'); // Default
    fDate.valueAsDate = new Date(); // Set today
    deleteTxBtn.style.display = 'none';
    UI.openSheet('sheetOverlay', 'bottomSheet');
}

if(fabBtn) fabBtn.addEventListener('click', openAddSheet);
if(desktopAddBtn) desktopAddBtn.addEventListener('click', openAddSheet);

window.editTransaction = function(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    
    sheetTitle.textContent = "Edit Transaction";
    fId.value = tx.id;
    fTitle.value = tx.title;
    fAmount.value = tx.amount;
    fCategory.value = tx.category;
    fDate.value = tx.date;
    fAccount.value = tx.accountId || "";
    if (fTags) fTags.value = tx.tags ? tx.tags.join(', ') : "";
    
    setTxType(tx.type);
    
    deleteTxBtn.style.display = 'block';
    UI.openSheet('sheetOverlay', 'bottomSheet');
}

// Form Submit
txForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = fId.value;
    const amount = parseFloat(fAmount.value);
    
    if (!amount || amount <= 0) {
        UI.showToast("Please enter a valid amount", "error");
        return;
    }
    if (!fTitle.value.trim() || !fCategory.value || !fAccount.value || !fDate.value) {
        UI.showToast("Please fill all required fields", "error");
        return;
    }
    
    const submitBtn = txForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;

    try {
        const txData = {
            title: fTitle.value.trim(),
            amount: amount,
            type: fType.value,
            category: fCategory.value,
            accountId: fAccount.value,
            date: fDate.value,
            tags: fTags ? fTags.value.split(',').map(t => t.trim()).filter(t => t) : []
        };
        
        if (id) {
            await State.updateTransaction(id, txData);
            const index = transactions.findIndex(t => t.id === id);
            if (index !== -1) {
                transactions[index] = { ...transactions[index], ...txData };
            }
        } else {
            txData.id = 'tx_' + Date.now(); // local temp id
            await State.addTransaction(txData);
            transactions.unshift(txData);
        }
        
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        UI.closeSheet();
        renderTransactions();
        State.clearCache();
    } catch (err) {
        console.error(err);
        UI.showToast("Action failed", "error");
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// Delete Transaction
deleteTxBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const id = fId.value;
    if (!id) return;
    
    UI.showConfirm("Delete Transaction", "Are you sure you want to delete this transaction?", async () => {
        deleteTxBtn.disabled = true;
        try {
            await State.deleteTransaction(id);
            transactions = transactions.filter(t => t.id !== id);
            UI.closeSheet();
            renderTransactions();
            State.clearCache();
        } catch(err) {
            console.error(err);
            UI.showToast("Failed to delete", "error");
        } finally {
            deleteTxBtn.disabled = false;
        }
    });
});
