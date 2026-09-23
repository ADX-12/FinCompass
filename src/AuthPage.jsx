import React, { useState } from "react";
import {
  FIREBASE_CONFIGURED,
  registerWithEmail,
  loginWithEmail,
  loginWithGoogle,
} from "./firebase";

/* ================================================================== *
 * AuthPage — Sign In / Register with premium dark design
 * ================================================================== */

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export default function AuthPage({ onAuthSuccess }) {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        if (!name.trim()) { setError("Please enter your name"); setLoading(false); return; }
        if (password.length < 6) { setError("Password must be at least 6 characters"); setLoading(false); return; }
        const u = await registerWithEmail(email, password, name.trim());
        if (onAuthSuccess) onAuthSuccess(u);
      } else {
        const u = await loginWithEmail(email, password);
        if (onAuthSuccess) onAuthSuccess(u);
      }
    } catch (err) {
      const msg = err.code === "auth/user-not-found" ? "No account found with this email"
        : err.code === "auth/wrong-password" ? "Incorrect password"
        : err.code === "auth/invalid-credential" ? "Invalid email or password"
        : err.code === "auth/email-already-in-use" ? "An account with this email already exists"
        : err.code === "auth/weak-password" ? "Password must be at least 6 characters"
        : err.code === "auth/invalid-email" ? "Please enter a valid email address"
        : err.code === "auth/configuration-not-found" || err.code === "auth/operation-not-allowed"
        ? "Email/Password sign-in is not enabled yet in your Firebase Console. Go to Firebase Console → Authentication → Sign-in method and enable 'Email/Password'."
        : err.message || "Something went wrong";
      setError(msg);
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const u = await loginWithGoogle();
      if (onAuthSuccess) onAuthSuccess(u);
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        const msg = err.code === "auth/configuration-not-found" || err.code === "auth/operation-not-allowed"
          ? "Google sign-in is not enabled yet in your Firebase Console. Go to Firebase Console → Authentication → Sign-in method and enable 'Google'."
          : err.message || "Google sign-in failed";
        setError(msg);
      }
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0B1320 0%, #162234 50%, #0B1320 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
        padding: "20px",
      }}
    >
      {/* Floating particles background effect */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: `${120 + i * 60}px`,
              height: `${120 + i * 60}px`,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${["#14B8A620", "#818CF820", "#F8717120", "#FBBF2420", "#34D39920", "#A855F720"][i]} 0%, transparent 70%)`,
              left: `${10 + i * 15}%`,
              top: `${5 + (i % 3) * 30}%`,
              animation: `float${i} ${8 + i * 2}s ease-in-out infinite`,
            }}
          />
        ))}
        <style>{`
          @keyframes float0 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(30px, -20px); } }
          @keyframes float1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-20px, 30px); } }
          @keyframes float2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(25px, 15px); } }
          @keyframes float3 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-15px, -25px); } }
          @keyframes float4 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(20px, 20px); } }
          @keyframes float5 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-25px, 10px); } }
        `}</style>
      </div>

      <div style={{ width: "100%", maxWidth: "420px", position: "relative", zIndex: 1 }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "64px",
              height: "64px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, #14B8A6, #0E7C6B)",
              fontSize: "28px",
              fontWeight: 800,
              color: "#fff",
              boxShadow: "0 8px 32px rgba(20, 184, 166, 0.35)",
              marginBottom: "16px",
            }}
          >
            F
          </div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 800,
              color: "#F1F5F9",
              letterSpacing: "-0.03em",
              margin: 0,
            }}
          >
            FinCompass
          </h1>
          <p style={{ color: "#94A3B8", fontSize: "14px", marginTop: "6px" }}>
            Your personal financial decision engine
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "rgba(22, 34, 52, 0.85)",
            backdropFilter: "blur(20px)",
            borderRadius: "24px",
            border: "1px solid rgba(38, 53, 74, 0.8)",
            padding: "32px",
            boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
          }}
        >
          {/* Mode toggle */}
          <div
            style={{
              display: "flex",
              borderRadius: "14px",
              background: "#0B1320",
              padding: "4px",
              marginBottom: "28px",
              border: "1px solid #26354A",
            }}
          >
            {[
              { id: "login", label: "Sign In" },
              { id: "register", label: "Create Account" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => { setMode(t.id); setError(""); }}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "11px",
                  border: "none",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  background: mode === t.id ? "#14B8A6" : "transparent",
                  color: mode === t.id ? "#fff" : "#94A3B8",
                  fontFamily: FONT,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {mode === "register" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#94A3B8", marginBottom: "6px" }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    border: "1.5px solid #26354A",
                    background: "#0B1320",
                    color: "#F1F5F9",
                    fontSize: "14px",
                    outline: "none",
                    fontFamily: FONT,
                    boxSizing: "border-box",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#14B8A6"}
                  onBlur={(e) => e.target.style.borderColor = "#26354A"}
                />
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#94A3B8", marginBottom: "6px" }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1.5px solid #26354A",
                  background: "#0B1320",
                  color: "#F1F5F9",
                  fontSize: "14px",
                  outline: "none",
                  fontFamily: FONT,
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "#14B8A6"}
                onBlur={(e) => e.target.style.borderColor = "#26354A"}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#94A3B8", marginBottom: "6px" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Min. 6 characters" : "••••••••"}
                required
                minLength={6}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1.5px solid #26354A",
                  background: "#0B1320",
                  color: "#F1F5F9",
                  fontSize: "14px",
                  outline: "none",
                  fontFamily: FONT,
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = "#14B8A6"}
                onBlur={(e) => e.target.style.borderColor = "#26354A"}
              />
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "rgba(248, 113, 113, 0.12)",
                  border: "1px solid rgba(248, 113, 113, 0.25)",
                  color: "#F87171",
                  fontSize: "13px",
                  marginBottom: "16px",
                  lineHeight: 1.4,
                }}
              >
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                background: loading ? "#64748B" : "linear-gradient(135deg, #14B8A6, #0E7C6B)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 700,
                cursor: loading ? "wait" : "pointer",
                fontFamily: FONT,
                transition: "all 0.2s",
                boxShadow: loading ? "none" : "0 4px 16px rgba(20, 184, 166, 0.3)",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Please wait…" : mode === "register" ? "Create Account" : "Sign In"}
            </button>
          </form>

          {/* Divider */}
          {FIREBASE_CONFIGURED && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  margin: "20px 0",
                }}
              >
                <div style={{ flex: 1, height: "1px", background: "#26354A" }} />
                <span style={{ color: "#64748B", fontSize: "12px" }}>or</span>
                <div style={{ flex: 1, height: "1px", background: "#26354A" }} />
              </div>

              {/* Google button */}
              <button
                onClick={handleGoogle}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "14px",
                  border: "1.5px solid #26354A",
                  background: "#0B1320",
                  color: "#CBD5E1",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: FONT,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  transition: "all 0.2s",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", color: "#475569", fontSize: "11px", marginTop: "24px", lineHeight: 1.5 }}>
          FinCompass is a personal planning tool. Your data is stored securely
          {FIREBASE_CONFIGURED ? " in Firebase" : " on your device"}.
        </p>
      </div>
    </div>
  );
}
