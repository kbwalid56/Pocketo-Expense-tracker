'use strict';

/**
 * Spendly data layer.
 *
 * SQLite is provided by sql.js (SQLite compiled to WebAssembly) so the app
 * ships without native modules that would need rebuilding per Electron ABI.
 * The whole database is kept in memory and persisted to a single .sqlite file
 * inside the app's userData folder after every write.
 */

const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL,
  type  TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  color TEXT NOT NULL DEFAULT '#94a3b8',
  UNIQUE (name, type)
);

CREATE TABLE IF NOT EXISTS transactions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  amount         REAL NOT NULL CHECK (amount > 0),
  type           TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id    INTEGER NOT NULL REFERENCES categories (id),
  date           TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories (id),
  amount      REAL NOT NULL CHECK (amount > 0),
  month       TEXT NOT NULL,
  UNIQUE (category_id, month)
);

CREATE TABLE IF NOT EXISTS settings (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  currency TEXT NOT NULL DEFAULT 'BDT',
  theme    TEXT NOT NULL DEFAULT 'dark'
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_overall ON budgets (month) WHERE category_id IS NULL;
`;

const DEFAULT_CATEGORIES = [
  { name: 'Food', type: 'expense', color: '#f97316' },
  { name: 'Transportation', type: 'expense', color: '#38bdf8' },
  { name: 'Shopping', type: 'expense', color: '#a855f7' },
  { name: 'Education', type: 'expense', color: '#22d3ee' },
  { name: 'Entertainment', type: 'expense', color: '#f43f5e' },
  { name: 'Healthcare', type: 'expense', color: '#34d399' },
  { name: 'Bills', type: 'expense', color: '#fbbf24' },
  { name: 'Other', type: 'expense', color: '#94a3b8' },
  { name: 'Salary', type: 'income', color: '#10b981' },
  { name: 'Freelancing', type: 'income', color: '#2dd4bf' },
  { name: 'Business', type: 'income', color: '#818cf8' },
  { name: 'Allowance', type: 'income', color: '#60a5fa' },
  { name: 'Gifts', type: 'income', color: '#e879f9' },
  { name: 'Other', type: 'income', color: '#94a3b8' },
];

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Debit Card', 'Credit Card', 'Mobile Banking', 'Other'];
const CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'CNY', 'PKR', 'MYR', 'SGD'];
const THEMES = ['dark', 'light'];

let SQL = null;
let db = null;
let dbPath = null;
let txDepth = 0;

/* ------------------------------------------------------------------ utils */

function fail(message) {
  throw new Error(message);
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || year < 1900) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function isValidMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function assertType(type) {
  if (type !== 'income' && type !== 'expense') fail('Transaction type must be income or expense.');
}

function assertAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) fail('Amount must be a number greater than zero.');
  return Math.round(value * 100) / 100;
}

function assertText(value, label, maxLength = 120) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  if (text.length > maxLength) fail(`${label} must be ${maxLength} characters or fewer.`);
  return text;
}

/* ------------------------------------------------------------- sql helpers */

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length ? rows[0] : null;
}

function run(sql, params = []) {
  db.run(sql, params);
  const res = db.exec('SELECT last_insert_rowid() AS id');
  const id = res.length ? res[0].values[0][0] : 0;
  if (txDepth === 0) persist();
  return id;
}

function persist() {
  if (!db || !dbPath) return;
  const data = Buffer.from(db.export());
  const tmp = dbPath + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, dbPath);
}

function transaction(fn) {
  txDepth += 1;
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    txDepth -= 1;
    persist();
    return result;
  } catch (error) {
    try {
      db.run('ROLLBACK');
    } catch {
      /* ignore rollback errors */
    }
    txDepth = Math.max(0, txDepth - 1);
    throw error;
  }
}

/* ------------------------------------------------------------------- init */

async function init(userDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true });
  dbPath = path.join(userDataDir, 'spendly.sqlite');

  const wasmDir = path.dirname(require.resolve('sql.js'));
  SQL = await initSqlJs({
    locateFile: (file) => path.join(wasmDir, file),
  });

  const fresh = !fs.existsSync(dbPath);
  db = fresh ? new SQL.Database() : new SQL.Database(fs.readFileSync(dbPath));
  db.run('PRAGMA foreign_keys = ON;');
  db.run(SCHEMA);

  db.run("INSERT OR IGNORE INTO settings (id, currency, theme) VALUES (1, 'BDT', 'dark')");

  if (fresh || get('SELECT COUNT(*) AS n FROM categories').n === 0) {
    transaction(() => {
      for (const category of DEFAULT_CATEGORIES) {
        db.run('INSERT OR IGNORE INTO categories (name, type, color) VALUES (?, ?, ?)', [
          category.name,
          category.type,
          category.color,
        ]);
      }
    });
  }

  persist();
  return dbPath;
}

function getDbPath() {
  return dbPath;
}

/* --------------------------------------------------------------- settings */

function getSettings() {
  const row = get('SELECT currency, theme FROM settings WHERE id = 1');
  return {
    currency: row?.currency || 'BDT',
    theme: row?.theme || 'dark',
    paymentMethods: PAYMENT_METHODS,
    currencies: CURRENCIES,
  };
}

function updateSettings(patch = {}) {
  const current = getSettings();
  const currency = patch.currency ?? current.currency;
  const theme = patch.theme ?? current.theme;

  if (!CURRENCIES.includes(currency)) fail('Unsupported currency.');
  if (!THEMES.includes(theme)) fail('Unsupported theme.');

  run('UPDATE settings SET currency = ?, theme = ? WHERE id = 1', [currency, theme]);
  return getSettings();
}

/* ------------------------------------------------------------- categories */

function listCategories() {
  return all(`
    SELECT c.id,
           c.name,
           c.type,
           c.color,
           (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) AS usage
    FROM categories c
    ORDER BY c.type ASC, c.name COLLATE NOCASE ASC
  `);
}

function createCategory(payload = {}) {
  const name = assertText(payload.name, 'Category name', 40);
  assertType(payload.type);
  const color = /^#[0-9a-fA-F]{6}$/.test(String(payload.color || '')) ? String(payload.color) : '#94a3b8';

  const existing = get('SELECT id FROM categories WHERE lower(name) = lower(?) AND type = ?', [name, payload.type]);
  if (existing) fail(`A ${payload.type} category named "${name}" already exists.`);

  const id = run('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)', [name, payload.type, color]);
  return get('SELECT * FROM categories WHERE id = ?', [id]);
}

function updateCategory(id, payload = {}) {
  const current = get('SELECT * FROM categories WHERE id = ?', [Number(id)]);
  if (!current) fail('Category not found.');

  const name = assertText(payload.name, 'Category name', 40);
  const color = /^#[0-9a-fA-F]{6}$/.test(String(payload.color || '')) ? String(payload.color) : current.color;

  const duplicate = get(
    'SELECT id FROM categories WHERE lower(name) = lower(?) AND type = ? AND id <> ?',
    [name, current.type, current.id]
  );
  if (duplicate) fail(`A ${current.type} category named "${name}" already exists.`);

  run('UPDATE categories SET name = ?, color = ? WHERE id = ?', [name, color, current.id]);
  return get('SELECT * FROM categories WHERE id = ?', [current.id]);
}

function deleteCategory(id) {
  const category = get('SELECT * FROM categories WHERE id = ?', [Number(id)]);
  if (!category) fail('Category not found.');

  const usage = get('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?', [category.id]).n;
  if (usage > 0) fail(`"${category.name}" is used by ${usage} transaction(s). Reassign them before deleting.`);

  transaction(() => {
    db.run('DELETE FROM budgets WHERE category_id = ?', [category.id]);
    db.run('DELETE FROM categories WHERE id = ?', [category.id]);
  });
  return true;
}

/* ----------------------------------------------------------- transactions */

const SORT_MAP = {
  date_desc: 't.date DESC, t.id DESC',
  date_asc: 't.date ASC, t.id ASC',
  amount_desc: 't.amount DESC, t.date DESC',
  amount_asc: 't.amount ASC, t.date DESC',
};

function normalizeNotes(notes) {
  const text = String(notes ?? '').trim();
  if (!text) return null;
  if (text.length > 500) fail('Notes must be 500 characters or fewer.');
  return text;
}

function validateTransactionPayload(payload = {}) {
  const title = assertText(payload.title, 'Title', 100);
  const amount = assertAmount(payload.amount);
  assertType(payload.type);

  const categoryId = Number(payload.category_id);
  const category = get('SELECT * FROM categories WHERE id = ?', [Number.isFinite(categoryId) ? categoryId : -1]);
  if (!category) fail('Please choose a category.');
  if (category.type !== payload.type) {
    fail(`${payload.type === 'income' ? 'Income' : 'Expense'} transactions must use a ${payload.type} category.`);
  }

  if (!isValidDate(payload.date)) fail('Please enter a valid date.');

  const paymentMethod = PAYMENT_METHODS.includes(payload.payment_method) ? payload.payment_method : 'Other';
  const notes = normalizeNotes(payload.notes);

  return { title, amount, type: payload.type, category_id: category.id, date: payload.date, payment_method: paymentMethod, notes };
}

function listTransactions(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.search) {
    conditions.push('t.title LIKE ?');
    params.push(`%${String(filters.search).replace(/[%_]/g, (m) => '\\' + m)}%`);
  }
  if (filters.type === 'income' || filters.type === 'expense') {
    conditions.push('t.type = ?');
    params.push(filters.type);
  }
  if (filters.category_id) {
    conditions.push('t.category_id = ?');
    params.push(Number(filters.category_id));
  }
  if (isValidDate(filters.from)) {
    conditions.push('t.date >= ?');
    params.push(filters.from);
  }
  if (isValidDate(filters.to)) {
    conditions.push('t.date <= ?');
    params.push(filters.to);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const order = SORT_MAP[filters.sort] || SORT_MAP.date_desc;

  const rows = all(
    `SELECT t.id, t.title, t.amount, t.type, t.category_id, t.date, t.payment_method, t.notes,
            c.name AS category, c.color AS category_color
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     ${where}
     ORDER BY ${order}`,
    params
  );

  const income = rows.filter((r) => r.type === 'income').reduce((sum, r) => sum + r.amount, 0);
  const expense = rows.filter((r) => r.type === 'expense').reduce((sum, r) => sum + r.amount, 0);

  return { rows, total: rows.length, income, expense };
}

function getTransaction(id) {
  const row = get(
    `SELECT t.*, c.name AS category, c.color AS category_color
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.id = ?`,
    [Number(id)]
  );
  if (!row) fail('Transaction not found.');
  return row;
}

function createTransaction(payload) {
  const data = validateTransactionPayload(payload);
  const id = run(
    `INSERT INTO transactions (title, amount, type, category_id, date, payment_method, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.title, data.amount, data.type, data.category_id, data.date, data.payment_method, data.notes]
  );
  return getTransaction(id);
}

function updateTransaction(id, payload) {
  const existing = getTransaction(id);
  const data = validateTransactionPayload(payload);
  run(
    `UPDATE transactions
     SET title = ?, amount = ?, type = ?, category_id = ?, date = ?, payment_method = ?, notes = ?
     WHERE id = ?`,
    [data.title, data.amount, data.type, data.category_id, data.date, data.payment_method, data.notes, existing.id]
  );
  return getTransaction(existing.id);
}

function deleteTransaction(id) {
  const existing = getTransaction(id);
  run('DELETE FROM transactions WHERE id = ?', [existing.id]);
  return true;
}

function deleteAllTransactions() {
  run('DELETE FROM transactions');
  run("DELETE FROM sqlite_sequence WHERE name = 'transactions'");
  return true;
}

/* ---------------------------------------------------------------- budgets */

function monthSpend(month) {
  const rows = all(
    `SELECT category_id, SUM(amount) AS total
     FROM transactions
     WHERE type = 'expense' AND substr(date, 1, 7) = ?
     GROUP BY category_id`,
    [month]
  );
  const map = new Map();
  let total = 0;
  for (const row of rows) {
    map.set(row.category_id, row.total || 0);
    total += row.total || 0;
  }
  return { map, total };
}

function listBudgets(month) {
  if (!isValidMonth(month)) fail('Please choose a valid month.');

  const rows = all(
    `SELECT b.id, b.category_id, b.amount, b.month, c.name AS category, c.color
     FROM budgets b
     LEFT JOIN categories c ON c.id = b.category_id
     WHERE b.month = ?
     ORDER BY b.category_id IS NOT NULL, c.name COLLATE NOCASE`,
    [month]
  );

  const spend = monthSpend(month);
  const overallRow = rows.find((r) => r.category_id === null) || null;
  const items = rows
    .filter((r) => r.category_id !== null)
    .map((r) => ({
      id: r.id,
      category_id: r.category_id,
      category: r.category,
      color: r.color,
      amount: r.amount,
      spent: spend.map.get(r.category_id) || 0,
    }));

  const overall = overallRow
    ? { id: overallRow.id, amount: overallRow.amount, spent: spend.total }
    : null;

  const unbudgeted = all(
    `SELECT c.id, c.name, c.color, SUM(t.amount) AS spent
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.type = 'expense' AND substr(t.date, 1, 7) = ?
       AND c.id NOT IN (SELECT category_id FROM budgets WHERE month = ? AND category_id IS NOT NULL)
     GROUP BY c.id
     ORDER BY spent DESC`,
    [month, month]
  );

  return { month, overall, items, unbudgeted, totalSpent: spend.total };
}

function saveBudget(payload = {}) {
  const month = payload.month;
  if (!isValidMonth(month)) fail('Please choose a valid month.');

  const amount = assertAmount(payload.amount);
  const categoryId = payload.category_id === null || payload.category_id === undefined || payload.category_id === ''
    ? null
    : Number(payload.category_id);

  if (categoryId !== null) {
    const category = get('SELECT * FROM categories WHERE id = ?', [categoryId]);
    if (!category) fail('Category not found.');
    if (category.type !== 'expense') fail('Budgets can only be set for expense categories.');
  }

  const existing = categoryId === null
    ? get('SELECT id FROM budgets WHERE month = ? AND category_id IS NULL', [month])
    : get('SELECT id FROM budgets WHERE month = ? AND category_id = ?', [month, categoryId]);

  if (existing) {
    run('UPDATE budgets SET amount = ? WHERE id = ?', [amount, existing.id]);
  } else if (categoryId === null) {
    run('INSERT INTO budgets (category_id, amount, month) VALUES (NULL, ?, ?)', [amount, month]);
  } else {
    run('INSERT INTO budgets (category_id, amount, month) VALUES (?, ?, ?)', [categoryId, amount, month]);
  }

  return listBudgets(month);
}

function deleteBudget(id) {
  const row = get('SELECT * FROM budgets WHERE id = ?', [Number(id)]);
  if (!row) fail('Budget not found.');
  run('DELETE FROM budgets WHERE id = ?', [row.id]);
  return true;
}

/* -------------------------------------------------------------- dashboard */

function buildSeries(months) {
  return months.map(({ month, income, expense }) => ({
    month,
    income,
    expense,
    savings: income - expense,
  }));
}

function lastMonths(count, anchor = new Date()) {
  const keys = [];
  const cursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function seriesBetween(from, to) {
  const rows = all(
    `SELECT substr(date, 1, 7) AS month,
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense
     FROM transactions
     WHERE date >= ? AND date <= ?
     GROUP BY month
     ORDER BY month`,
    [from, to]
  );
  return rows;
}

function dashboard() {
  const month = todayKey().slice(0, 7);
  const totals = get(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
    FROM transactions
  `);

  const monthTotals = get(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM transactions WHERE substr(date, 1, 7) = ?`,
    [month]
  );

  const months = lastMonths(6);
  const seriesRows = all(
    `SELECT substr(date, 1, 7) AS month,
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense
     FROM transactions
     WHERE substr(date, 1, 7) >= ?
     GROUP BY month`,
    [months[0]]
  );
  const byMonth = new Map(seriesRows.map((r) => [r.month, r]));
  const series = buildSeries(
    months.map((m) => ({
      month: m,
      income: byMonth.get(m)?.income || 0,
      expense: byMonth.get(m)?.expense || 0,
    }))
  );

  const categories = all(
    `SELECT c.id, c.name, c.color, SUM(t.amount) AS total
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.type = 'expense' AND substr(t.date, 1, 7) = ?
     GROUP BY c.id
     ORDER BY total DESC`,
    [month]
  );

  const recent = all(
    `SELECT t.id, t.title, t.amount, t.type, t.date, t.payment_method,
            c.name AS category, c.color AS category_color
     FROM transactions t JOIN categories c ON c.id = t.category_id
     ORDER BY t.date DESC, t.id DESC
     LIMIT 6`
  );

  const budgets = listBudgets(month);
  const transactionCount = get('SELECT COUNT(*) AS n FROM transactions').n;

  return {
    month,
    totals: {
      balance: totals.income - totals.expense,
      income: totals.income,
      expense: totals.expense,
      savings: totals.income - totals.expense,
    },
    monthTotals: {
      income: monthTotals.income,
      expense: monthTotals.expense,
      savings: monthTotals.income - monthTotals.expense,
    },
    series,
    categories,
    recent,
    budgets,
    transactionCount,
  };
}

/* ---------------------------------------------------------------- reports */

function report({ from, to } = {}) {
  if (!isValidDate(from) || !isValidDate(to)) fail('Please choose a valid date range.');
  if (from > to) fail('The start date must be before the end date.');

  const totals = get(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
       COUNT(*) AS count
     FROM transactions WHERE date >= ? AND date <= ?`,
    [from, to]
  );

  const months = buildSeries(seriesBetween(from, to));

  const categories = all(
    `SELECT c.id, c.name, c.color, SUM(t.amount) AS total, COUNT(*) AS count
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
     GROUP BY c.id
     ORDER BY total DESC`,
    [from, to]
  );
  const incomeCategories = all(
    `SELECT c.id, c.name, c.color, SUM(t.amount) AS total, COUNT(*) AS count
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.type = 'income' AND t.date >= ? AND t.date <= ?
     GROUP BY c.id
     ORDER BY total DESC`,
    [from, to]
  );

  const payments = all(
    `SELECT payment_method AS method,
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense,
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income
     FROM transactions WHERE date >= ? AND date <= ?
     GROUP BY payment_method
     ORDER BY expense DESC`,
    [from, to]
  );

  const expenseTotal = totals.expense;
  const savings = totals.income - totals.expense;

  return {
    from,
    to,
    totals: {
      income: totals.income,
      expense: totals.expense,
      savings,
      savingsRate: totals.income > 0 ? (savings / totals.income) * 100 : 0,
      count: totals.count,
      averageExpense: totals.count > 0 ? totals.expense / totals.count : 0,
    },
    months,
    categories: categories.map((c) => ({
      ...c,
      share: expenseTotal > 0 ? (c.total / expenseTotal) * 100 : 0,
    })),
    incomeCategories,
    payments,
  };
}

function transactionsForExport({ from, to } = {}) {
  if (!isValidDate(from) || !isValidDate(to)) fail('Please choose a valid date range.');
  return all(
    `SELECT t.date, t.title, t.type, c.name AS category, t.amount, t.payment_method, t.notes
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.date >= ? AND t.date <= ?
     ORDER BY t.date ASC, t.id ASC`,
    [from, to]
  );
}

/* ------------------------------------------------------- backup / restore */

function backupTo(targetPath) {
  persist();
  fs.copyFileSync(dbPath, targetPath);
  return targetPath;
}

function restoreFrom(sourcePath) {
  const buffer = fs.readFileSync(sourcePath);
  let probe;
  try {
    probe = new SQL.Database(buffer);
  } catch {
    fail('That file is not a valid SQLite database.');
  }

  const tables = new Set();
  try {
    const res = probe.exec("SELECT name FROM sqlite_master WHERE type = 'table'");
    if (res.length) res[0].values.forEach((row) => tables.add(row[0]));
  } catch {
    probe.close();
    fail('That file is not a valid Spendly backup.');
  }
  probe.close();

  if (!tables.has('transactions') || !tables.has('categories')) {
    fail('That file is not a Spendly backup.');
  }

  db.close();
  fs.copyFileSync(sourcePath, dbPath);

  db = new SQL.Database(fs.readFileSync(dbPath));
  db.run('PRAGMA foreign_keys = ON;');
  db.run(SCHEMA);
  db.run("INSERT OR IGNORE INTO settings (id, currency, theme) VALUES (1, 'BDT', 'dark')");
  persist();

  return { settings: getSettings(), categories: listCategories() };
}

module.exports = {
  init,
  getDbPath,
  PAYMENT_METHODS,
  CURRENCIES,
  getSettings,
  updateSettings,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  deleteAllTransactions,
  listBudgets,
  saveBudget,
  deleteBudget,
  dashboard,
  report,
  transactionsForExport,
  backupTo,
  restoreFrom,
};
