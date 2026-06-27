// charts.js - Centralized configuration for Chart.js instances

window.ChartsManager = (() => {
  // Global defaults for Chart.js
  Chart.defaults.font.family = "'Inter', sans-serif";
  
  function updateChartDefaults() {
    const style = getComputedStyle(document.documentElement);
    Chart.defaults.color = style.getPropertyValue('--text-secondary').trim();
    Chart.defaults.scale.grid.color = style.getPropertyValue('--border-light').trim();
    
    // Force re-render all existing charts
    for (const key in registry) {
      if (registry[key]) {
        registry[key].update();
      }
    }
    
    // Also notify charts manually drawn outside this registry if possible, 
    // or rely on page refresh / re-render logic in those pages.
  }

  // Initialize colors
  updateChartDefaults();

  // Watch for theme changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
        updateChartDefaults();
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true });
  
  // A registry to safely destroy charts before re-rendering
  const registry = {};

  function destroyChart(id) {
    if (registry[id]) {
      registry[id].destroy();
      delete registry[id];
    }
  }

  function renderDoughnut(canvasId, labels, data, colors) {
    destroyChart(canvasId);
    
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const chart = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        animation: {
          animateScale: true,
          animateRotate: true,
          duration: 800,
          easing: 'easeOutQuart'
        },
        plugins: {
          legend: { 
            position: 'right', 
            labels: { 
              usePointStyle: true, 
              boxWidth: 8, 
              font: { family: "'Inter', sans-serif" } 
            } 
          },
          tooltip: {
            backgroundColor: 'var(--bg-surface-hover)',
            titleColor: 'var(--text-primary)',
            bodyColor: 'var(--text-secondary)',
            borderColor: 'var(--border-light)',
            borderWidth: 1,
            padding: 10,
            displayColors: true,
            boxPadding: 4
          }
        }
      }
    });

    registry[canvasId] = chart;
    return chart;
  }

  function renderLineChart(canvasId, labels, data, color) {
    destroyChart(canvasId);

    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    const rgbColor = color === 'primary' ? '79, 70, 229' : '16, 185, 129'; // Default primary or secondary
    const hexColor = color === 'primary' ? '#4F46E5' : '#10B981';

    const chart = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Data',
          data: data,
          borderColor: hexColor,
          backgroundColor: `rgba(${rgbColor}, 0.1)`,
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointBackgroundColor: hexColor
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 1000,
          easing: 'easeOutQuart'
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'var(--bg-surface-hover)',
            titleColor: 'var(--text-primary)',
            bodyColor: 'var(--text-secondary)',
            borderColor: 'var(--border-light)',
            borderWidth: 1,
            intersect: false,
            mode: 'index',
          }
        },
        scales: {
          x: { 
            grid: { display: false },
            ticks: { maxRotation: 0 }
          },
          y: { 
            border: { display: false }, 
            beginAtZero: true,
            grid: { borderDash: [5, 5] },
            ticks: { 
              callback: function(value) { return '₹' + (value >= 1000 ? (value / 1000) + 'k' : value); }
            }
          }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false }
      }
    });

    registry[canvasId] = chart;
    return chart;
  }

  return { renderDoughnut, renderLineChart, destroyChart };
})();
