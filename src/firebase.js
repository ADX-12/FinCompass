/* ================================================================== *
 * firebase.js — FinCompass Firebase / Firestore Integration
 *
 * 👉 SETUP STEPS:
 *   1. Go to https://console.firebase.google.com
 *   2. Create a project → Add a Web App
 *   3. Enable Firestore Database (start in test mode)
 *   4. Replace the firebaseConfig values below with your own
 * ================================================================== */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

// ─── YOUR FIREBASE CONFIG ───────────────────────────────────────────
// Replace these with values from Firebase Console → Project Settings → Your apps
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
// ────────────────────────────────────────────────────────────────────

// Detect if config is still placeholder
export const FIREBASE_CONFIGURED =
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID";

let app, db;

if (FIREBASE_CONFIGURED) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (e) {
    console.warn("Firebase init failed:", e);
  }
}

/* ─── Anonymous Device User ID ──────────────────────────────────── */
// Each device gets a stable random ID (no login required)
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

/* ─── Main Data (profile, savings, debts, investments, goals) ──── */

export async function loadUserData() {
  if (!FIREBASE_CONFIGURED || !db) return null;
  try {
    const uid = getDeviceUserId();
    const snap = await getDoc(doc(db, "users", uid, "data", "main"));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("Firestore load failed:", e);
    return null;
  }
}

export async function saveUserData(data) {
  if (!FIREBASE_CONFIGURED || !db) return;
  try {
    const uid = getDeviceUserId();
    await setDoc(doc(db, "users", uid, "data", "main"), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Firestore save failed:", e);
  }
}

/* ─── Banks & Cash ──────────────────────────────────────────────── */

export async function loadBanks() {
  if (!FIREBASE_CONFIGURED || !db) return null;
  try {
    const uid = getDeviceUserId();
    const snap = await getDoc(doc(db, "users", uid, "data", "banks"));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("Firestore loadBanks failed:", e);
    return null;
  }
}

export async function saveBanks(banks, cash) {
  if (!FIREBASE_CONFIGURED || !db) return;
  try {
    const uid = getDeviceUserId();
    await setDoc(doc(db, "users", uid, "data", "banks"), {
      banks,
      cash: cash ?? 0,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Firestore saveBanks failed:", e);
  }
}

/* ─── Daily Logs ────────────────────────────────────────────────── */

export async function loadDailyLogs() {
  if (!FIREBASE_CONFIGURED || !db) return null;
  try {
    const uid = getDeviceUserId();
    const colRef = collection(db, "users", uid, "daily");
    const snap = await getDocs(colRef);
    const logs = {};
    snap.forEach((d) => {
      logs[d.id] = d.data();
    });
    return logs; // keyed by YYYY-MM-DD
  } catch (e) {
    console.warn("Firestore loadDailyLogs failed:", e);
    return null;
  }
}

export async function saveDailyLog(dateStr, logData) {
  if (!FIREBASE_CONFIGURED || !db) return;
  try {
    const uid = getDeviceUserId();
    await setDoc(doc(db, "users", uid, "daily", dateStr), {
      ...logData,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Firestore saveDailyLog failed:", e);
  }
}

export async function deleteDailyEntry(dateStr, updatedLog) {
  if (!FIREBASE_CONFIGURED || !db) return;
  try {
    const uid = getDeviceUserId();
    if (!updatedLog || updatedLog.entries.length === 0) {
      await deleteDoc(doc(db, "users", uid, "daily", dateStr));
    } else {
      await setDoc(doc(db, "users", uid, "daily", dateStr), {
        ...updatedLog,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn("Firestore deleteDailyEntry failed:", e);
  }
}
