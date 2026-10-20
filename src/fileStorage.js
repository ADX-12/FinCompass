/**
 * fileStorage.js
 * Client-side IndexedDB cache for invoice & receipt binary data.
 * Keeps localStorage clean and enables fast offline access to uploaded receipts.
 */

const DB_NAME = "fincompass_store_v1";
const STORE_NAME = "invoice_files";
const DB_VERSION = 1;

let dbPromise = null;

function getDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return resolve(null);
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn("IndexedDB open failed:", request.error);
      resolve(null);
    };
  });

  return dbPromise;
}

export async function saveLocalInvoiceFile(id, payload) {
  if (!id || !payload) return;
  try {
    const db = await getDb();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({
        id,
        fileData: payload.fileData || payload.dataUrl,
        fileName: payload.fileName || payload.name,
        fileType: payload.fileType || payload.type,
        fileSize: payload.fileSize || payload.size,
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn("IndexedDB save failed:", tx.error);
        resolve(false);
      };
    });
  } catch (err) {
    console.warn("saveLocalInvoiceFile error:", err);
  }
}

export async function getLocalInvoiceFile(id) {
  if (!id) return null;
  try {
    const db = await getDb();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn("getLocalInvoiceFile error:", err);
    return null;
  }
}

export async function deleteLocalInvoiceFile(id) {
  if (!id) return;
  try {
    const db = await getDb();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn("deleteLocalInvoiceFile error:", err);
  }
}
