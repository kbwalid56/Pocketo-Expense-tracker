/* global App */
'use strict';

(function () {
  const app = window.App;

  const PALETTE = [
    '#f97316', '#38bdf8', '#a855f7', '#22d3ee', '#f43f5e', '#34d399',
    '#fbbf24', '#94a3b8', '#10b981', '#2dd4bf', '#818cf8', '#60a5fa',
    '#e879f9', '#facc15', '#fb7185', '#4ade80',
  ];

  const catCard = (category) => `
    <div class="cat-card">
      <div class="cat-swatch" style="background:${app.esc(category.color)}">${app.esc(app.initials(category.name))}</div>
      <div class="cat-info">
        <div class="n">${app.esc(category.name)}</div>
        <div class="u">${category.usage} transaction${category.usage === 1 ? '' : 's'}</div>
      </div>
      <div class="row-actions">
        <button class="icon-btn" data-edit="${category.id}" title="Rename category">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn danger" data-delete="${category.id}" title="Delete category">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>`;

  const section = (type, categories) => `
    <div class="card">
      <div class="card-head">
        <div>
          <h2>${type === 'income' ? 'Income' : 'Expense'} categories</h2>
          <p>${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} available</p>
        </div>
        <button class="btn ghost small" data-add="${type}">Add category</button>
      </div>
      <div class="card-body">
        <div class="cat-grid">${categories.map(catCard).join('')}</div>
      </div>
    </div>`;

  app.views.categories = async (root) => {
    await app.refreshCategories();
    const expense = app.categoriesOf('expense');
    const income = app.categoriesOf('income');

    root.innerHTML = `
      <div class="view-inner">
        <div class="muted" style="font-size:12.5px">
          Categories keep your records organised. A category can be renamed or recoloured at any time;
          it can only be deleted when no transaction uses it.
        </div>
        ${section('expense', expense)}
        ${section('income', income)}
      </div>`;

    root.addEventListener('click', async (event) => {
      const addType = event.target.closest('[data-add]')?.dataset.add;
      const editId = event.target.closest('[data-edit]')?.dataset.edit;
      const deleteId = event.target.closest('[data-delete]')?.dataset.delete;

      if (addType) {
        app.openCategoryForm({ type: addType });
      }

      if (editId) {
        const category = app.state.categories.find((c) => String(c.id) === String(editId));
        if (category) app.openCategoryForm({ category });
      }

      if (deleteId) {
        const category = app.state.categories.find((c) => String(c.id) === String(deleteId));
        if (!category) return;
        const confirmed = await app.confirm({
          title: 'Delete category',
          message: `"${category.name}" will be removed. Categories that are still used by transactions cannot be deleted.`,
          confirmText: 'Delete category',
        });
        if (!confirmed) return;
        try {
          await app.call(window.api.categories.remove(category.id));
          app.toast('Category deleted.');
          await app.afterChange();
        } catch (error) {
          app.toast(error.message, 'error');
        }
      }
    });
  };

  app.openCategoryForm = ({ category = null, type = 'expense' } = {}) => {
    let currentType = category?.type || type;
    let color = category?.color || PALETTE[Math.floor(Math.random() * PALETTE.length)];

    const body = `
      <form id="cat-form" class="form-grid">
        <div class="span-2">
          ${
            category
              ? `<div class="chip ${category.type}" style="margin-bottom:2px">${category.type === 'income' ? 'Income' : 'Expense'} category</div>`
              : `<div class="segmented" id="cat-type">
                   <button type="button" data-type="expense" class="${currentType === 'expense' ? 'active' : ''}">Expense</button>
                   <button type="button" data-type="income" class="${currentType === 'income' ? 'active' : ''}">Income</button>
                 </div>`
          }
        </div>
        <div class="field span-2">
          <label for="cat-name">Name</label>
          <input id="cat-name" type="text" maxlength="40" placeholder="e.g. Subscriptions" value="${app.esc(category?.name || '')}" />
        </div>
        <div class="field span-2">
          <label>Colour</label>
          <div class="color-options" id="cat-colors">
            ${PALETTE.map(
              (hex) =>
                `<button type="button" class="color-option ${hex === color ? 'active' : ''}" data-color="${hex}" style="background:${hex}" aria-label="${hex}"></button>`
            ).join('')}
          </div>
        </div>
        <div class="span-2" id="cat-error"></div>
      </form>`;

    const modal = app.modal({
      title: category ? 'Edit category' : 'New category',
      subtitle: category ? 'Rename or recolour this category.' : 'Create a category for your transactions.',
      body,
      footer: `<button class="btn" data-cancel>Cancel</button>
               <button class="btn primary" data-save>${category ? 'Save changes' : 'Add category'}</button>`,
    });

    if (!category) {
      modal.el.querySelector('#cat-type').addEventListener('click', (event) => {
        const button = event.target.closest('[data-type]');
        if (!button) return;
        currentType = button.dataset.type;
        modal.el.querySelectorAll('#cat-type button').forEach((b) => b.classList.toggle('active', b.dataset.type === currentType));
      });
    }

    modal.el.querySelector('#cat-colors').addEventListener('click', (event) => {
      const swatch = event.target.closest('[data-color]');
      if (!swatch) return;
      color = swatch.dataset.color;
      modal.el.querySelectorAll('.color-option').forEach((b) => b.classList.toggle('active', b.dataset.color === color));
    });

    const save = async () => {
      const name = modal.el.querySelector('#cat-name').value.trim();
      const errorBox = modal.el.querySelector('#cat-error');
      if (!name) {
        errorBox.innerHTML = `<div class="form-error">Please enter a category name.</div>`;
        return;
      }
      try {
        if (category) {
          await app.call(window.api.categories.update(category.id, { name, color }));
        } else {
          await app.call(window.api.categories.create({ name, color, type: currentType }));
        }
        modal.close();
        app.toast(category ? 'Category updated.' : 'Category added.');
        await app.afterChange();
      } catch (error) {
        errorBox.innerHTML = `<div class="form-error">${app.esc(error.message)}</div>`;
      }
    };

    modal.el.querySelector('[data-save]').addEventListener('click', save);
    modal.el.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
    modal.el.querySelector('#cat-form').addEventListener('submit', (event) => {
      event.preventDefault();
      save();
    });
  };
})();
