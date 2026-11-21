'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');

const store = require('./db');

let mainWindow = null;

/* --------------------------------------------------------------- helpers */

const handle = (fn) => async (_event, ...args) => {
  try {
    return { ok: true, data: await fn(...args) };
  } catch (error) {
    return { ok: false, error: error?.message || 'Something went wrong.' };
  }
};

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(rows) {
  const header = ['Date', 'Title', 'Type', 'Category', 'Amount', 'Payment method', 'Notes'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [row.date, row.title, row.type, row.category, row.amount, row.payment_method, row.notes ?? '']
        .map(csvCell)
        .join(',')
    );
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/* ----------------------------------------------------------------- window */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#0a0e14',
    title: 'Pocketo',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------- ipc */

function registerIpc() {
  ipcMain.handle('settings:get', handle(() => store.getSettings()));
  ipcMain.handle('settings:update', handle((patch) => store.updateSettings(patch)));

  ipcMain.handle('categories:list', handle(() => store.listCategories()));
  ipcMain.handle('categories:create', handle((payload) => store.createCategory(payload)));
  ipcMain.handle('categories:update', handle((id, payload) => store.updateCategory(id, payload)));
  ipcMain.handle('categories:delete', handle((id) => store.deleteCategory(id)));

  ipcMain.handle('transactions:list', handle((filters) => store.listTransactions(filters)));
  ipcMain.handle('transactions:get', handle((id) => store.getTransaction(id)));
  ipcMain.handle('transactions:create', handle((payload) => store.createTransaction(payload)));
  ipcMain.handle('transactions:update', handle((id, payload) => store.updateTransaction(id, payload)));
  ipcMain.handle('transactions:delete', handle((id) => store.deleteTransaction(id)));
  ipcMain.handle('transactions:clear', handle(() => store.deleteAllTransactions()));

  ipcMain.handle('budgets:list', handle((month) => store.listBudgets(month)));
  ipcMain.handle('budgets:save', handle((payload) => store.saveBudget(payload)));
  ipcMain.handle('budgets:delete', handle((id) => store.deleteBudget(id)));

  ipcMain.handle('dashboard:get', handle(() => store.dashboard()));
  ipcMain.handle('reports:get', handle((range) => store.report(range)));

  ipcMain.handle(
    'data:exportCsv',
    handle(async (range) => {
      const rows = store.transactionsForExport(range);
      const suffix = range.label === 'all' ? 'all' : `${range.from}_to_${range.to}`;
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export transactions',
        defaultPath: path.join(app.getPath('documents'), `pocketo-transactions-${suffix}.csv`),
        filters: [{ name: 'CSV file', extensions: ['csv'] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true };

      fs.writeFileSync(result.filePath, buildCsv(rows), 'utf8');
      return { canceled: false, path: result.filePath, count: rows.length };
    })
  );

  ipcMain.handle(
    'data:backup',
    handle(async () => {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Back up Pocketo database',
        defaultPath: path.join(app.getPath('documents'), `pocketo-backup-${stamp()}.sqlite`),
        filters: [{ name: 'Pocketo database', extensions: ['sqlite', 'db'] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true };

      store.backupTo(result.filePath);
      return { canceled: false, path: result.filePath };
    })
  );

  ipcMain.handle(
    'data:restore',
    handle(async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Restore Pocketo database',
        properties: ['openFile'],
        filters: [{ name: 'Pocketo database', extensions: ['sqlite', 'db'] }],
      });
      if (result.canceled || !result.filePaths.length) return { canceled: true };

      const restored = store.restoreFrom(result.filePaths[0]);
      return { canceled: false, path: result.filePaths[0], ...restored };
    })
  );

  ipcMain.handle(
    'app:info',
    handle(() => ({
      name: 'Pocketo',
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      database: store.getDbPath(),
      platform: `${process.platform} ${process.arch}`,
    }))
  );
}

/* --------------------------------------------------------------- startup */

app.whenReady().then(async () => {
  await store.init(app.getPath('userData'));
  registerIpc();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
