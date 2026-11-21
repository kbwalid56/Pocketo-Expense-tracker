/* global App */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  window.App.init().catch((error) => {
    document.getElementById('view').innerHTML = `<div class="view-inner"><div class="card">${window.App.emptyState(
      'Spendly could not start',
      error.message || String(error)
    )}</div></div>`;
  });
});
