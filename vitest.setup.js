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

// Polyfill matchMedia for jsdom (needed by stats.js)
globalThis.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

// Polyfill canvas getContext for jsdom (needed by stats.js)
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function(type) {
    if (type === '2d') {
      return {
        clearRect: () => {},
        fillRect: () => {},
        drawImage: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        measureText: () => ({ width: 0 }),
        fillText: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        arc: () => {},
      };
    }
    return null;
  };
}
