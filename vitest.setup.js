import { indexedDB, IDBKeyRange, IDBRequest, IDBCursor, IDBObjectStore, IDBIndex, IDBTransaction, IDBDatabase } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.IDBRequest = IDBRequest;
globalThis.IDBCursor = IDBCursor;
globalThis.IDBObjectStore = IDBObjectStore;
globalThis.IDBIndex = IDBIndex;
globalThis.IDBTransaction = IDBTransaction;
globalThis.IDBDatabase = IDBDatabase;

const store = new Map();
globalThis.localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null; },
  setItem(key, value) { store.set(key, String(value)); },
  removeItem(key) { store.delete(key); },
  clear() { store.clear(); },
  get length() { return store.size; },
  key(n) { return [...store.keys()][n] ?? null; },
};

globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail ?? null;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
  }
};

const listeners = new Map();
globalThis.window = {
  addEventListener(event, fn) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(fn);
  },
  removeEventListener(event, fn) {
    if (!listeners.has(event)) return;
    const fns = listeners.get(event).filter(f => f !== fn);
    if (fns.length) listeners.set(event, fns);
    else listeners.delete(event);
  },
  dispatchEvent(event) {
    const fns = listeners.get(event.type) || [];
    fns.forEach(fn => fn(event));
    return true;
  },
  dispatchEventForTest(event, ...args) {
    const fns = listeners.get(event.type) || [];
    fns.forEach(fn => fn(event, ...args));
  },
};
