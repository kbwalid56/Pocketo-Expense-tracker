# Pocketo

**Track your money. Understand your habits. Control your spending.**

Pocketo is an offline desktop expense tracker for Windows, built with Electron and Node.js and backed by a
local SQLite database. No account, no internet connection, no cloud — your financial data never leaves your
computer.

## Features

- **Dashboard** — available balance, total income, total expenses and savings, six-month income vs expense
  chart, category distribution, budget utilization and recent transactions.
- **Transactions** — add, edit, view and delete income/expense records with title, amount, category, date,
  payment method and notes. Search by title, filter by type/category/date and sort by date or amount.
- **Categories** — the default income and expense categories plus custom ones, each with its own colour.
  Categories in use cannot be deleted.
- **Budgets** — an overall monthly spending limit and per-category limits, with progress rings/bars,
  remaining amounts and alerts at 80% and 100% utilization.
- **Reports** — monthly income/expense comparison, category breakdown, savings and savings rate, payment
  method summary, custom date ranges and CSV export.
- **Settings** — dark/light theme, currency selection (BDT by default), data export, database backup and
  restore, and application information.

## Requirements

- Node.js 20 or newer (for building/running from source)
- Windows 10/11 for the packaged installer

## Run from source

```bash
npm install
npm start
```

## Build the Windows installer

```bash
npm run dist
```

The NSIS installer is written to `dist/`. `electron-builder` downloads its Windows toolchain on first run,
so this step needs an internet connection.

## Project structure

```
src/
  main/
    main.js      Electron main process: window, menu, IPC handlers, file dialogs
    db.js        SQLite schema, queries, validation, business rules
  preload/
    preload.js   contextBridge API exposed to the renderer (no Node in the UI)
  renderer/
    index.html   Application shell (sidebar + view container)
    styles.css   Dark/light design system
    js/
      util.js         Formatting, modals, toasts, chart helpers
      app.js          Router, navigation, theme, sidebar
      dashboard.js    Dashboard view
      transactions.js Transaction list, filters and add/edit form
      budgets.js      Monthly and category budgets
      reports.js      Analytics, date ranges and CSV export
      categories.js   Category management
      settings.js     Preferences, backup and restore
```

## Data and storage

The database is a single SQLite file named `pocketo.sqlite` inside Electron's per-user data folder
(typically `%APPDATA%\Pocketo\pocketo.sqlite`). Its exact path is shown in **Settings → About Pocketo**.

SQLite itself is provided by `sql.js` (SQLite compiled to WebAssembly), so the app has no native modules and
needs no per-Electron-version rebuild. The database file is written atomically after every change.

Backups copy that file; restores validate that the chosen file is a real Pocketo database before replacing
anything.

## Business rules

- Balance and savings = total income − total expenses.
- Income uses income categories only; expenses use expense categories only.
- Transaction amounts must be greater than zero.
- Budgets are scoped to a month (`YYYY-MM`), and budget progress only counts that month's expenses.
- Editing or deleting a transaction immediately updates dashboard totals, budgets and reports.

## 📥 Download
[Download Latest Version]([https://github.com/kbwalid56/Pocketo-Expense-tracker//releases/latest)
