// js/dashboard.js - Dashboard page logic

document.addEventListener('DOMContentLoaded', fetchAndRenderDashboard);

async function fetchAndRenderDashboard() {
    try {
        const accounts = await State.fetchAccounts();
        const transactions = await State.fetchTransactions();
        
        // 1. Total Balance
        const totalBalance = accounts.reduce((acc, a) => acc + a.balance, 0);
        
        // 2. Income/Expense (Current Month)
        const now = new Date();
        const currentMonthTx = transactions.filter(tx => {
            if (!tx.date) return false;
            const d = new Date(tx.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        
        const income = currentMonthTx.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
        const expense = currentMonthTx.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
        
        // Render Summary
        const summaryHtml = `
            <div class="card stat-card stagger-1 animate-slide-up" style="opacity:0">
                <div class="stat-title">Total Balance</div>
                <div class="stat-value">${UI.formatCurrency(totalBalance)}</div>
                <div class="stat-trend positive">
                    <i class='bx bx-trending-up'></i> +0.0%
                </div>
            </div>
            <div class="card stat-card stagger-2 animate-slide-up" style="opacity:0">
                <div class="stat-title">Monthly Income</div>
                <div class="stat-value">${UI.formatCurrency(income)}</div>
                <div class="stat-trend positive">
                    <i class='bx bx-trending-up'></i> +0.0%
                </div>
            </div>
            <div class="card stat-card stagger-3 animate-slide-up" style="opacity:0">
                <div class="stat-title">Monthly Expenses</div>
                <div class="stat-value">${UI.formatCurrency(expense)}</div>
                <div class="stat-trend negative">
                    <i class='bx bx-trending-down'></i> +0.0%
                </div>
            </div>
        `;
        document.getElementById('summaryContainer').innerHTML = summaryHtml;

        // Render Accounts
        if (accounts.length === 0) {
            document.getElementById('accountsContainer').innerHTML = UI.getEmptyStateHTML('No Accounts', 'Add an account to track balances.', '<path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7m8 2-3-3m3 3-3 3m3-3h-6"/>');
        } else {
            document.getElementById('accountsContainer').innerHTML = accounts.map(acc => `
                <div class="account-card ${acc.theme}">
                    <div class="account-name">${acc.name}</div>
                    <div class="account-balance">${UI.formatCurrency(acc.balance)}</div>
                    <div style="font-size: 0.75rem; opacity: 0.7; margin-top: auto;">**** **** **** ${Math.floor(1000 + Math.random() * 9000)}</div>
                </div>
            `).join('');
        }

        // Render Budgets (Dynamically based on top category this month)
        let topCategoryName = 'Food & Dining'; // Fallback
        let topCategorySpent = 0;
        
        if (expense > 0) {
            const categoryMap = {};
            currentMonthTx.forEach(tx => {
                if (tx.type === 'expense') {
                    categoryMap[tx.category] = (categoryMap[tx.category] || 0) + tx.amount;
                }
            });
            const topCat = Object.entries(categoryMap).sort((a,b) => b[1] - a[1])[0];
            if (topCat) {
                topCategoryName = topCat[0];
                topCategorySpent = topCat[1];
            }
        }
        
        // Define a dynamic budget limit
        const limit = Math.ceil((topCategorySpent + 1) / 5000) * 5000;
        const progressPercent = Math.min((topCategorySpent / limit) * 100, 100);
        let progressColor = '#3B82F6';
        if (progressPercent > 75) progressColor = '#F59E0B';
        if (progressPercent > 90) progressColor = '#EF4444';

        const budgetHtml = `
            <div style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--text-primary);">
                    <span>${topCategoryName} (Top Spend)</span>
                    <span>${UI.formatCurrency(topCategorySpent)} <span style="color: var(--text-muted); font-weight: normal;">/ ${UI.formatCurrency(limit)}</span></span>
                </div>
                <div style="width: 100%; height: 8px; background-color: var(--bg-app); border-radius: 4px; overflow: hidden; border: 1px solid var(--border-light);">
                    <div style="height: 100%; width: ${progressPercent}%; background-color: ${progressColor}; border-radius: 4px; transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
        document.getElementById('budgetContainer').innerHTML = budgetHtml;

        // Render Transactions
        const catIcons = {"Salary":"bx-briefcase", "Food & Dining":"bx-restaurant", "Transportation":"bx-bus", "Utilities":"bx-plug", "Shopping":"bx-shopping-bag"};
        if (transactions.length === 0) {
            document.getElementById('transactionsContainer').innerHTML = UI.getEmptyStateHTML('No Transactions', 'Your recent transactions will appear here.', '<path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"/>');
        } else {
            document.getElementById('transactionsContainer').innerHTML = transactions.slice(0, 5).map(tx => {
                const icon = catIcons[tx.category] || 'bx-receipt';
                return `
                <div class="transaction-item">
                    <div class="transaction-details">
                        <div class="transaction-icon" style="background-color: ${tx.type === 'income' ? '#D1FAE5' : '#FEE2E2'}; color: ${tx.type === 'income' ? '#059669' : '#DC2626'}">
                            <i class='bx ${icon}'></i>
                        </div>
                        <div class="transaction-info">
                            <p class="transaction-title">${tx.title}</p>
                            <p class="transaction-date">${tx.date}</p>
                        </div>
                    </div>
                    <div class="transaction-amount ${tx.type}">
                        ${tx.type === 'income' ? '+' : '-'}${UI.formatCurrency(tx.amount)}
                    </div>
                </div>
                `;
            }).join('');
        }

        // Initialize Chart
        ChartsManager.destroyChart('overviewChart');
        const ctx = document.getElementById('overviewChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                datasets: [
                    { label: 'Income', data: [0,0,0,0,0,income], backgroundColor: '#10B981', borderRadius: 4, barPercentage: 0.6 },
                    { label: 'Expense', data: [0,0,0,0,0,expense], backgroundColor: '#EF4444', borderRadius: 4, barPercentage: 0.6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 1000, easing: 'easeOutQuart' },
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { border: { display: false }, beginAtZero: true }
                }
            }
        });

    } catch (err) {
        console.error(err);
        UI.showToast("Failed to load dashboard data.", "error");
        document.getElementById('summaryContainer').innerHTML = UI.getEmptyStateHTML('Error loading data', 'Please pull to refresh.', '<path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />');
    }
}
