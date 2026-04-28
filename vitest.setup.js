import { indexedDB, IDBKeyRange, IDBRequest, IDBCursor, IDBObjectStore, IDBIndex, IDBTransaction, IDBDatabase } from 'fake-indexeddb';

// Polyfill IndexedDB APIs for Node.js test environment
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.IDBRequest = IDBRequest;
globalThis.IDBCursor = IDBCursor;
globalThis.IDBObjectStore = IDBObjectStore;
globalThis.IDBIndex = IDBIndex;
globalThis.IDBTransaction = IDBTransaction;
globalThis.IDBDatabase = IDBDatabase;
