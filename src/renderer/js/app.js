/* global App */
'use strict';

(function () {
  const app = window.App;

  const PAGE_META = {
    dashboard: ['Dashboard', 'Your financial overview at a glance'],
    transactions: ['Transactions', 'Search, filter and manage every record'],
    budgets: ['Budgets', 'Set monthly limits and track utilization'],
    reports: ['Reports & analytics', 'Understand where your money goes'],
    categories: ['Categories', 'Organize income and expenses'],
    settings: ['Settings', 'Preferences, data and application information'],
  };

  app.applyTheme = (theme) => {
    document.body.dataset.theme = theme === 'light' ? 'light' : 'dark';
  };

  app.navigate = async (view) => {
    if (!PAGE_META[view]) view = 'dashboard';
    app.state.view = view;
    for (const button of document.querySelectorAll('.nav-item')) {
      button.classList.toggle('active', button.dataset.view === view);
    }
    const [title, subtitle] = PAGE_META[view];
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-subtitle').textContent = subtitle;

    await app.render(view);
  };

  app.render = async (view = app.state.view) => {
    const root = document.getElementById('view');
    app.destroyCharts();
    root.innerHTML = '';
    const target = document.createElement('div');
    root.appendChild(target);
    try {
      await app.views[view](target);
    } catch (error) {
      target.innerHTML = `<div class="view-inner"><div class="card">${app.emptyState(
        'Could not load this page',
        error.message || String(error)
      )}</div></div>`;
    }
    root.scrollTop = 0;
  };

  app.syncSidebar = async () => {
    try {
      const data = await app.call(window.api.dashboard());
      document.getElementById('sidebar-balance').textContent = app.money(data.totals.balance);
      document.getElementById('sidebar-hint').textContent =
        data.transactionCount === 0
          ? 'No transactions yet'
          : `${data.transactionCount} transaction${data.transactionCount === 1 ? '' : 's'} recorded`;
    } catch {
      /* sidebar is non critical */
    }
  };

  app.afterChange = async () => {
    await app.refreshCategories();
    await app.syncSidebar();
    await app.render(app.state.view);
  };

  app.init = async () => {
    const settings = await app.call(window.api.settings.get());
    app.state.settings = settings;
    app.applyTheme(settings.theme);
    app.state.budgetMonth = app.currentMonth();
    app.state.reportRange = { from: `${app.currentMonth()}-01`, to: app.todayKey() };

    document.getElementById('today').textContent = app.formatDateLong(app.todayKey());

    await app.refreshCategories();

    if (typeof Chart !== 'undefined') {
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      Chart.defaults.font.size = 11;
    }

    for (const button of document.querySelectorAll('.nav-item')) {
      button.addEventListener('click', () => app.navigate(button.dataset.view));
    }

    document.getElementById('add-transaction').addEventListener('click', () => {
      app.openTransactionForm();
    });

    await app.syncSidebar();
    await app.navigate('dashboard');
  };
})();
