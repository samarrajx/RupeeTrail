// js/dashboard.js - Dashboard page logic

document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth Guard
    if (!localStorage.getItem('rupeetrail_auth_token')) {
        window.location.href = 'index.html';
        return;
    }

    // Logout logic
    const logoutBtnDesktop = document.getElementById('logoutBtnDesktop');
    if (logoutBtnDesktop) {
        logoutBtnDesktop.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('rupeetrail_auth');
            window.location.href = 'index.html';
        });
    }

    fetchAndRenderDashboard();
});

async function fetchAndRenderDashboard() {
    try {
        const accounts = await State.fetchAccounts();
        const transactions = await State.fetchTransactions();
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0]; // "YYYY-MM-DD"
        
        // 1. Total Balance
        const totalBalance = accounts.reduce((acc, a) => acc + a.balance, 0);
        
        // 2. Income vs Expenses (Current Month)
        const currentMonthTx = transactions.filter(tx => {
            if (!tx.date) return false;
            const d = new Date(tx.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        
        const income = currentMonthTx.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
        const expense = currentMonthTx.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
        
        // 3. Savings Figure
        const savings = income - expense;
        const savingsTrendClass = savings >= 0 ? 'positive' : 'negative';
        const savingsIcon = savings >= 0 ? 'bx-trending-up' : 'bx-trending-down';

        // 4. Today's Spending
        const todaySpending = transactions
            .filter(tx => tx.date === todayStr && tx.type === 'expense')
            .reduce((acc, t) => acc + t.amount, 0);
        
        // Render Summary (4 Top Stats)
        const summaryHtml = `
            <div class="card stat-card stagger-1 animate-slide-up" style="opacity:0">
                <div class="stat-title">Total Balance</div>
                <div class="stat-value">${UI.formatCurrency(totalBalance)}</div>
            </div>
            <div class="card stat-card stagger-2 animate-slide-up" style="opacity:0">
                <div class="stat-title">Month In / Out</div>
                <div class="stat-value" style="font-size: var(--font-size-lg); padding-top:4px;">
                    <span style="color: var(--color-secondary);">${UI.formatCurrency(income)}</span> / 
                    <span style="color: var(--color-danger);">${UI.formatCurrency(expense)}</span>
                </div>
            </div>
            <div class="card stat-card stagger-3 animate-slide-up" style="opacity:0">
                <div class="stat-title">Monthly Savings</div>
                <div class="stat-value">${UI.formatCurrency(savings)}</div>
                <div class="stat-trend ${savingsTrendClass}">
                    <i class='bx ${savingsIcon}'></i> ${savings >= 0 ? '+' : ''}${((savings / (income || 1)) * 100).toFixed(0)}% saved
                </div>
            </div>
            <div class="card stat-card stagger-4 animate-slide-up" style="opacity:0">
                <div class="stat-title">Today's Spending</div>
                <div class="stat-value">${UI.formatCurrency(todaySpending)}</div>
            </div>
        `;
        document.getElementById('summaryContainer').innerHTML = summaryHtml;

        // Render Top Spending Category
        let topCategoryName = 'No Expenses Yet';
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
        
        const limit = Math.ceil((topCategorySpent + 1) / 5000) * 5000;
        const progressPercent = Math.min((topCategorySpent / limit) * 100, 100);
        let progressColor = 'var(--color-primary)';
        if (progressPercent > 75) progressColor = 'var(--color-warning)';
        if (progressPercent > 90) progressColor = 'var(--color-danger)';

        const budgetHtml = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--text-primary);">
                <span style="font-family: var(--font-family-heading);">${UI.escapeHtml(topCategoryName)}</span>
                <span>${UI.formatCurrency(topCategorySpent)} <span style="color: var(--text-muted); font-weight: normal;">/ ${UI.formatCurrency(limit)} limit</span></span>
            </div>
            <div style="width: 100%; height: 10px; background-color: var(--bg-app); border-radius: 5px; overflow: hidden; border: 1px solid var(--border-light);">
                <div style="height: 100%; width: ${progressPercent}%; background: ${progressColor}; border-radius: 5px; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);"></div>
            </div>
        `;
        document.getElementById('budgetContainer').innerHTML = budgetHtml;

        // Render Recent Transactions (Limit 3)
        const catIcons = {"Salary":"bx-briefcase", "Food & Dining":"bx-restaurant", "Transportation":"bx-bus", "Utilities":"bx-plug", "Shopping":"bx-shopping-bag"};
        if (transactions.length === 0) {
            document.getElementById('transactionsContainer').innerHTML = UI.getEmptyStateHTML('No Transactions', 'Your recent transactions will appear here.', '<i class="bx bx-receipt"></i>');
        } else {
            document.getElementById('transactionsContainer').innerHTML = transactions.slice(0, 3).map(tx => {
                const icon = catIcons[tx.category] || 'bx-receipt';
                return `
                <div class="transaction-item animate-slide-right" style="opacity: 0">
                    <div class="transaction-details">
                        <div class="transaction-icon" style="background: ${tx.type === 'income' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)'}; color: ${tx.type === 'income' ? 'var(--color-secondary)' : 'var(--color-danger)'}">
                            <i class='bx ${UI.escapeHtml(icon)}'></i>
                        </div>
                        <div class="transaction-info">
                            <p class="transaction-title">${UI.escapeHtml(tx.title)}</p>
                            <p class="transaction-date">${UI.escapeHtml(tx.date)} &bull; ${UI.escapeHtml(tx.category)}</p>
                        </div>
                    </div>
                    <div class="transaction-amount ${tx.type}">
                        ${tx.type === 'income' ? '+' : '-'}${UI.formatCurrency(tx.amount)}
                    </div>
                </div>
                `;
            }).join('');
            
            // Stagger animations for transactions
            document.querySelectorAll('#transactionsContainer .transaction-item').forEach((el, i) => {
                el.style.animationDelay = `${(i+1)*100}ms`;
            });
        }

        // Initialize Daily Spending Chart
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const labels = Array.from({length: daysInMonth}, (_, i) => `${i + 1}`);
        const dailyData = new Array(daysInMonth).fill(0);
        
        currentMonthTx.forEach(tx => {
            if (tx.type === 'expense' && tx.date) {
                const day = parseInt(tx.date.split('-')[2], 10);
                dailyData[day - 1] += tx.amount;
            }
        });

        ChartsManager.destroyChart('overviewChart');
        const ctx = document.getElementById('overviewChart').getContext('2d');
        
        // Gradient for chart bars
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, '#818CF8'); // Primary light
        gradient.addColorStop(1, '#4F46E5'); // Primary
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Spending',
                    data: dailyData,
                    backgroundColor: gradient,
                    borderRadius: 4,
                    borderSkipped: false,
                    barPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1E293B',
                        titleFont: { family: 'Outfit', size: 14 },
                        bodyFont: { family: 'Inter', size: 14 },
                        callbacks: {
                            label: function(context) {
                                return ' ' + UI.formatCurrency(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: {
                            font: { family: 'Inter', size: 10 },
                            color: '#94A3B8',
                            maxTicksLimit: 15
                        }
                    },
                    y: {
                        display: false, // Hide Y axis for cleaner "mini chart" look
                        grid: { display: false },
                        beginAtZero: true
                    }
                },
                animation: {
                    y: {
                        duration: 1000,
                        easing: 'easeOutElastic'
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        UI.showToast('Failed to load dashboard data.', 'error');
    }
}
