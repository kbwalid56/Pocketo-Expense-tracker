/* global App */
'use strict';

(function () {
  const app = window.App;

  const TYPE_OPTIONS = `
    <option value="">All types</option>
    <option value="income">Income</option>
    <option value="expense">Expense</option>`;

  const SORT_OPTIONS = [
    ['date_desc', 'Newest first'],
    ['date_asc', 'Oldest first'],
    ['amount_desc', 'Highest amount'],
    ['amount_asc', 'Lowest amount'],
  ];

  const emptyRow = () => `
    <div class="empty">
      <svg viewBox="0 0 24 24" fill="none"><path d="M4 13h4l2 3h4l2-3h4M5 5h14l2 8v6H3v-6l2-8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
      <strong>No transactions found</strong>
      <p>Try adjusting your filters, or add a new transaction to get started.</p>
    </div>`;

  const rowHtml = (tx) => `
    <tr>
      <td class="nowrap muted">${app.formatDate(tx.date)}</td>
      <td>
        <div class="tx-name">
          <div class="tx-avatar" style="background:${app.esc(tx.category_color)}">${app.esc(app.initials(tx.title))}</div>
          <div style="min-width:0">
            <div class="tx-title">${app.esc(tx.title)}</div>
            ${tx.notes ? `<div class="tx-note">${app.esc(tx.notes)}</div>` : ''}
          </div>
        </div>
      </td>
      <td>
        <span class="chip"><span class="dot" style="background:${app.esc(tx.category_color)}"></span>${app.esc(tx.category)}</span>
      </td>
      <td><span class="chip ${tx.type}">${tx.type === 'income' ? 'Income' : 'Expense'}</span></td>
      <td class="muted nowrap">${app.esc(tx.payment_method)}</td>
      <td class="num amount ${tx.type}">${app.signedMoney(tx.amount, tx.type)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit="${tx.id}" title="Edit transaction">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
          </button>
          <button class="icon-btn danger" data-delete="${tx.id}" title="Delete transaction">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`;

  app.views.transactions = async (root) => {
    const filters = app.state.txFilters;

    root.innerHTML = `
      <div class="view-inner">
        <div class="card">
          <div class="toolbar">
            <div class="search-field">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              <input type="search" id="f-search" placeholder="Search by title…" value="${app.esc(filters.search)}" />
            </div>
            <select id="f-type" class="compact">${TYPE_OPTIONS}</select>
            <select id="f-category" class="compact">
              <option value="">All categories</option>
              ${app.state.categories
                .map((c) => `<option value="${c.id}">${app.esc(c.name)} (${c.type === 'income' ? 'income' : 'expense'})</option>`)
                .join('')}
            </select>
            <input type="date" id="f-from" class="compact" title="From date" value="${app.esc(filters.from)}" />
            <input type="date" id="f-to" class="compact" title="To date" value="${app.esc(filters.to)}" />
            <select id="f-sort" class="compact">
              ${SORT_OPTIONS.map(
                ([value, label]) => `<option value="${value}" ${filters.sort === value ? 'selected' : ''}>${label}</option>`
              ).join('')}
            </select>
            <button class="btn ghost small" id="f-reset">Reset</button>
          </div>
          <div id="tx-results"></div>
        </div>
      </div>`;

    const container = root.querySelector('#tx-results');
    const typeSelect = root.querySelector('#f-type');
    const categorySelect = root.querySelector('#f-category');

    typeSelect.value = filters.type;
    categorySelect.value = filters.category_id;

    const refresh = async () => {
      const data = await app.call(window.api.transactions.list(filters));
      const net = data.income - data.expense;

      container.innerHTML = data.rows.length
        ? `<div class="table-wrap">
             <table>
               <thead>
                 <tr>
                   <th>Date</th><th>Transaction</th><th>Category</th><th>Type</th><th>Payment</th>
                   <th class="num">Amount</th><th></th>
                 </tr>
               </thead>
               <tbody>${data.rows.map(rowHtml).join('')}</tbody>
             </table>
           </div>
           <div style="display:flex;flex-wrap:wrap;gap:22px;justify-content:flex-end;padding:14px 18px;border-top:1px solid var(--border-soft);font-size:12.5px">
             <span class="muted">${data.total} record${data.total === 1 ? '' : 's'}</span>
             <span class="text-income">Income ${app.money(data.income)}</span>
             <span class="text-expense">Expenses ${app.money(data.expense)}</span>
             <span style="font-weight:600">Net ${app.money(net)}</span>
           </div>`
        : emptyRow();
    };

    root.querySelector('#f-search').addEventListener(
      'input',
      app.debounce((event) => {
        filters.search = event.target.value.trim();
        refresh();
      }, 180)
    );

    typeSelect.addEventListener('change', () => {
      filters.type = typeSelect.value;
      refresh();
    });

    categorySelect.addEventListener('change', () => {
      filters.category_id = categorySelect.value;
      refresh();
    });

    for (const key of ['from', 'to']) {
      root.querySelector(`#f-${key}`).addEventListener('change', (event) => {
        filters[key] = event.target.value;
        refresh();
      });
    }

    root.querySelector('#f-sort').addEventListener('change', (event) => {
      filters.sort = event.target.value;
      refresh();
    });

    root.querySelector('#f-reset').addEventListener('click', () => {
      Object.assign(filters, { search: '', type: '', category_id: '', from: '', to: '', sort: 'date_desc' });
      app.render('transactions');
    });

    container.addEventListener('click', async (event) => {
      const editId = event.target.closest('[data-edit]')?.dataset.edit;
      const deleteId = event.target.closest('[data-delete]')?.dataset.delete;

      if (editId) {
        const tx = await app.call(window.api.transactions.get(Number(editId)));
        app.openTransactionForm(tx);
      }

      if (deleteId) {
        const tx = await app.call(window.api.transactions.get(Number(deleteId)));
        const confirmed = await app.confirm({
          title: 'Delete transaction',
          message: `"${tx.title}" will be permanently removed. Dashboard totals and budgets update immediately.`,
          confirmText: 'Delete',
        });
        if (!confirmed) return;
        try {
          await app.call(window.api.transactions.remove(tx.id));
          app.toast('Transaction deleted.');
          await app.afterChange();
        } catch (error) {
          app.toast(error.message, 'error');
        }
      }
    });

    await refresh();
  };

  /* --------------------------------------------------------- transaction form */

  app.openTransactionForm = (tx = null) => {
    const isEdit = Boolean(tx);
    let type = tx?.type || 'expense';
    const methods = app.state.settings.paymentMethods || [];

    const body = `
      <form id="tx-form" class="form-grid" novalidate>
        <div class="span-2">
          <div class="segmented" id="tx-type">
            <button type="button" data-type="expense" class="${type === 'expense' ? 'active' : ''}">Expense</button>
            <button type="button" data-type="income" class="${type === 'income' ? 'active' : ''}">Income</button>
          </div>
        </div>
        <div class="field span-2">
          <label for="tx-title">Title</label>
          <input id="tx-title" name="title" type="text" maxlength="100" placeholder="e.g. Groceries at Shwapno" value="${app.esc(tx?.title || '')}" />
        </div>
        <div class="field">
          <label for="tx-amount">Amount</label>
          <input id="tx-amount" name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" value="${tx ? tx.amount : ''}" />
        </div>
        <div class="field">
          <label for="tx-date">Date</label>
          <input id="tx-date" name="date" type="date" value="${app.esc(tx?.date || app.todayKey())}" />
        </div>
        <div class="field">
          <label for="tx-category">Category</label>
          <select id="tx-category" name="category_id"></select>
        </div>
        <div class="field">
          <label for="tx-method">Payment method</label>
          <select id="tx-method" name="payment_method">
            ${methods
              .map(
                (method) =>
                  `<option value="${app.esc(method)}" ${tx?.payment_method === method ? 'selected' : ''}>${app.esc(method)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field span-2">
          <label for="tx-notes">Notes (optional)</label>
          <textarea id="tx-notes" name="notes" maxlength="500" placeholder="Add a short description…">${app.esc(tx?.notes || '')}</textarea>
        </div>
        <div class="span-2" id="tx-error"></div>
      </form>`;

    const modal = app.modal({
      title: isEdit ? 'Edit transaction' : 'New transaction',
      subtitle: isEdit ? 'Update the details and save your changes.' : 'Record money coming in or going out.',
      body,
      footer: `<button class="btn" data-cancel>Cancel</button>
               <button class="btn primary" data-save>${isEdit ? 'Save changes' : 'Add transaction'}</button>`,
    });

    const form = modal.el.querySelector('#tx-form');
    const categorySelect = form.querySelector('#tx-category');
    const errorBox = form.querySelector('#tx-error');

    const fillCategories = (selectedId) => {
      const categories = app.categoriesOf(type);
      categorySelect.innerHTML = categories
        .map(
          (c) =>
            `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${app.esc(c.name)}</option>`
        )
        .join('');
      if (!categories.length) {
        categorySelect.innerHTML = `<option value="">No ${type} categories</option>`;
      }
    };

    fillCategories(tx?.category_id);

    form.querySelector('#tx-type').addEventListener('click', (event) => {
      const button = event.target.closest('[data-type]');
      if (!button || button.dataset.type === type) return;
      type = button.dataset.type;
      form.querySelectorAll('#tx-type button').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
      fillCategories(null);
    });

    const showError = (message) => {
      errorBox.innerHTML = message ? `<div class="form-error">${app.esc(message)}</div>` : '';
    };

    const save = async () => {
      showError('');
      const payload = {
        title: form.querySelector('#tx-title').value.trim(),
        amount: form.querySelector('#tx-amount').value,
        type,
        category_id: categorySelect.value,
        date: form.querySelector('#tx-date').value,
        payment_method: form.querySelector('#tx-method').value,
        notes: form.querySelector('#tx-notes').value.trim(),
      };

      if (!payload.title) return showError('Please enter a title.');
      if (!(Number(payload.amount) > 0)) return showError('Amount must be greater than zero.');
      if (!payload.date) return showError('Please choose a date.');
      if (!payload.category_id) return showError(`Please choose a ${type} category.`);

      const saveButton = modal.el.querySelector('[data-save]');
      saveButton.disabled = true;
      try {
        if (isEdit) {
          await app.call(window.api.transactions.update(tx.id, payload));
        } else {
          await app.call(window.api.transactions.create(payload));
        }
        modal.close();
        app.toast(isEdit ? 'Transaction updated.' : 'Transaction added.');
        await app.afterChange();
        if (payload.type === 'expense' && typeof app.checkBudgetAlerts === 'function') {
          await app.checkBudgetAlerts(payload.date.slice(0, 7));
        }
      } catch (error) {
        saveButton.disabled = false;
        showError(error.message);
      }
    };

    modal.el.querySelector('[data-save]').addEventListener('click', save);
    modal.el.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      save();
    });
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        save();
      }
    });
  };
})();
