/* global App */
'use strict';

(function () {
  const app = window.App;

  const PRESETS = [
    ['this-month', 'This month'],
    ['last-month', 'Last month'],
    ['last-3', 'Last 3 months'],
    ['this-year', 'This year'],
  ];

  const statBlock = (label, value, note, color) => `
    <div class="stat" style="--tint:${app.hexToRgba(color, 0.14)};--chip:${app.hexToRgba(color, 0.14)};--chip-color:${color}">
      <div class="stat-top"><span class="stat-label">${app.esc(label)}</span></div>
      <div class="stat-value">${app.esc(value)}</div>
      <div class="stat-foot">${note}</div>
    </div>`;

  function presetRange(key) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const first = (year, month) => `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = (year, month) => new Date(year, month + 1, 0).getDate();
    const end = (year, month) => `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay(year, month)).padStart(2, '0')}`;

    if (key === 'this-month') return { from: first(y, m), to: app.todayKey() };
    if (key === 'last-month') {
      const d = new Date(y, m - 1, 1);
      return { from: first(d.getFullYear(), d.getMonth()), to: end(d.getFullYear(), d.getMonth()) };
    }
    if (key === 'last-3') return { from: first(y, m - 2), to: app.todayKey() };
    if (key === 'this-year') return { from: `${y}-01-01`, to: app.todayKey() };
    return null;
  }

  app.views.reports = async (root) => {
    const range = app.state.reportRange || presetRange('this-month');
    app.state.reportRange = range;
    const data = await app.call(window.api.reports(range));
    const theme = app.chartTheme();
    const totals = data.totals;

    root.innerHTML = `
      <div class="view-inner">
        <div class="card">
          <div class="toolbar">
            <div class="pill-group">
              ${PRESETS.map(([key, label]) => `<button class="pill" data-preset="${key}">${label}</button>`).join('')}
            </div>
            <div style="display:flex;gap:10px;align-items:center;margin-left:auto">
              <input type="date" id="r-from" value="${app.esc(range.from)}" style="width:150px" />
              <span class="muted">to</span>
              <input type="date" id="r-to" value="${app.esc(range.to)}" style="width:150px" />
              <button class="btn primary" id="r-export">Export CSV</button>
            </div>
          </div>
          <div class="card-body" style="padding-top:14px">
            <span class="muted" style="font-size:12.5px">
              ${app.formatDate(data.from)} — ${app.formatDate(data.to)} · ${totals.count} transaction${totals.count === 1 ? '' : 's'}
              · average expense ${app.money(totals.averageExpense)}
            </span>
          </div>
        </div>

        <div class="stat-grid">
          ${statBlock('Income', app.money(totals.income), '<span>Money received in range</span>', '#2fd39a')}
          ${statBlock('Expenses', app.money(totals.expense), '<span>Money spent in range</span>', '#fb6b7d')}
          ${statBlock('Savings', app.money(totals.savings), '<span>Income minus expenses</span>', '#7c6cf6')}
          ${statBlock('Savings rate', `${totals.savingsRate.toFixed(0)}%`, '<span>Share of income kept</span>', '#f5b544')}
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-head">
              <div><h2>Monthly income vs expenses</h2><p>Comparison across the selected period</p></div>
            </div>
            <div class="card-body">
              ${
                data.months.length
                  ? `<div class="chart-wrap"><canvas id="r-months"></canvas></div>`
                  : app.emptyState('No data in this range', 'Pick a different date range or add transactions.', 'chart')
              }
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div><h2>Expense categories</h2><p>Where the money went</p></div>
            </div>
            <div class="card-body">
              ${
                data.categories.length
                  ? `<div class="chart-wrap" style="height:190px"><canvas id="r-categories"></canvas></div>
                     <div class="legend">
                       ${data.categories
                         .slice(0, 6)
                         .map(
                           (cat) => `<div class="legend-row">
                             <span class="dot" style="background:${app.esc(cat.color)}"></span>
                             <span class="legend-name">${app.esc(cat.name)}</span>
                             <span class="legend-value">${app.money(cat.total)}</span>
                             <span class="legend-share">${cat.share.toFixed(0)}%</span>
                           </div>`
                         )
                         .join('')}
                     </div>`
                  : app.emptyState('No expenses in range', 'Category analytics appear once expenses are recorded.', 'chart')
              }
            </div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-head"><div><h2>Category breakdown</h2><p>Expenses by category</p></div></div>
            <div class="card-body flush">
              ${
                data.categories.length
                  ? `<div class="table-wrap">
                       <table>
                         <thead><tr><th>Category</th><th>Transactions</th><th class="num">Amount</th><th style="width:150px">Share</th></tr></thead>
                         <tbody>
                           ${data.categories
                             .map(
                               (cat) => `<tr>
                                 <td>
                                   <span class="chip"><span class="dot" style="background:${app.esc(cat.color)}"></span>${app.esc(cat.name)}</span>
                                 </td>
                                 <td class="muted">${cat.count}</td>
                                 <td class="num amount">${app.money(cat.total)}</td>
                                 <td>
                                   <div style="display:flex;align-items:center;gap:8px">
                                     <div class="progress ok" style="flex:1;background:${app.hexToRgba(cat.color, 0.16)}">
                                       <span style="width:${cat.share}%;background:${app.esc(cat.color)}"></span>
                                     </div>
                                     <span class="muted" style="font-size:11.5px;width:34px;text-align:right">${cat.share.toFixed(0)}%</span>
                                   </div>
                                 </td>
                               </tr>`
                             )
                             .join('')}
                         </tbody>
                       </table>
                     </div>`
                  : app.emptyState('No expenses', 'Nothing to break down for this range.')
              }
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div><h2>Income sources & payment methods</h2><p>How money moved</p></div></div>
            <div class="card-body flush">
              ${
                data.incomeCategories.length || data.payments.length
                  ? `<div class="table-wrap">
                       <table>
                         <thead><tr><th>Source / method</th><th class="num">Income</th><th class="num">Expense</th></tr></thead>
                         <tbody>
                           ${data.incomeCategories
                             .map(
                               (cat) => `<tr>
                                 <td><span class="chip"><span class="dot" style="background:${app.esc(cat.color)}"></span>${app.esc(cat.name)}</span></td>
                                 <td class="num amount income">${app.money(cat.total)}</td>
                                 <td class="num muted">—</td>
                               </tr>`
                             )
                             .join('')}
                           ${data.payments
                             .map(
                               (row) => `<tr>
                                 <td class="muted">${app.esc(row.method)}</td>
                                 <td class="num ${row.income ? 'amount income' : 'muted'}">${row.income ? app.money(row.income) : '—'}</td>
                                 <td class="num ${row.expense ? 'amount expense' : 'muted'}">${row.expense ? app.money(row.expense) : '—'}</td>
                               </tr>`
                             )
                             .join('')}
                         </tbody>
                       </table>
                     </div>`
                  : app.emptyState('Nothing to summarise', 'Add transactions to see income sources and payment methods.')
              }
            </div>
          </div>
        </div>
      </div>`;

    const applyRange = (next) => {
      if (!next) return;
      app.state.reportRange = next;
      app.render('reports');
    };

    for (const button of root.querySelectorAll('[data-preset]')) {
      button.addEventListener('click', () => applyRange(presetRange(button.dataset.preset)));
    }

    root.querySelector('#r-from').addEventListener('change', (event) => {
      applyRange({ ...app.state.reportRange, from: event.target.value });
    });
    root.querySelector('#r-to').addEventListener('change', (event) => {
      applyRange({ ...app.state.reportRange, to: event.target.value });
    });

    root.querySelector('#r-export').addEventListener('click', async () => {
      try {
        const result = await app.call(window.api.data.exportCsv(app.state.reportRange));
        if (result.canceled) return;
        app.toast(`Exported ${result.count} transaction${result.count === 1 ? '' : 's'} to CSV.`);
      } catch (error) {
        app.toast(error.message, 'error');
      }
    });

    if (data.months.length) {
      app.makeChart(root.querySelector('#r-months'), {
        type: 'bar',
        data: {
          labels: data.months.map((row) => app.monthLabel(row.month)),
          datasets: [
            {
              label: 'Income',
              data: data.months.map((row) => row.income),
              backgroundColor: theme.income,
              borderRadius: 6,
              maxBarThickness: 26,
            },
            {
              label: 'Expenses',
              data: data.months.map((row) => row.expense),
              backgroundColor: theme.expense,
              borderRadius: 6,
              maxBarThickness: 26,
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

    if (data.categories.length) {
      const defaults = app.chartDefaults();
      app.makeChart(root.querySelector('#r-categories'), {
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
          ...defaults,
          cutout: '70%',
          plugins: { ...defaults.plugins, legend: { display: false } },
        },
      });
    }
  };
})();
