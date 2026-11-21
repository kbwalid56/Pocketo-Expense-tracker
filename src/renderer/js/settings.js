/* global App */
'use strict';

(function () {
  const app = window.App;

  app.views.settings = async (root) => {
    const settings = app.state.settings;
    const info = await app.call(window.api.info());

    root.innerHTML = `
      <div class="view-inner">
        <div class="settings-grid">
          <div class="card">
            <div class="card-head"><div><h2>Appearance</h2><p>How Pocketo looks on this computer</p></div></div>
            <div class="card-body">
              <div class="setting-row">
                <div>
                  <div class="title">Theme</div>
                  <div class="desc">Dark is the default. Light is easier to read in bright rooms.</div>
                </div>
                <div class="theme-options">
                  <button class="theme-option ${settings.theme === 'dark' ? 'active' : ''}" data-theme="dark">
                    <span class="theme-swatch" style="background:#101825"></span>Dark
                  </button>
                  <button class="theme-option ${settings.theme === 'light' ? 'active' : ''}" data-theme="light">
                    <span class="theme-swatch" style="background:#ffffff"></span>Light
                  </button>
                </div>
              </div>
              <div class="setting-row">
                <div>
                  <div class="title">Currency</div>
                  <div class="desc">Used for every amount, budget and report in the app.</div>
                </div>
                <select id="s-currency">
                  ${settings.currencies
                    .map(
                      (code) =>
                        `<option value="${code}" ${settings.currency === code ? 'selected' : ''}>${app.symbol(code)} ${code}</option>`
                    )
                    .join('')}
                </select>
              </div>
              <div class="setting-row">
                <div>
                  <div class="title">Categories</div>
                  <div class="desc">Add, rename or recolour the categories you track.</div>
                </div>
                <button class="btn" id="s-categories">Manage categories</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div><h2>Your data</h2><p>Everything is stored locally — no account, no internet</p></div></div>
            <div class="card-body">
              <div class="setting-row">
                <div>
                  <div class="title">Export financial data</div>
                  <div class="desc">Save every transaction as a CSV file you can open in Excel.</div>
                </div>
                <button class="btn" id="s-export">Export CSV</button>
              </div>
              <div class="setting-row">
                <div>
                  <div class="title">Back up database</div>
                  <div class="desc">Write a copy of the SQLite database to a folder you choose.</div>
                </div>
                <button class="btn" id="s-backup">Back up</button>
              </div>
              <div class="setting-row">
                <div>
                  <div class="title">Restore backup</div>
                  <div class="desc">Replace all current data with a Pocketo backup file.</div>
                </div>
                <button class="btn" id="s-restore">Restore</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div><h2>About Pocketo</h2><p>Version ${app.esc(info.version)}</p></div></div>
            <div class="card-body">
              <div class="info-list">
                <div><span class="k">Application</span><span class="v">Pocketo — personal expense tracker</span></div>
                <div><span class="k">Version</span><span class="v">${app.esc(info.version)}</span></div>
                <div><span class="k">Electron</span><span class="v">${app.esc(info.electron)}</span></div>
                <div><span class="k">Chromium</span><span class="v">${app.esc(info.chrome)}</span></div>
                <div><span class="k">Node.js</span><span class="v">${app.esc(info.node)}</span></div>
                <div><span class="k">Platform</span><span class="v">${app.esc(info.platform)}</span></div>
                <div><span class="k">Database</span><span class="v code-path">${app.esc(info.database)}</span></div>
              </div>
              <p class="muted" style="margin-top:14px;font-size:12.5px;line-height:1.6">
                Pocketo works completely offline. All amounts, categories and budgets live in a single SQLite
                file on this machine. Back it up regularly if the data matters to you.
              </p>
            </div>
          </div>
        </div>
      </div>`;

    const updateSettings = async (patch) => {
      try {
        const updated = await app.call(window.api.settings.update(patch));
        app.state.settings = updated;
        app.applyTheme(updated.theme);
        app.render('settings');
      } catch (error) {
        app.toast(error.message, 'error');
      }
    };

    for (const button of root.querySelectorAll('[data-theme]')) {
      button.addEventListener('click', () => {
        if (button.dataset.theme !== app.state.settings.theme) updateSettings({ theme: button.dataset.theme });
      });
    }

    root.querySelector('#s-currency').addEventListener('change', (event) => {
      updateSettings({ currency: event.target.value });
    });

    root.querySelector('#s-categories').addEventListener('click', () => app.navigate('categories'));

    root.querySelector('#s-export').addEventListener('click', async () => {
      try {
        const result = await app.call(
          window.api.data.exportCsv({ from: '1970-01-01', to: app.todayKey(), label: 'all' })
        );
        if (result.canceled) return;
        app.toast(`Exported ${result.count} transaction${result.count === 1 ? '' : 's'} to CSV.`);
      } catch (error) {
        app.toast(error.message, 'error');
      }
    });

    root.querySelector('#s-backup').addEventListener('click', async () => {
      try {
        const result = await app.call(window.api.data.backup());
        if (result.canceled) return;
        app.toast('Backup saved.');
      } catch (error) {
        app.toast(error.message, 'error');
      }
    });

    root.querySelector('#s-restore').addEventListener('click', async () => {
      const confirmed = await app.confirm({
        title: 'Restore a backup',
        message: 'Your current transactions, budgets and categories will be replaced by the backup file.',
        confirmText: 'Choose backup file',
        danger: false,
      });
      if (!confirmed) return;
      try {
        const result = await app.call(window.api.data.restore());
        if (result.canceled) return;
        app.state.settings = result.settings;
        app.applyTheme(result.settings.theme);
        app.toast('Backup restored.');
        await app.afterChange();
        app.render('settings');
      } catch (error) {
        app.toast(error.message, 'error');
      }
    });
  };
})();
