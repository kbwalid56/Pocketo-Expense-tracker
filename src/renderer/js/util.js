/* global Chart */
'use strict';

window.App = window.App || {};

(function () {
  const app = window.App;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SYMBOLS = {
    BDT: '৳',
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    CNY: 'CN¥',
    PKR: '₨',
    MYR: 'RM',
    SGD: 'S$',
  };

  app.views = {};
  app.state = {
    settings: { currency: 'BDT', theme: 'dark', paymentMethods: [], currencies: [] },
    categories: [],
    view: 'dashboard',
    charts: [],
    txFilters: { search: '', type: '', category_id: '', from: '', to: '', sort: 'date_desc' },
    budgetMonth: '',
    reportRange: null,
  };

  /* ------------------------------------------------------------- formatting */

  const pad = (n) => String(n).padStart(2, '0');

  app.symbol = (code) => SYMBOLS[code || app.state.settings.currency] || code || '';

  app.money = (value, options = {}) => {
    const amount = Number(value) || 0;
    const negative = amount < 0;
    const body = Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: options.decimals === 0 ? 0 : 2,
      maximumFractionDigits: options.decimals === 0 ? 0 : 2,
    });
    return `${negative ? '-' : ''}${app.symbol()}${body}`;
  };

  app.signedMoney = (value, type) => `${type === 'income' ? '+' : '-'}${app.money(Math.abs(value))}`;

  app.shortMoney = (value) => {
    const amount = Number(value) || 0;
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 1000000) return `${sign}${app.symbol()}${(abs / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (abs >= 1000) return `${sign}${app.symbol()}${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return `${sign}${app.symbol()}${Math.round(abs)}`;
  };

  app.todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  app.currentMonth = () => app.todayKey().slice(0, 7);

  app.formatDate = (iso) => {
    if (!iso) return '';
    const [year, month, day] = String(iso).split('-');
    if (!year || !month || !day) return iso;
    return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
  };

  app.formatDateLong = (iso) => {
    if (!iso) return '';
    const [year, month, day] = String(iso).split('-');
    const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${Number(day)} ${full[Number(month) - 1]} ${year}`;
  };

  app.monthLabel = (key, short) => {
    if (!key) return '';
    const [year, month] = String(key).split('-');
    return short ? MONTHS[Number(month) - 1] : `${MONTHS[Number(month) - 1]} ${year}`;
  };

  app.monthOffset = (key, offset) => {
    const [year, month] = key.split('-').map(Number);
    const d = new Date(year, month - 1 + offset, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };

  app.esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  app.initials = (name) =>
    String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();

  app.hexToRgba = (hex, alpha) => {
    const value = String(hex || '#94a3b8').replace('#', '');
    const num = parseInt(value.length === 3 ? value.split('').map((c) => c + c).join('') : value, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  /* ------------------------------------------------------------------ api */

  app.call = async (promise) => {
    const result = await promise;
    if (!result || !result.ok) throw new Error((result && result.error) || 'Something went wrong.');
    return result.data;
  };

  app.refreshCategories = async () => {
    app.state.categories = await app.call(window.api.categories.list());
    return app.state.categories;
  };

  app.categoriesOf = (type) => app.state.categories.filter((c) => c.type === type);

  app.categoryOptions = (type, selected) =>
    app
      .categoriesOf(type)
      .map(
        (c) =>
          `<option value="${c.id}" ${String(c.id) === String(selected) ? 'selected' : ''}>${app.esc(c.name)}</option>`
      )
      .join('');

  /* --------------------------------------------------------------- toasts */

  app.toast = (message, type = 'success', timeout = 3800) => {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon"></span><div class="toast-body">${app.esc(message)}</div>`;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .2s ease, transform .2s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 200);
    }, timeout);
  };

  /* --------------------------------------------------------------- modals */

  app.modal = ({ title, subtitle = '', body = '', footer = '', size = '', onClose } = {}) => {
    const root = document.getElementById('modal-root');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div>
            <h3>${app.esc(title)}</h3>
            ${subtitle ? `<p>${subtitle}</p>` : ''}
          </div>
          <button class="icon-btn" data-close aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;

    root.appendChild(backdrop);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      if (typeof onClose === 'function') onClose();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };

    backdrop.querySelector('[data-close]').addEventListener('click', close);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) close();
    });
    document.addEventListener('keydown', onKey);

    const focusable = backdrop.querySelector('input, select, textarea, button:not([data-close])');
    if (focusable) setTimeout(() => focusable.focus(), 30);

    return { el: backdrop.querySelector('.modal'), root: backdrop, close };
  };

  app.confirm = ({ title, message, confirmText = 'Delete', cancelText = 'Cancel', danger = true }) =>
    new Promise((resolve) => {
      let answered = false;
      const done = (value) => {
        answered = true;
        resolve(value);
      };
      const modal = app.modal({
        title,
        subtitle: message,
        size: 'small',
        footer: `<button class="btn" data-cancel>${app.esc(cancelText)}</button>
                 <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${app.esc(confirmText)}</button>`,
        onClose: () => {
          if (!answered) resolve(false);
        },
      });
      modal.el.querySelector('[data-cancel]').addEventListener('click', () => {
        done(false);
        modal.close();
      });
      modal.el.querySelector('[data-ok]').addEventListener('click', () => {
        done(true);
        modal.close();
      });
    });

  /* --------------------------------------------------------------- charts */

  app.chartTheme = () => {
    const styles = getComputedStyle(document.body);
    return {
      text: styles.getPropertyValue('--muted').trim() || '#75849a',
      grid: styles.getPropertyValue('--grid').trim() || 'rgba(255,255,255,0.06)',
      surface: styles.getPropertyValue('--surface').trim() || '#101825',
      income: '#2fd39a',
      expense: '#fb6b7d',
      accent: '#7c6cf6',
    };
  };

  app.chartDefaults = () => {
    const theme = app.chartTheme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 320 },
      plugins: {
        legend: {
          labels: {
            color: theme.text,
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 7,
            boxHeight: 7,
            padding: 16,
            font: { size: 11.5 },
          },
        },
        tooltip: {
          backgroundColor: theme.surface,
          borderColor: theme.grid,
          borderWidth: 1,
          titleColor: theme.text,
          bodyColor: theme.text,
          padding: 10,
          displayColors: true,
          boxWidth: 7,
          boxHeight: 7,
          usePointStyle: true,
          callbacks: {
            label: (ctx) => `  ${ctx.dataset.label || ctx.label}: ${app.money(ctx.parsed.y ?? ctx.parsed)}`,
          },
        },
      },
    };
  };

  app.makeChart = (canvas, config) => {
    if (!canvas || typeof Chart === 'undefined') return null;
    const chart = new Chart(canvas, config);
    app.state.charts.push(chart);
    return chart;
  };

  app.destroyCharts = () => {
    for (const chart of app.state.charts) {
      try {
        chart.destroy();
      } catch {
        /* ignore */
      }
    }
    app.state.charts = [];
  };

  /* ----------------------------------------------------------------- misc */

  app.emptyState = (title, description, icon = 'inbox') => {
    const icons = {
      inbox: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 13h4l2 3h4l2-3h4M5 5h14l2 8v6H3v-6l2-8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
      chart: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 20V10m5 10V4m5 16v-7m5 7V8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    };
    return `<div class="empty">${icons[icon] || icons.inbox}<strong>${app.esc(title)}</strong><p>${app.esc(description)}</p></div>`;
  };

  app.progressClass = (percent) => (percent >= 100 ? 'over' : percent >= 80 ? 'warn' : 'ok');

  app.debounce = (fn, wait = 220) => {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };
})();
