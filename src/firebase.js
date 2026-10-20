/* ================================================================== *
 * firebase.js — FinCompass Firebase / Firestore + Auth Integration
 *
 * 👉 SETUP STEPS:
 *   1. Go to https://console.firebase.google.com
 *   2. Create a project → Add a Web App
 *   3. Enable Firestore Database (start in test mode)
 *   4. Enable Authentication → Email/Password + Google sign-in
 *   5. Replace the firebaseConfig values below with your own
 * ================================================================== */

import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";

// ─── YOUR FIREBASE CONFIG ───────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBQI_RDo7SkS5d7aHxKgrQyme5-byBvl4w",
  authDomain: "fincompass-1f585.firebaseapp.com",
  projectId: "fincompass-1f585",
  storageBucket: "fincompass-1f585.firebasestorage.app",
  messagingSenderId: "540398368289",
  appId: "1:540398368289:web:e89e4ea41d369a58221560",
  measurementId: "G-NGZQRPV5H3",
};
// ────────────────────────────────────────────────────────────────────

// Detect if config is still placeholder
export const FIREBASE_CONFIGURED =
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID";

let app, db, auth, analytics;

if (FIREBASE_CONFIGURED) {
  try {
    app = initializeApp(firebaseConfig);
    try {
      db = initializeFirestore(app, {
        ignoreUndefinedProperties: true,
      });
    } catch {
      db = getFirestore(app);
    }
    auth = getAuth(app);
    if (typeof window !== "undefined") {
      import("firebase/analytics")
        .then(({ getAnalytics }) => {
          analytics = getAnalytics(app);
        })
        .catch(() => {});
    }
  } catch (e) {
    console.warn("Firebase init failed:", e);
  }
}

/* ─── Auth exports ─────────────────────────────────────────────── */
export { auth, onAuthStateChanged };

export function getCurrentUserId() {
  if (auth && auth.currentUser) {
    return auth.currentUser.uid;
  }
  return getDeviceUserId();
}

export async function registerWithEmail(email, password, displayName) {
  if (!auth) throw new Error("Firebase not configured");
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

export async function loginWithEmail(email, password) {
  if (!auth) throw new Error("Firebase not configured");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginWithGoogle() {
  if (!auth) throw new Error("Firebase not configured");
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function logout() {
  if (!auth) return;
  await signOut(auth);
}

/* ─── Anonymous Device User ID (fallback when Firebase not configured) ── */
export function getDeviceUserId() {
  try {
    let uid = localStorage.getItem("fincompass_device_uid");
    if (!uid) {
      uid =
        "uid_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 9);
      localStorage.setItem("fincompass_device_uid", uid);
    }
    return uid;
  } catch {
    return "uid_fallback";
  }
}

/* ─── Data Sanitization Helper ──────────────────────────────────── */
/**
 * Recursively removes unsupported types (functions, symbols, undefined)
 * and flattens nested arrays to ensure Firestore compatibility.
 */
export function sanitizeForFirestore(val) {
  if (val === undefined) return null;
  if (val === null) return null;
  if (typeof val === "function" || typeof val === "symbol") return null;

  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined && typeof item !== "function" && typeof item !== "symbol")
      .map((item) => {
        // Flatten nested arrays if any (Firestore doesn't support array-of-arrays)
        if (Array.isArray(item)) {
          return { items: sanitizeForFirestore(item) };
        }
        return sanitizeForFirestore(item);
      });
  }

  if (typeof val === "object") {
    // Preserve Firestore field values and timestamps
    if (val.constructor && val.constructor.name !== "Object") {
      if (val instanceof Date) return val;
      if (typeof val._methodName === "string" || val.toMillis) return val;
    }
    const clean = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined && typeof v !== "function" && typeof v !== "symbol") {
        clean[k] = sanitizeForFirestore(v);
      }
    }
    return clean;
  }

  return val;
}

/* ─── Dedicated Invoice File Storage in Firestore ──────────────── */
export async function saveInvoiceFile(invoiceId, filePayload) {
  if (!FIREBASE_CONFIGURED || !db || !invoiceId || !filePayload) return;
  const uid = getCurrentUserId();
  const docRef = doc(db, "users", uid, "invoices", invoiceId);
  const sanitized = sanitizeForFirestore({
    id: invoiceId,
    fileData: filePayload.fileData || filePayload.dataUrl || "",
    fileName: filePayload.fileName || filePayload.name || "receipt",
    fileType: filePayload.fileType || filePayload.type || "image/jpeg",
    fileSize: filePayload.fileSize || filePayload.size || 0,
    updatedAt: serverTimestamp(),
  });
  await setDoc(docRef, sanitized);
}

export async function loadInvoiceFile(invoiceId) {
  if (!FIREBASE_CONFIGURED || !db || !invoiceId) return null;
  try {
    const uid = getCurrentUserId();
    const docRef = doc(db, "users", uid, "invoices", invoiceId);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("Firestore loadInvoiceFile failed:", e);
    return null;
  }
}

export async function deleteInvoiceFile(invoiceId) {
  if (!FIREBASE_CONFIGURED || !db || !invoiceId) return;
  try {
    const uid = getCurrentUserId();
    const docRef = doc(db, "users", uid, "invoices", invoiceId);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn("Firestore deleteInvoiceFile failed:", e);
  }
}

/* ─── Main Data (profile, savings, debts, investments, goals) ──── */

export async function loadUserData() {
  if (!FIREBASE_CONFIGURED || !db) return null;
  try {
    const uid = getCurrentUserId();
    const snap = await getDoc(doc(db, "users", uid, "data", "main"));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("Firestore load failed:", e);
    throw e;
  }
}

export async function saveUserData(data) {
  if (!FIREBASE_CONFIGURED || !db) return;
  try {
    const uid = getCurrentUserId();

    // 1. Sanitize user data
    const cleanData = sanitizeForFirestore(data);

    // 2. Strip heavy base64 fileData from the main document invoices array
    //    so the main profile document remains lightweight (< 50 KB) and never
    //    hits Firestore's 1 MB document or array entity limits!
    if (Array.isArray(cleanData.invoices)) {
      cleanData.invoices = cleanData.invoices.map((inv) => {
        if (!inv) return inv;
        const { fileData, ...meta } = inv;
        // If fileData is present on invoice, save to dedicated invoice document in background
        if (fileData && inv.id) {
          saveInvoiceFile(inv.id, {
            fileData,
            fileName: inv.fileName,
            fileType: inv.fileType,
            fileSize: inv.fileSize,
          }).catch((err) => console.warn("Background saveInvoiceFile failed:", err));
        }
        return {
          ...meta,
          hasFile: Boolean(fileData || inv.hasFile),
        };
      });
    }

    await setDoc(doc(db, "users", uid, "data", "main"), {
      ...cleanData,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Firestore saveUserData failed:", e);
    throw e;
  }
}

/* ─── Banks & Cash ──────────────────────────────────────────────── */

export async function loadBanks() {
  if (!FIREBASE_CONFIGURED || !db) return null;
  try {
    const uid = getCurrentUserId();
    const snap = await getDoc(doc(db, "users", uid, "data", "banks"));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("Firestore loadBanks failed:", e);
    throw e;
  }
}

export async function saveBanks(banks, cash) {
  if (!FIREBASE_CONFIGURED || !db) return;
  try {
    const uid = getCurrentUserId();
    const cleanBanks = sanitizeForFirestore(banks || []);
    await setDoc(doc(db, "users", uid, "data", "banks"), {
      banks: cleanBanks,
      cash: Number(cash) || 0,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Firestore saveBanks failed:", e);
    throw e;
  }
}

/* ─── Daily Logs ────────────────────────────────────────────────── */

export async function loadDailyLogs() {
  if (!FIREBASE_CONFIGURED || !db) return null;
  try {
    const uid = getCurrentUserId();
    const colRef = collection(db, "users", uid, "daily");
    const snap = await getDocs(colRef);
    const logs = {};
    snap.forEach((d) => {
      logs[d.id] = d.data();
    });
    return logs; // keyed by YYYY-MM-DD
  } catch (e) {
    console.warn("Firestore loadDailyLogs failed:", e);
    throw e;
  }
}

export async function saveDailyLog(dateStr, logData) {
  if (!FIREBASE_CONFIGURED || !db) return;
  try {
    const uid = getCurrentUserId();
    const cleanLog = sanitizeForFirestore(logData);

    // Strip heavy fileData from individual daily transactions to protect daily document size
    if (Array.isArray(cleanLog?.entries)) {
      cleanLog.entries = cleanLog.entries.map((entry) => {
        if (!entry) return entry;
        if (entry.invoice && entry.invoice.fileData) {
          const invId = entry.invoice.id || entry.id;
          saveInvoiceFile(invId, entry.invoice).catch(() => {});
          const { fileData, ...invMeta } = entry.invoice;
          return {
            ...entry,
            invoice: {
              ...invMeta,
              hasFile: true,
            },
          };
        }
        return entry;
      });
    }

    await setDoc(doc(db, "users", uid, "daily", dateStr), {
      ...cleanLog,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Firestore saveDailyLog failed:", e);
    throw e;
  }
}

export async function deleteDailyEntry(dateStr, updatedLog) {
  if (!FIREBASE_CONFIGURED || !db) return;
  try {
    const uid = getCurrentUserId();
    if (!updatedLog || !updatedLog.entries || updatedLog.entries.length === 0) {
      await deleteDoc(doc(db, "users", uid, "daily", dateStr));
    } else {
      const cleanLog = sanitizeForFirestore(updatedLog);
      await setDoc(doc(db, "users", uid, "daily", dateStr), {
        ...cleanLog,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (e) {
    console.error("Firestore deleteDailyEntry failed:", e);
    throw e;
  }
}
