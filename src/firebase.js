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
    db = getFirestore(app);
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
  // Use Firebase Auth user if available, otherwise device-based fallback
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

/* ─── Main Data (profile, savings, debts, investments, goals) ──── */

export async function loadUserData() {
  if (!FIREBASE_CONFIGURED || !db) return null;
  try {
    const uid = getCurrentUserId();
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
    const uid = getCurrentUserId();
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
    const uid = getCurrentUserId();
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
    const uid = getCurrentUserId();
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
    return null;
  }
}

export async function saveDailyLog(dateStr, logData) {
  if (!FIREBASE_CONFIGURED || !db) return;
  try {
    const uid = getCurrentUserId();
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
    const uid = getCurrentUserId();
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
