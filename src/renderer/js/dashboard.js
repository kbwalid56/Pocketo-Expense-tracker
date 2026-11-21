/* global App */
'use strict';

(function () {
  const app = window.App;

  const ICONS = {
    wallet: `<svg viewBox="0 0 24 24" fill="none"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><rect x="3" y="7.5" width="18" height="11.5" rx="2.5" stroke="currentColor" stroke-width="1.7"/><circle cx="16.5" cy="13.2" r="1.3" fill="currentColor"/></svg>`,
    down: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v16m0 0 6-6m-6 6-6-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    up: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 20V4m0 0 6 6m-6-6-6 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    piggy: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 11a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v1a5 5 0 0 1-5 5H9l-3 3v-3.6A6 6 0 0 1 5 12v-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9.5" cy="11" r="1.1" fill="currentColor"/></svg>`,
  };

  const statCard = ({ label, value, note, icon, tone }) => `
    <div class="stat" style="--tint:${app.hexToRgba(tone, 0.16)};--chip:${app.hexToRgba(tone, 0.14)};--chip-color:${tone}">
      <div class="stat-top">
        <span class="stat-label">${app.esc(label)}</span>
        <span class="stat-icon">${ICONS[icon]}</span>
      </div>
      <div class="stat-value">${app.esc(value)}</div>
      <div class="stat-foot">${note}</div>
    </div>`;

  const deltaNote = (label, delta) => {
    if (delta === null) return `<span>${label}</span>`;
    const up = delta >= 0;
    return `<span class="${up ? 'up' : 'down'}">${up ? '↑' : '↓'} ${Math.abs(delta).toFixed(0)}%</span><span>${label}</span>`;
  };

  app.views.dashboard = async (root) => {
    const data = await app.call(window.api.dashboard());
    const theme = app.chartTheme();
    const totals = data.totals;
    const month = data.monthTotals;
    const savingsRate = month.income > 0 ? Math.round((month.savings / month.income) * 100) : 0;

    const previous = data.series[data.series.length - 2] || { income: 0, expense: 0 };
    const incomeDelta = previous.income > 0 ? ((month.income - previous.income) / previous.income) * 100 : null;
    const expenseDelta = previous.expense > 0 ? ((month.expense - previous.expense) / previous.expense) * 100 : null;

    const budgets = data.budgets;
    const overall = budgets.overall;
    const overallPct = overall && overall.amount > 0 ? Math.min(100, (overall.spent / overall.amount) * 100) : 0;

    root.innerHTML = `
      <div class="view-inner">
        <div class="stat-grid">
          ${statCard({
            label: 'Available balance',
            value: app.money(totals.balance),
            note: `<span>${data.transactionCount} transaction${data.transactionCount === 1 ? '' : 's'} recorded</span>`,
            icon: 'wallet',
            tone: '#7c6cf6',
          })}
          ${statCard({
            label: 'Total income',
            value: app.money(totals.income),
            note: deltaNote('vs last month', incomeDelta),
            icon: 'down',
            tone: '#2fd39a',
          })}
          ${statCard({
            label: 'Total expenses',
            value: app.money(totals.expense),
            note: deltaNote('vs last month', expenseDelta),
            icon: 'up',
            tone: '#fb6b7d',
          })}
          ${statCard({
            label: `Savings · ${app.monthLabel(data.month, true)}`,
            value: app.money(month.savings),
            note: `<span>${savingsRate}% of this month's income saved</span>`,
            icon: 'piggy',
            tone: '#f5b544',
          })}
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-head">
              <div>
                <h2>Income vs expenses</h2>
                <p>Last six months</p>
              </div>
              <div class="pill-group">
                <span class="chip income">Income</span>
                <span class="chip expense">Expense</span>
              </div>
            </div>
            <div class="card-body">
              ${
                data.transactionCount === 0
                  ? app.emptyState('No activity to chart yet', 'Add a few transactions and your monthly comparison will appear here.', 'chart')
                  : `<div class="chart-wrap"><canvas id="chart-months"></canvas></div>`
              }
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div>
                <h2>Spending by category</h2>
                <p>${app.monthLabel(data.month)}</p>
              </div>
            </div>
            <div class="card-body">
              ${
                data.categories.length === 0
                  ? app.emptyState('No expenses this month', 'Category distribution appears once you record expenses.', 'chart')
                  : `<div class="chart-wrap" style="height:190px"><canvas id="chart-categories"></canvas></div>
                     <div class="legend">
                       ${data.categories
                         .map((cat) => {
                           const share = month.expense > 0 ? (cat.total / month.expense) * 100 : 0;
                           return `<div class="legend-row">
                             <span class="dot" style="background:${app.esc(cat.color)}"></span>
                             <span class="legend-name">${app.esc(cat.name)}</span>
                             <span class="legend-value">${app.money(cat.total)}</span>
                             <span class="legend-share">${share.toFixed(0)}%</span>
                           </div>`;
                         })
                         .join('')}
                     </div>`
              }
            </div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-head">
              <div>
                <h2>Recent transactions</h2>
                <p>Your latest activity</p>
              </div>
              <button class="btn ghost small" data-action="all-transactions">View all</button>
            </div>
            <div class="card-body flush">
              ${
                data.recent.length === 0
                  ? `<div class="empty">
                       <strong>Nothing recorded yet</strong>
                       <p>Start by adding your first income or expense.</p>
                       <button class="btn primary small" data-action="add-tx" style="margin-top:6px">Add transaction</button>
                     </div>`
                  : `<div class="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Date</th><th>Transaction</th><th>Category</th><th class="num">Amount</th></tr>
                        </thead>
                        <tbody>
                          ${data.recent
                            .map(
                              (tx) => `
                            <tr>
                              <td class="nowrap muted">${app.formatDate(tx.date)}</td>
                              <td>
                                <div class="tx-name">
                                  <div class="tx-avatar" style="background:${app.esc(tx.category_color)}">${app.esc(app.initials(tx.title))}</div>
                                  <div style="min-width:0"><div class="tx-title">${app.esc(tx.title)}</div></div>
                                </div>
                              </td>
                              <td class="muted nowrap">${app.esc(tx.category)}</td>
                              <td class="num amount ${tx.type}">${app.signedMoney(tx.amount, tx.type)}</td>
                            </tr>`
                            )
                            .join('')}
                        </tbody>
                      </table>
                    </div>`
              }
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div>
                <h2>Budget utilization</h2>
                <p>${app.monthLabel(data.month)}</p>
              </div>
              <button class="btn ghost small" data-action="go-budgets">Manage</button>
            </div>
            <div class="card-body">
              ${
                !overall && budgets.items.length === 0
                  ? `<div class="empty">
                       <strong>No budgets set</strong>
                       <p>Create a monthly budget to keep spending in check.</p>
                       <button class="btn primary small" data-action="go-budgets" style="margin-top:6px">Set a budget</button>
                     </div>`
                  : `${
                      overall
                        ? `<div style="margin-bottom:16px">
                             <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
                               <span class="muted" style="font-size:12.5px">Monthly budget</span>
                               <span style="font-size:12.5px;font-weight:600">${app.money(overall.spent)} <span class="muted">/ ${app.money(overall.amount)}</span></span>
                             </div>
                             <div class="progress ${app.progressClass(overallPct)}"><span style="width:${Math.min(100, overallPct)}%"></span></div>
                             <div class="muted" style="font-size:12px;margin-top:7px">${overallPct.toFixed(0)}% used · ${app.money(Math.max(0, overall.amount - overall.spent))} left</div>
                           </div>`
                        : ''
                    }
                    <div style="display:flex;flex-direction:column;gap:14px">
                      ${budgets.items
                        .slice(0, 4)
                        .map((item) => {
                          const pct = item.amount > 0 ? (item.spent / item.amount) * 100 : 0;
                          return `<div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
                              <span style="display:flex;align-items:center;gap:8px;font-size:12.5px">
                                <span class="dot" style="background:${app.esc(item.color)}"></span>${app.esc(item.category)}
                              </span>
                              <span class="muted" style="font-size:12px">${app.money(item.spent)} / ${app.money(item.amount)}</span>
                            </div>
                            <div class="progress ${app.progressClass(pct)}"><span style="width:${Math.min(100, pct)}%"></span></div>
                          </div>`;
                        })
                        .join('')}
                    </div>`
              }
            </div>
          </div>
        </div>
      </div>`;

    root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'add-tx') app.openTransactionForm();
      if (action === 'all-transactions') app.navigate('transactions');
      if (action === 'go-budgets') app.navigate('budgets');
    });

    if (data.transactionCount > 0) {
      const monthsChart = root.querySelector('#chart-months');
      if (monthsChart) {
        app.makeChart(monthsChart, {
          type: 'bar',
          data: {
            labels: data.series.map((row) => app.monthLabel(row.month, true)),
            datasets: [
              {
                label: 'Income',
                data: data.series.map((row) => row.income),
                backgroundColor: theme.income,
                borderRadius: 6,
                maxBarThickness: 22,
              },
              {
                label: 'Expenses',
                data: data.series.map((row) => row.expense),
                backgroundColor: theme.expense,
                borderRadius: 6,
                maxBarThickness: 22,
              },
            ],
          },
          options: {
            ...app.chartDefaults(),
            scales: {
              x: { grid: { display: false }, border: { display: false }, ticks: { color: theme.text } },
              y: {
                beginAtZero: true,
                grid: { color: theme.grid },
                border: { display: false },
                ticks: { color: theme.text, maxTicksLimit: 5, callback: (value) => app.shortMoney(value) },
              },
            },
          },
        });
      }

      const categoriesChart = root.querySelector('#chart-categories');
      if (categoriesChart && data.categories.length) {
        app.makeChart(categoriesChart, {
          type: 'doughnut',
          data: {
            labels: data.categories.map((cat) => cat.name),
            datasets: [
              {
                data: data.categories.map((cat) => cat.total),
                backgroundColor: data.categories.map((cat) => cat.color),
                borderWidth: 0,
                hoverOffset: 6,
                spacing: 2,
              },
            ],
          },
          options: {
            ...app.chartDefaults(),
            cutout: '70%',
            plugins: {
              ...app.chartDefaults().plugins,
              legend: { display: false },
            },
          },
        });
      }
    }
  };
})();
