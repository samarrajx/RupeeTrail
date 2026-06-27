// js/reports.js

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('rupeetrail_auth_token')) {
        window.location.href = 'index.html';
        return;
    }
    
    document.getElementById('timeframeFilter').addEventListener('change', (e) => {
        renderReport(e.target.value);
    });

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', generatePDF);
    }

    fetchAndRenderReport();
});

let allTransactions = [];
let accountsList = [];

// Store computed data for PDF export
let currentReportData = {
    timeframeLabel: '',
    totalIncome: 0,
    totalExpense: 0,
    netSavings: 0,
    categories: [],
    transactions: []
};

async function fetchAndRenderReport() {
    try {
        const [txs, accs] = await Promise.all([
            State.fetchTransactions(),
            State.fetchAccounts()
        ]);
        allTransactions = txs;
        accountsList = accs;
        renderReport(document.getElementById('timeframeFilter').value);
    } catch (err) {
        console.error("Failed to load reports data:", err);
        UI.showToast("Failed to load report data", "error");
    }
}

// Fixed distinct colors for categories
const categoryColors = [
    '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
    '#EC4899', '#06B6D4', '#14B8A6', '#F97316', '#64748B'
];

function renderReport(timeframe) {
    const now = new Date();
    let startDate, endDate, timeframeLabel;

    if (timeframe === 'thisMonth') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        timeframeLabel = 'This Month';
    } else if (timeframe === 'lastMonth') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        timeframeLabel = 'Last Month';
    } else { // YTD
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = now;
        timeframeLabel = 'Year to Date';
    }

    // Filter
    const filteredTxs = allTransactions.filter(tx => {
        if (!tx.date) return false;
        const txDate = new Date(tx.date);
        return txDate >= startDate && txDate <= endDate;
    });

    // Sort newest first
    filteredTxs.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 1. Stats Calculation
    let totalIncome = 0;
    let totalExpense = 0;
    
    filteredTxs.forEach(tx => {
        if (tx.type === 'income') totalIncome += tx.amount;
        if (tx.type === 'expense' || tx.type === 'transfer') totalExpense += tx.amount;
    });

    const netSavings = totalIncome - totalExpense;

    document.getElementById('statIncome').textContent = UI.formatCurrency(totalIncome);
    document.getElementById('statExpense').textContent = UI.formatCurrency(totalExpense);
    document.getElementById('statSavings').textContent = UI.formatCurrency(netSavings);
    
    const savingsEl = document.getElementById('statSavings');
    if (netSavings >= 0) {
        savingsEl.style.color = 'var(--color-success, #10B981)';
    } else {
        savingsEl.style.color = 'var(--color-danger, #EF4444)';
    }

    // 2. Category Breakdown (Expenses only)
    const categoryMap = {};
    const expenses = filteredTxs.filter(tx => tx.type === 'expense');
    
    expenses.forEach(tx => {
        if (!categoryMap[tx.category]) {
            categoryMap[tx.category] = { name: tx.category, amount: 0 };
        }
        categoryMap[tx.category].amount += tx.amount;
    });
    
    const categories = Object.values(categoryMap).sort((a, b) => b.amount - a.amount);
    // Assign colors based on rank
    categories.forEach((cat, idx) => {
        cat.color = categoryColors[idx % categoryColors.length];
        cat.percentage = totalExpense > 0 ? ((cat.amount / totalExpense) * 100).toFixed(1) : 0;
    });

    // Save to global state for export
    currentReportData = {
        timeframeLabel,
        totalIncome,
        totalExpense,
        netSavings,
        categories,
        transactions: filteredTxs
    };

    // 3. Trend Chart Data (Daily or Monthly)
    let trendLabels = [];
    let trendData = [];
    
    if (timeframe === 'ytd') {
        // Group by Month for YTD
        const monthlyData = new Array(now.getMonth() + 1).fill(0);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        expenses.forEach(tx => {
            const m = new Date(tx.date).getMonth();
            if (m <= now.getMonth()) {
                monthlyData[m] += tx.amount;
            }
        });
        
        trendLabels = monthNames.slice(0, now.getMonth() + 1);
        trendData = monthlyData;
    } else {
        // Group by Day for Month
        const daysInMonth = endDate.getDate();
        const dailyData = new Array(daysInMonth).fill(0);
        
        expenses.forEach(tx => {
            const d = new Date(tx.date).getDate();
            dailyData[d - 1] += tx.amount;
        });
        
        trendLabels = Array.from({length: daysInMonth}, (_, i) => `${i + 1}`);
        trendData = dailyData;
    }

    // Render Charts
    ChartsManager.destroyChart('categoryChart');
    ChartsManager.destroyChart('trendChart');

    const catCtx = document.getElementById('categoryChart').getContext('2d');
    const trendCtx = document.getElementById('trendChart').getContext('2d');

    // Category Doughnut Chart
    if (categories.length > 0) {
        new Chart(catCtx, {
            type: 'doughnut',
            data: {
                labels: categories.map(c => c.name),
                datasets: [{
                    data: categories.map(c => c.amount),
                    backgroundColor: categories.map(c => c.color),
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                animation: { duration: 1000, easing: 'easeOutQuart' },
                plugins: {
                    tooltip: {
                        enabled: true,
                        position: 'nearest',
                        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim(),
                        titleColor: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim(),
                        bodyColor: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim()
                    },
                    legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Inter' } } }
                }
            }
        });
    } else {
        // Empty state chart
        new Chart(catCtx, {
            type: 'doughnut',
            data: {
                labels: ['No Data'],
                datasets: [{ data: [1], backgroundColor: [getComputedStyle(document.documentElement).getPropertyValue('--border-light').trim()], borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '70%',
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                plugins: { tooltip: { enabled: false, position: 'nearest' }, legend: { display: false } }
            }
        });
    }

    // Trend Bar Chart
    const gradient = trendCtx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, '#818CF8'); // Primary light
    gradient.addColorStop(1, '#4F46E5'); // Primary

    new Chart(trendCtx, {
        type: 'bar',
        data: {
            labels: trendLabels,
            datasets: [{
                label: 'Spending',
                data: trendData,
                backgroundColor: gradient,
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            animation: { duration: 1000, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    position: 'nearest',
                    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim(),
                    titleColor: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim(),
                    bodyColor: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim(),
                    callbacks: { label: (ctx) => ' ' + UI.formatCurrency(ctx.raw) }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: { 
                    border: { display: false },
                    grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-light').trim() },
                    beginAtZero: true,
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim(),
                        callback: function(value) {
                            if (value >= 1000) return '₹' + (value/1000).toFixed(0) + 'k';
                            return '₹' + value;
                        }
                    }
                }
            }
        }
    });

    // Populate Table
    const tbody = document.getElementById('breakdownTableBody');
    if (categories.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: var(--space-4); color: var(--text-muted);">No expenses for this period.</td></tr>`;
    } else {
        tbody.innerHTML = categories.map((cat) => `
            <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: var(--space-3) var(--space-2); display: flex; align-items: center; gap: var(--space-2);">
                    <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${UI.escapeHtml(cat.color)};"></div>
                    ${UI.escapeHtml(cat.name)}
                </td>
                <td style="padding: var(--space-3) var(--space-2); text-align: right; font-weight: var(--font-weight-medium);">
                    ${UI.formatCurrency(cat.amount)}
                </td>
                <td style="padding: var(--space-3) var(--space-2); text-align: right; color: var(--text-muted);">
                    ${cat.percentage}%
                </td>
            </tr>
        `).join('');
    }
}

// Generate PDF Export
function generatePDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        UI.showToast("PDF Library not loaded.", "error");
        return;
    }

    const doc = new window.jspdf.jsPDF();
    const data = currentReportData;
    const primaryColor = [79, 70, 229]; // #4F46E5

    // Title
    doc.setFontSize(22);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('RupeeTrail', 14, 22);

    // Subtitle & Date
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Financial Report: ${data.timeframeLabel}`, 14, 30);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 14, 36);

    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('Summary', 14, 50);
    
    doc.autoTable({
        startY: 55,
        head: [['Total Income', 'Total Expenses', 'Net Savings']],
        body: [[
            'Rs. ' + data.totalIncome.toLocaleString('en-IN'),
            'Rs. ' + data.totalExpense.toLocaleString('en-IN'),
            'Rs. ' + data.netSavings.toLocaleString('en-IN')
        ]],
        theme: 'grid',
        headStyles: { fillColor: primaryColor, textColor: 255 },
        styles: { fontSize: 12, halign: 'center' }
    });

    let currentY = doc.lastAutoTable.finalY + 15;

    // Category Breakdown Section
    if (data.categories.length > 0) {
        doc.setFontSize(14);
        doc.text('Category Breakdown (Expenses)', 14, currentY);
        
        const catRows = data.categories.map(c => [
            c.name,
            'Rs. ' + c.amount.toLocaleString('en-IN'),
            c.percentage + '%'
        ]);

        doc.autoTable({
            startY: currentY + 5,
            head: [['Category', 'Amount', '% of Total']],
            body: catRows,
            theme: 'striped',
            headStyles: { fillColor: [100, 116, 139] },
            styles: { fontSize: 10 }
        });
        currentY = doc.lastAutoTable.finalY + 15;
    }

    // Transactions List Section
    doc.setFontSize(14);
    doc.text('Transactions Log', 14, currentY);

    if (data.transactions.length > 0) {
        const txRows = data.transactions.map(tx => {
            const acc = accountsList.find(a => a.id === tx.accountId);
            const accName = acc ? acc.name : 'Unknown Account';
            const sign = tx.type === 'income' ? '+' : '-';
            return [
                tx.date,
                tx.title,
                tx.category,
                accName,
                `${sign} Rs. ${tx.amount.toLocaleString('en-IN')}`
            ];
        });

        doc.autoTable({
            startY: currentY + 5,
            head: [['Date', 'Title', 'Category', 'Account', 'Amount']],
            body: txRows,
            theme: 'plain',
            headStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0] },
            styles: { fontSize: 9 },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 4) {
                    // Color positive green and negative red
                    if (data.cell.text[0].startsWith('+')) {
                        data.cell.styles.textColor = [16, 185, 129];
                    } else if (data.cell.text[0].startsWith('-')) {
                        data.cell.styles.textColor = [239, 68, 68];
                    }
                }
            }
        });
    } else {
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text('No transactions found for this period.', 14, currentY + 10);
    }

    // Save PDF
    const filename = `RupeeTrail_Report_${data.timeframeLabel.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
}
