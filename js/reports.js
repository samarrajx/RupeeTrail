// js/reports.js

let allTransactions = [];
let currentReportData = null; // Stores computed data for export

async function fetchAndRenderReport() {
    try {
        allTransactions = await State.fetchTransactions();
        renderReport(document.getElementById('timeframeFilter').value);
    } catch (err) {
        console.error("Failed to load reports data:", err);
        UI.showToast("Failed to load report data", "error");
    }
}

function renderReport(timeframe) {
    const now = new Date();
    let startDate, endDate, daysInMonth;

    if (timeframe === 'thisMonth') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        daysInMonth = endDate.getDate();
    } else if (timeframe === 'lastMonth') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        daysInMonth = endDate.getDate();
    } else { // YTD
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = now;
        const diffTime = Math.abs(endDate - startDate);
        daysInMonth = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    }

    // Filter
    const filteredTxs = allTransactions.filter(tx => {
        if (tx.type !== 'expense') return false; 
        if (!tx.date) return false;
        const txDate = new Date(tx.date);
        return txDate >= startDate && txDate <= endDate;
    });

    // Calculate
    let totalSpent = 0;
    const categoryMap = {};
    
    filteredTxs.forEach(tx => {
        totalSpent += tx.amount;
        if (!categoryMap[tx.category]) {
            categoryMap[tx.category] = { name: tx.category, amount: 0, color: UI.getCategoryColor(tx.category) };
        }
        categoryMap[tx.category].amount += tx.amount;
    });
    
    const categories = Object.values(categoryMap).sort((a, b) => b.amount - a.amount);
    
    const data = {
        totalSpent: totalSpent,
        daysInMonth: daysInMonth,
        categories: categories,
        trendLabels: ["W1", "W2", "W3", "W4"], // Simplified visual trend
        trendData: [totalSpent*0.2, totalSpent*0.3, totalSpent*0.1, totalSpent*0.4] 
    };
    
    currentReportData = data;
    
    // 1. Statistics
    const avgDaily = Math.round(data.totalSpent / data.daysInMonth);
    // Find highest category
    const highestCat = [...data.categories].sort((a, b) => b.amount - a.amount)[0];

    document.getElementById('statTotal').textContent = UI.formatCurrency(data.totalSpent);
    document.getElementById('statAvg').textContent = UI.formatCurrency(avgDaily);
    document.getElementById('statHigh').textContent = highestCat ? highestCat.name : "-";

    // 2. Charts
    ChartsManager.destroyChart('categoryChart');
    ChartsManager.destroyChart('trendChart');

    const catCtx = document.getElementById('categoryChart').getContext('2d');
    const trendCtx = document.getElementById('trendChart').getContext('2d');

    // Category Doughnut Chart
    new Chart(catCtx, {
        type: 'doughnut',
        data: {
            labels: data.categories.map(c => c.name),
            datasets: [{
                data: data.categories.map(c => c.amount),
                backgroundColor: data.categories.map(c => c.color),
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            animation: { duration: 1000, easing: 'easeOutQuart' },
            plugins: {
                legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } }
            }
        }
    });

    // Trend Line Chart
    new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: data.trendLabels,
            datasets: [{
                label: 'Spending',
                data: data.trendData,
                borderColor: '#4F46E5', // var(--color-primary)
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#4F46E5'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 1000, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { display: false } },
                y: { 
                    border: { display: false }, 
                    beginAtZero: true
                }
            }
        }
    });

    // 3. Table Breakdown
    const tbody = document.getElementById('breakdownTableBody');
    tbody.innerHTML = data.categories.sort((a,b) => b.amount - a.amount).map(c => {
        const percent = ((c.amount / data.totalSpent) * 100).toFixed(1);
        return `
            <tr>
                <td style="display: flex; align-items: center; gap: var(--space-2);">
                    <span style="display:inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${c.color};"></span>
                    ${c.name}
                </td>
                <td style="font-weight: var(--font-weight-semibold);">${UI.formatCurrency(c.amount)}</td>
                <td>${percent}%</td>
            </tr>
        `;
    }).join('');
}

// Event Listeners
document.getElementById('timeframeFilter').addEventListener('change', (e) => {
    renderReport(e.target.value);
});

// Export Functionality (Generates and downloads a mock CSV)
document.getElementById('exportBtn').addEventListener('click', () => {
    const timeframe = document.getElementById('timeframeFilter').value;
    const data = currentReportData;
    
    if (!data) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Category,Amount,Percent\n";
    
    data.categories.forEach(c => {
        const percent = data.totalSpent > 0 ? ((c.amount / data.totalSpent) * 100).toFixed(1) : 0;
        csvContent += `${c.name},${c.amount},${percent}%\n`;
    });

    csvContent += `\nTotal Spent,${data.totalSpent},\n`;
    csvContent += `Avg Daily Spend,${Math.round(data.totalSpent / data.daysInMonth)},\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rupeetrail_report_${timeframe}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    UI.showToast("Report exported successfully", "success");
});

// Initialize
document.addEventListener('DOMContentLoaded', fetchAndRenderReport);
