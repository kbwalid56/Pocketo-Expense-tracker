/* global App */
'use strict';

(function () {
  const app = window.App;

  const toneFor = (percent) => (percent >= 100 ? 'var(--expense)' : percent >= 80 ? 'var(--warning)' : 'var(--income)');

  const budgetItem = (item) => {
    const percent = item.amount > 0 ? (item.spent / item.amount) * 100 : 0;
    const remaining = item.amount - item.spent;
    return `
      <div class="budget-item">
        <div class="budget-item-head">
          <span class="dot" style="background:${app.esc(item.color)}"></span>
          <span class="name">${app.esc(item.category)}</span>
          <button class="icon-btn" data-edit="${item.id}" title="Edit budget">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
          </button>
          <button class="icon-btn danger" data-delete="${item.id}" title="Delete budget">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="progress ${app.progressClass(percent)}"><span style="width:${Math.min(100, percent)}%"></span></div>
        <div class="budget-item-foot">
          <span>${app.money(item.spent)} of ${app.money(item.amount)}</span>
          <span style="color:${remaining < 0 ? 'var(--expense)' : 'var(--muted)'}">
            ${remaining < 0 ? `${app.money(Math.abs(remaining))} over` : `${app.money(remaining)} left`}
          </span>
        </div>
      </div>`;
  };

  app.views.budgets = async (root) => {
    const month = app.state.budgetMonth || app.currentMonth();
    const data = await app.call(window.api.budgets.list(month));
    const overall = data.overall;
    const overallPercent = overall && overall.amount > 0 ? (overall.spent / overall.amount) * 100 : 0;

    const alerts = [];
    for (const item of data.items) {
      const percent = item.amount > 0 ? (item.spent / item.amount) * 100 : 0;
      if (percent >= 100) alerts.push({ name: item.category, percent, over: true });
      else if (percent >= 80) alerts.push({ name: item.category, percent, over: false });
    }
    if (overall) {
      const percent = overall.amount > 0 ? (overall.spent / overall.amount) * 100 : 0;
      if (percent >= 100) alerts.unshift({ name: 'Overall monthly budget', percent, over: true });
      else if (percent >= 80) alerts.unshift({ name: 'Overall monthly budget', percent, over: false });
    }

    root.innerHTML = `
      <div class="view-inner">
        <div class="section-title">
          <div>
            <div style="font-size:15px;font-weight:620">${app.monthLabel(month)}</div>
            <div class="muted" style="font-size:12.5px">${app.money(data.totalSpent)} spent across all categories</div>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            <input type="month" id="b-month" value="${app.esc(month)}" style="width:168px" />
            <button class="btn primary" id="b-add">Add category budget</button>
          </div>
        </div>

        ${
          alerts.length
            ? `<div class="banner ${alerts.some((a) => a.over) ? 'out' : ''}">
                 <svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5m0 3.5v.5M10.3 4.3 3.5 17a2 2 0 0 0 1.7 3h13.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                 <div>
                   <div style="font-weight:600;margin-bottom:2px">${alerts.length} budget${alerts.length === 1 ? '' : 's'} need attention</div>
                   <div class="muted">${alerts
                     .slice(0, 3)
                     .map((a) => `${app.esc(a.name)} at ${a.percent.toFixed(0)}%${a.over ? ' (exceeded)' : ''}`)
                     .join(' · ')}</div>
                 </div>
               </div>`
            : ''
        }

        <div class="card">
          <div class="card-head">
            <div>
              <h2>Monthly spending budget</h2>
              <p>Applies to every expense in ${app.monthLabel(month)}</p>
            </div>
            ${
              overall
                ? `<div style="display:flex;gap:6px">
                     <button class="btn ghost small" id="b-edit-overall">Edit</button>
                     <button class="btn ghost small" id="b-delete-overall" style="color:var(--expense)">Remove</button>
                   </div>`
                : ''
            }
          </div>
          <div class="card-body">
            ${
              overall
                ? `<div class="budget-hero">
                     <div class="ring" style="--pct:${Math.min(100, overallPercent)}%;--ring-color:${toneFor(overallPercent)}">
                       <div class="ring-inner">
                         <div>
                           <strong>${overallPercent.toFixed(0)}%</strong>
                           <span>used</span>
                         </div>
                       </div>
                     </div>
                     <div class="budget-meta">
                       <div><div class="k">Budget</div><div class="v">${app.money(overall.amount)}</div></div>
                       <div><div class="k">Spent</div><div class="v">${app.money(overall.spent)}</div></div>
                       <div><div class="k">Remaining</div><div class="v" style="color:${overall.amount - overall.spent < 0 ? 'var(--expense)' : 'var(--income)'}">${app.money(overall.amount - overall.spent)}</div></div>
                       <div><div class="k">Daily allowance</div><div class="v">${app.money(Math.max(0, overall.amount - overall.spent) / daysLeftIn(month))}</div></div>
                     </div>
                   </div>`
                : `<div class="empty" style="padding:30px 20px">
                     <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M12 8v4l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                     <strong>No monthly budget set</strong>
                     <p>Set an overall limit for ${app.esc(app.monthLabel(month))} to track how much you can still spend.</p>
                     <button class="btn primary small" id="b-set-overall" style="margin-top:6px">Set monthly budget</button>
                   </div>`
            }
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <h2>Category budgets</h2>
              <p>${data.items.length} active budget${data.items.length === 1 ? '' : 's'} this month</p>
            </div>
            <button class="btn ghost small" id="b-add-2">Add category budget</button>
          </div>
          <div class="card-body">
            ${
              data.items.length
                ? `<div class="budget-grid">${data.items.map(budgetItem).join('')}</div>`
                : app.emptyState(
                    'No category budgets yet',
                    'Give a category its own limit — food, transport, shopping and more.'
                  )
            }
          </div>
        </div>
      </div>`;

    const openOverall = (value) => {
      const modal = app.modal({
        title: 'Monthly spending budget',
        subtitle: `Set the maximum you want to spend in ${app.monthLabel(month)}.`,
        body: `<form id="budget-form" class="form-grid">
                 <div class="field span-2">
                   <label for="budget-amount">Budget amount</label>
                   <input id="budget-amount" type="number" min="0.01" step="0.01" placeholder="0.00" value="${value ?? ''}" />
                 </div>
                 <div class="span-2" id="budget-error"></div>
               </form>`,
        footer: `<button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save budget</button>`,
      });

      const save = async () => {
        const amount = modal.el.querySelector('#budget-amount').value;
        const errorBox = modal.el.querySelector('#budget-error');
        if (!(Number(amount) > 0)) {
          errorBox.innerHTML = `<div class="form-error">Enter an amount greater than zero.</div>`;
          return;
        }
        try {
          await app.call(window.api.budgets.save({ month, category_id: null, amount }));
          modal.close();
          app.toast('Monthly budget saved.');
          app.render('budgets');
        } catch (error) {
          errorBox.innerHTML = `<div class="form-error">${app.esc(error.message)}</div>`;
        }
      };

      modal.el.querySelector('[data-save]').addEventListener('click', save);
      modal.el.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
      modal.el.querySelector('#budget-form').addEventListener('submit', (event) => {
        event.preventDefault();
        save();
      });
    };

    const openCategory = (existing = null) => {
      const budgetedIds = data.items.map((item) => String(item.category_id));
      const available = app
        .categoriesOf('expense')
        .filter((c) => existing || !budgetedIds.includes(String(c.id)));

      if (!available.length && !existing) {
        app.toast('Every expense category already has a budget this month.', 'warning');
        return;
      }

      const modal = app.modal({
        title: existing ? 'Edit category budget' : 'New category budget',
        subtitle: `Limit spending for a category in ${app.monthLabel(month)}.`,
        body: `<form id="budget-form" class="form-grid">
                 <div class="field span-2">
                   <label for="budget-category">Category</label>
                   <select id="budget-category" ${existing ? 'disabled' : ''}>
                     ${available
                       .map(
                         (c) =>
                           `<option value="${c.id}" ${existing && existing.category_id === c.id ? 'selected' : ''}>${app.esc(c.name)}</option>`
                       )
                       .join('')}
                   </select>
                 </div>
                 <div class="field span-2">
                   <label for="budget-amount">Budget amount</label>
                   <input id="budget-amount" type="number" min="0.01" step="0.01" placeholder="0.00" value="${existing ? existing.amount : ''}" />
                 </div>
                 <div class="span-2" id="budget-error"></div>
               </form>`,
        footer: `<button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save budget</button>`,
      });

      const save = async () => {
        const amount = modal.el.querySelector('#budget-amount').value;
        const categoryId = existing ? existing.category_id : Number(modal.el.querySelector('#budget-category').value);
        const errorBox = modal.el.querySelector('#budget-error');
        if (!(Number(amount) > 0)) {
          errorBox.innerHTML = `<div class="form-error">Enter an amount greater than zero.</div>`;
          return;
        }
        try {
          await app.call(window.api.budgets.save({ month, category_id: categoryId, amount }));
          modal.close();
          app.toast('Category budget saved.');
          app.render('budgets');
        } catch (error) {
          errorBox.innerHTML = `<div class="form-error">${app.esc(error.message)}</div>`;
        }
      };

      modal.el.querySelector('[data-save]').addEventListener('click', save);
      modal.el.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
      modal.el.querySelector('#budget-form').addEventListener('submit', (event) => {
        event.preventDefault();
        save();
      });
    };

    root.querySelector('#b-month').addEventListener('change', (event) => {
      app.state.budgetMonth = event.target.value || app.currentMonth();
      app.render('budgets');
    });

    root.querySelector('#b-add')?.addEventListener('click', () => openCategory());
    root.querySelector('#b-add-2')?.addEventListener('click', () => openCategory());
    root.querySelector('#b-set-overall')?.addEventListener('click', () => openOverall(null));
    root.querySelector('#b-edit-overall')?.addEventListener('click', () => openOverall(overall ? overall.amount : null));
    root.querySelector('#b-delete-overall')?.addEventListener('click', async () => {
      const confirmed = await app.confirm({
        title: 'Remove monthly budget',
        message: `The overall budget for ${app.monthLabel(month)} will be deleted. Transactions are not affected.`,
        confirmText: 'Remove budget',
      });
      if (!confirmed) return;
      try {
        await app.call(window.api.budgets.remove(overall.id));
        app.toast('Budget removed.');
        app.render('budgets');
      } catch (error) {
        app.toast(error.message, 'error');
      }
    });

    root.addEventListener('click', async (event) => {
      const editId = event.target.closest('[data-edit]')?.dataset.edit;
      const deleteId = event.target.closest('[data-delete]')?.dataset.delete;

      if (editId) {
        const item = data.items.find((row) => String(row.id) === String(editId));
        if (item) openCategory(item);
      }

      if (deleteId) {
        const item = data.items.find((row) => String(row.id) === String(deleteId));
        if (!item) return;
        const confirmed = await app.confirm({
          title: 'Delete category budget',
          message: `Remove the ${app.money(item.amount)} limit for ${item.category} in ${app.monthLabel(month)}?`,
          confirmText: 'Delete budget',
        });
        if (!confirmed) return;
        try {
          await app.call(window.api.budgets.remove(item.id));
          app.toast('Budget deleted.');
          app.render('budgets');
        } catch (error) {
          app.toast(error.message, 'error');
        }
      }
    });
  };

  function daysLeftIn(month) {
    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (month !== current) return 30;
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.max(1, last - now.getDate() + 1);
  }

  app.checkBudgetAlerts = async (month) => {
    try {
      const data = await app.call(window.api.budgets.list(month));
      for (const item of data.items) {
        const percent = item.amount > 0 ? (item.spent / item.amount) * 100 : 0;
        if (percent >= 100) {
          app.toast(`${item.category} budget exceeded — ${app.money(item.spent)} of ${app.money(item.amount)}.`, 'error');
        } else if (percent >= 80) {
          app.toast(`${item.category} budget is ${percent.toFixed(0)}% used.`, 'warning');
        }
      }
      if (data.overall) {
        const percent = data.overall.amount > 0 ? (data.overall.spent / data.overall.amount) * 100 : 0;
        if (percent >= 100) {
          app.toast(`Monthly budget exceeded by ${app.money(data.overall.spent - data.overall.amount)}.`, 'error');
        } else if (percent >= 80) {
          app.toast(`Monthly budget is ${percent.toFixed(0)}% used.`, 'warning');
        }
      }
    } catch {
      /* alerts are best effort */
    }
  };
})();
