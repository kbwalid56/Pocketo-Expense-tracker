'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  settings: {
    get: () => invoke('settings:get'),
    update: (patch) => invoke('settings:update', patch),
  },
  categories: {
    list: () => invoke('categories:list'),
    create: (payload) => invoke('categories:create', payload),
    update: (id, payload) => invoke('categories:update', id, payload),
    remove: (id) => invoke('categories:delete', id),
  },
  transactions: {
    list: (filters) => invoke('transactions:list', filters),
    get: (id) => invoke('transactions:get', id),
    create: (payload) => invoke('transactions:create', payload),
    update: (id, payload) => invoke('transactions:update', id, payload),
    remove: (id) => invoke('transactions:delete', id),
    clear: () => invoke('transactions:clear'),
  },
  budgets: {
    list: (month) => invoke('budgets:list', month),
    save: (payload) => invoke('budgets:save', payload),
    remove: (id) => invoke('budgets:delete', id),
  },
  dashboard: () => invoke('dashboard:get'),
  reports: (range) => invoke('reports:get', range),
  data: {
    exportCsv: (range) => invoke('data:exportCsv', range),
    backup: () => invoke('data:backup'),
    restore: () => invoke('data:restore'),
  },
  info: () => invoke('app:info'),
});
