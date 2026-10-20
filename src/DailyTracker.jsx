import React, { useState, useMemo, useContext, useEffect } from "react";
import { ThemeContext } from "./FinCompassContext";
import { processInvoiceFile } from "./imageCompressor";
import { getLocalInvoiceFile } from "./fileStorage";
import { loadInvoiceFile } from "./firebase";

/* ================================================================== *
 * DailyTracker — Pure transaction log (credit & debit)
 * ================================================================== */

export const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };

export const DEFAULT_CATEGORIES = [
  { id: "food", label: "Food & Dining", icon: "🍽️", color: "#F97316", budget: 0 },
  { id: "transport", label: "Transport", icon: "🚗", color: "#3B82F6", budget: 0 },
  { id: "shopping", label: "Shopping", icon: "🛒", color: "#A855F7", budget: 0 },
  { id: "entertainment", label: "Entertainment", icon: "🎬", color: "#EC4899", budget: 0 },
  { id: "bills", label: "Bills & Utilities", icon: "⚡", color: "#EAB308", budget: 0 },
  { id: "health", label: "Health", icon: "💊", color: "#22C55E", budget: 0 },
  { id: "groceries", label: "Groceries", icon: "🧺", color: "#14B8A6", budget: 0 },
  { id: "education", label: "Education", icon: "📚", color: "#6366F1", budget: 0 },
  { id: "emi", label: "EMI / Loan Payment", icon: "🏦", color: "#EF4444", budget: 0 },
  { id: "investment", label: "SIP / Investment", icon: "📈", color: "#059669", budget: 0 },
  { id: "goals", label: "Goal Savings", icon: "🎯", color: "#3B82F6", budget: 0 },
  { id: "salary", label: "Salary / Income", icon: "💼", color: "#10B981", budget: 0 },
  { id: "transfer", label: "Transfer", icon: "🔄", color: "#64748B", budget: 0 },
  { id: "other", label: "Other", icon: "📦", color: "#94A3B8", budget: 0 },
];

const PAY_METHODS = [
  { value: "upi", label: "📱 UPI / GPay" },
  { value: "credit_card", label: "💳 Credit Card" },
  { value: "card", label: "💳 Debit Card" },
  { value: "cash", label: "💵 Cash" },
  { value: "netbanking", label: "🌐 Net Banking" },
  { value: "other", label: "📦 Other" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = todayStr();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yStr) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function getLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/* ─── Transaction Form ──────────────────────────────────────────── */
function TransactionForm({
  onAdd,
  categories,
  C,
  banks = [],
  cash = 0,
  debts = [],
  investments = [],
  creditCards = [],
  goals = [],
  bills = [],
}) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("debit"); // credit | debit
  const [catId, setCatId] = useState(categories[0]?.id || "food");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("upi");
  const [accountId, setAccountId] = useState(""); // bank id, "cash", creditCard id, or "" (none)
  const [debtId, setDebtId] = useState("");
  const [investmentId, setInvestmentId] = useState("");
  const [billId, setBillId] = useState("");
  const [goalId, setGoalId] = useState("");

  // Invoice attachment state
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [invoicePreview, setInvoicePreview] = useState(null);

  const cat = categories.find((c) => c.id === catId) || categories[0];
  const activeDebts = (debts || []).filter((d) => d.outstanding > 0);
  const activeInvestments = investments || [];
  const activeGoals = goals || [];
  const activeBills = bills || [];
  const isEmi = catId === "emi";
  const isInvestment = catId === "investment";
  const isBill = catId === "bills" || catId === "utilities" || catId === "rent";
  const isGoal = catId === "goals" || Boolean(goalId);

  // Selected goal details for live calculation preview
  const selectedGoal = useMemo(() => {
    return activeGoals.find((g) => g.id === goalId);
  }, [activeGoals, goalId]);

  // Selected credit card details for live calculation preview
  const selectedCreditCard = useMemo(() => {
    return (creditCards || []).find((c) => c.id === accountId);
  }, [creditCards, accountId]);

  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");

  const handleInvoiceUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setInvoiceLoading(true);
    setInvoiceError("");
    try {
      const processed = await processInvoiceFile(file);
      setInvoiceFile({
        name: processed.name,
        type: processed.type,
        size: processed.size,
        data: processed.dataUrl,
        thumbnail: processed.thumbnail,
      });
      setInvoicePreview(processed.dataUrl);
      if (!note) {
        setNote(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      }
    } catch (err) {
      console.warn("Invoice upload processing failed:", err);
      setInvoiceError(err.message || "Could not process this file.");
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleRemoveInvoice = () => {
    setInvoiceFile(null);
    setInvoicePreview(null);
    setInvoiceError("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;

    const entry = {
      id: "tx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      time: new Date().toISOString(),
      type, // "credit" or "debit"
      catId,
      note: note.trim(),
      amount: amt,
      method,
    };

    // Account (Bank / Cash / Credit Card)
    if (accountId) {
      entry.accountId = accountId;
      // If selected account is a credit card, tag creditCardId specifically too
      if (selectedCreditCard) {
        entry.creditCardId = accountId;
        if (method !== "credit_card" && method !== "card") {
          entry.method = "credit_card";
        }
      }
    }

    // Bi-directional Link to specific goal
    if (goalId) {
      entry.goalId = goalId;
    }

    // Link to specific debt, investment, or recurring bill
    if (isEmi && debtId) entry.debtId = debtId;
    if (isInvestment && investmentId) entry.investmentId = investmentId;
    if (billId) entry.billId = billId;

    // Attach invoice if uploaded
    if (invoiceFile) {
      entry.invoice = {
        fileName: invoiceFile.name,
        fileType: invoiceFile.type,
        fileSize: invoiceFile.size,
        fileData: invoiceFile.data,
      };
    }

    onAdd(entry);
    setAmount("");
    setNote("");
    setGoalId("");
    setDebtId("");
    setInvestmentId("");
    setBillId("");
    setInvoiceFile(null);
    setInvoicePreview(null);
  };

  // Build account options from banks + cash + credit cards
  const accountOptions = useMemo(() => {
    const opts = [{ value: "", label: "— Don't track account —" }];

    // Cash
    if (typeof cash === "number") {
      opts.push({ value: "cash", label: `💵 Cash in Hand (${inr(cash)})` });
    }

    // Bank Accounts
    (banks || []).forEach((b) => {
      opts.push({ value: b.id, label: `🏦 ${b.name} (${inr(b.balance || 0)})` });
    });

    // Credit Cards (with remaining available limit)
    (creditCards || []).forEach((c) => {
      const avail = Math.max(0, (c.totalLimit || 0) - (c.currentOutstanding || 0));
      opts.push({
        value: c.id,
        label: `💳 ${c.name} (${inr(avail)} left / Limit ${inr(c.totalLimit || 0)})`,
      });
    });

    return opts;
  }, [banks, cash, creditCards]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type toggle */}
      <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.rule }}>
        {[
          { v: "debit", label: "💸 Debit (Expense)", col: "#F87171" },
          { v: "credit", label: "💰 Credit (Income)", col: "#34D399" },
        ].map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setType(t.v)}
            className="flex-1 py-2.5 text-sm font-semibold transition-all"
            style={{
              background: type === t.v ? t.col : "transparent",
              color: type === t.v ? "#fff" : C.muted,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div>
        <label className="text-xs font-medium" style={{ color: C.muted }}>Amount (₹)</label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold" style={{ color: type === "credit" ? "#34D399" : "#F87171" }}>₹</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl border pl-8 pr-3 py-3 text-2xl font-bold focus:outline-none focus:ring-2"
            style={{ borderColor: C.rule, color: type === "credit" ? "#34D399" : "#F87171", background: C.card }}
          />
        </div>
      </div>

      {/* Category chips */}
      <div>
        <label className="text-xs font-medium" style={{ color: C.muted }}>Category</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setCatId(c.id); setDebtId(""); setInvestmentId(""); }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all"
              style={{
                background: catId === c.id ? c.color : `${c.color}1A`,
                color: catId === c.id ? "#fff" : c.color,
                border: `1.5px solid ${catId === c.id ? c.color : `${c.color}44`}`,
              }}
            >
              <span>{c.icon}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Bi-directional Link to Goals ────────────────────────────── */}
      <div>
        <label className="text-xs font-semibold flex items-center justify-between" style={{ color: C.ink }}>
          <span>🎯 Link to Savings Goal (Bi-Directional Calculation)</span>
          {activeGoals.length === 0 && <span className="text-[10px] text-amber-500 font-normal">No goals created yet</span>}
        </label>
        <select
          value={goalId}
          onChange={(e) => {
            setGoalId(e.target.value);
            if (e.target.value && catId !== "goals") setCatId("goals");
          }}
          className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
          style={{ borderColor: goalId ? "#3B82F6" : C.rule, color: C.ink, background: C.card }}
        >
          <option value="" style={{ background: C.card }}>— Don't link to a savings goal —</option>
          {activeGoals.map((g) => {
            const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
            return (
              <option key={g.id} value={g.id} style={{ background: C.card }}>
                🎯 {g.name} — Saved {inr(g.currentAmount)} / {inr(g.targetAmount)} ({pct}%)
              </option>
            );
          })}
        </select>

        {/* Live Calculation Feedback for Goal */}
        {selectedGoal && amount && parseFloat(amount) > 0 && (
          <div
            className="mt-2 text-xs rounded-xl p-3 border space-y-1"
            style={{ background: "#3B82F612", borderColor: "#3B82F644", color: "#2563EB" }}
          >
            <div className="font-bold flex items-center gap-1.5">
              <span>⚡ Live Bi-Directional Goal Calculation:</span>
            </div>
            {type === "debit" ? (
              <p>
                Debiting <strong>{inr(parseFloat(amount))}</strong> from your account will automatically increase <strong>{selectedGoal.name}</strong> savings from{" "}
                <span className="font-mono">{inr(selectedGoal.currentAmount)}</span> to{" "}
                <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                  {inr(selectedGoal.currentAmount + parseFloat(amount))}
                </strong>{" "}
                ({Math.min(100, Math.round(((selectedGoal.currentAmount + parseFloat(amount)) / selectedGoal.targetAmount) * 100))}% target achieved)!
              </p>
            ) : (
              <p>
                Crediting <strong>{inr(parseFloat(amount))}</strong> to your account linked from <strong>{selectedGoal.name}</strong> will withdraw from this goal, adjusting saved amount to{" "}
                <strong className="font-mono">{inr(Math.max(0, selectedGoal.currentAmount - parseFloat(amount)))}</strong>.
              </p>
            )}
          </div>
        )}
      </div>

      {/* EMI — Debt picker */}
      {isEmi && activeDebts.length > 0 && (
        <div>
          <label className="text-xs font-medium" style={{ color: C.muted }}>Link to Loan / Debt</label>
          <select
            value={debtId}
            onChange={(e) => {
              const val = e.target.value;
              setDebtId(val);
              const d = activeDebts.find((x) => x.id === val);
              if (d) {
                if (d.emi > 0) setAmount(String(d.emi));
                if (!note || note.startsWith("EMI:")) setNote(`EMI: ${d.name}`);
              }
            }}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: "#EF4444", color: C.ink, background: C.card }}
          >
            <option value="" style={{ background: C.card }}>— Select a loan —</option>
            {activeDebts.map((d) => (
              <option key={d.id} value={d.id} style={{ background: C.card }}>
                {d.name} — EMI ₹{Math.round(d.emi || 0).toLocaleString("en-IN")} (Bal: ₹{Math.round(d.outstanding).toLocaleString("en-IN")})
              </option>
            ))}
          </select>
          {debtId && (
            <div className="mt-1.5 text-xs rounded-lg px-3 py-2" style={{ background: "#EF444415", color: "#EF4444" }}>
              ✅ This payment will reduce the outstanding balance and remaining tenure of "{activeDebts.find((d) => d.id === debtId)?.name}"
            </div>
          )}
        </div>
      )}

      {/* Investment — Investment picker */}
      {isInvestment && activeInvestments.length > 0 && (
        <div>
          <label className="text-xs font-medium" style={{ color: C.muted }}>Link to Investment / SIP</label>
          <select
            value={investmentId}
            onChange={(e) => {
              const val = e.target.value;
              setInvestmentId(val);
              const inv = activeInvestments.find((x) => x.id === val);
              if (inv) {
                if (inv.monthlyContribution > 0) setAmount(String(inv.monthlyContribution));
                if (!note || note.startsWith("SIP:")) setNote(`SIP: ${inv.name}`);
              }
            }}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: "#059669", color: C.ink, background: C.card }}
          >
            <option value="" style={{ background: C.card }}>— Select an investment —</option>
            {activeInvestments.map((inv) => (
              <option key={inv.id} value={inv.id} style={{ background: C.card }}>
                {inv.name} — SIP ₹{Math.round(inv.monthlyContribution || 0).toLocaleString("en-IN")} (Val: ₹{Math.round(inv.currentValue).toLocaleString("en-IN")})
              </option>
            ))}
          </select>
          {investmentId && (
            <div className="mt-1.5 text-xs rounded-lg px-3 py-2" style={{ background: "#05966915", color: "#059669" }}>
              ✅ This amount will be added to the portfolio value of "{activeInvestments.find((inv) => inv.id === investmentId)?.name}"
            </div>
          )}
        </div>
      )}

      {/* Bill — Recurring Bill picker */}
      {(isBill || billId || (activeBills.length > 0 && !isEmi && !isInvestment)) && activeBills.length > 0 && (
        <div>
          <label className="text-xs font-medium" style={{ color: C.muted }}>Link to Recurring Bill</label>
          <select
            value={billId}
            onChange={(e) => {
              const val = e.target.value;
              setBillId(val);
              const b = activeBills.find((x) => x.id === val);
              if (b) {
                if (b.amount > 0) setAmount(String(b.amount));
                if (!note || note.startsWith("Bill:")) setNote(`Bill: ${b.name}`);
              }
            }}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: "#EAB308", color: C.ink, background: C.card }}
          >
            <option value="" style={{ background: C.card }}>— Don't link to a bill (or select one) —</option>
            {activeBills.map((b) => (
              <option key={b.id} value={b.id} style={{ background: C.card }}>
                {b.name} — ₹{Math.round(b.amount).toLocaleString("en-IN")}{b.paymentDay ? ` (Due ${b.paymentDay}th)` : ""}
              </option>
            ))}
          </select>
          {billId && (
            <div className="mt-1.5 text-xs rounded-lg px-3 py-2" style={{ background: "#EAB30815", color: "#CA8A04" }}>
              ✅ This payment marks "{activeBills.find((b) => b.id === billId)?.name}" as paid for this month in Payments This Month
            </div>
          )}
        </div>
      )}

      {/* Account selector (Banks, Cash, or Credit Cards) */}
      <div>
        <label className="text-xs font-medium" style={{ color: C.muted }}>Deduct from / Credit to Account or Card</label>
        <select
          value={accountId}
          onChange={(e) => {
            const val = e.target.value;
            setAccountId(val);
            const cc = (creditCards || []).find((c) => c.id === val);
            if (cc) setMethod("credit_card");
          }}
          className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
          style={{ borderColor: selectedCreditCard ? "#3B82F6" : C.rule, color: C.ink, background: C.card }}
        >
          {accountOptions.map((o) => (
            <option key={o.value} value={o.value} style={{ background: C.card }}>{o.label}</option>
          ))}
        </select>

        {/* Live Credit Card Leftover Limit calculation preview */}
        {selectedCreditCard && (
          <div
            className="mt-2 text-xs rounded-xl p-3 border space-y-1"
            style={{ background: "#1E3A8A15", borderColor: "#1E3A8A44", color: "#3B82F6" }}
          >
            <div className="font-bold flex items-center gap-1.5">
              <span>💳 Credit Card Limit Calculation:</span>
            </div>
            <p>
              Current available limit: <strong>{inr(Math.max(0, (selectedCreditCard.totalLimit || 0) - (selectedCreditCard.currentOutstanding || 0)))}</strong>.
              {amount && parseFloat(amount) > 0 && (
                type === "debit" ? (
                  <span>
                    {" "}After this expense, available limit left will be{" "}
                    <strong className="font-mono text-amber-500">
                      {inr(Math.max(0, (selectedCreditCard.totalLimit || 0) - ((selectedCreditCard.currentOutstanding || 0) + parseFloat(amount))))}
                    </strong>.
                  </span>
                ) : (
                  <span>
                    {" "}This payment will restore card available limit to{" "}
                    <strong className="font-mono text-emerald-500">
                      {inr(Math.max(0, (selectedCreditCard.totalLimit || 0) - Math.max(0, (selectedCreditCard.currentOutstanding || 0) - parseFloat(amount))))}
                    </strong>.
                  </span>
                )
              )}
            </p>
            <div className="text-[11px] opacity-75">
              Statement Generation Date: <strong>{selectedCreditCard.billDay || 15}th</strong> of every month
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Note */}
        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Lunch with Priya, Laptop Amazon EMI"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: C.rule, color: C.ink, background: C.card }}
          />
        </label>

        {/* Payment method */}
        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Paid via</span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: C.rule, color: C.ink, background: C.card }}
          >
            {PAY_METHODS.map((m) => (
              <option key={m.value} value={m.value} style={{ background: C.card }}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ─── Invoice / Receipt Attachment ─────────────────────────── */}
      <div
        className="rounded-xl p-3 border space-y-2"
        style={{ background: C.card, borderColor: C.rule }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: C.ink }}>
            <span>📎</span>
            <span>Attach Invoice / Receipt (Image or PDF)</span>
          </span>
          {invoiceFile && (
            <button
              type="button"
              onClick={handleRemoveInvoice}
              className="text-xs text-red-500 hover:underline"
            >
              ✕ Remove Attachment
            </button>
          )}
        </div>

        {invoiceFile ? (
          <div className="flex items-center gap-3 p-2 rounded-lg" style={{ background: C.paper }}>
            {invoiceFile.type === "application/pdf" ? (
              <span className="text-2xl">📄</span>
            ) : (
              <img
                src={invoicePreview}
                alt="Receipt"
                className="w-12 h-12 object-cover rounded shadow-sm flex-shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate" style={{ color: C.ink }}>
                {invoiceFile.name}
              </div>
              <div className="text-[10px]" style={{ color: C.faint }}>
                {Math.round(invoiceFile.size / 1024)} KB · Verified attached
              </div>
            </div>
          </div>
        ) : (
          <div>
            <input
              type="file"
              id="dt-invoice-file-upload"
              accept="image/*,application/pdf"
              onChange={handleInvoiceUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={invoiceLoading}
              onClick={() => document.getElementById("dt-invoice-file-upload")?.click()}
              className="w-full py-2 px-3 rounded-lg border border-dashed text-xs font-medium text-center transition-colors hover:border-blue-500 disabled:opacity-50"
              style={{ borderColor: C.rule, color: C.muted }}
            >
              {invoiceLoading ? "⏳ Compressing & optimizing receipt…" : "+ Upload bill, receipt, or invoice file"}
            </button>
            {invoiceError && (
              <div className="mt-1.5 text-xs text-red-500 font-medium">
                ⚠️ {invoiceError}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={!amount || parseFloat(amount) <= 0}
        className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40 shadow-sm"
        style={{ background: type === "credit" ? "#34D399" : "#F87171" }}
      >
        {type === "credit" ? "✅ Add Income" : "➕ Add Expense"}
      </button>
    </form>
  );
}

/* ─── Single Transaction Row ─────────────────────────────────────── */
function TxRow({
  tx,
  categories,
  onDelete,
  onPreviewInvoice,
  onAttachInvoice,
  selectedDay,
  C,
  banks = [],
  creditCards = [],
  goals = [],
  debts = [],
  investments = [],
  bills = [],
}) {
  const cat = categories.find((c) => c.id === tx.catId) || { icon: "📦", label: "Other", color: "#94A3B8" };
  const isCredit = tx.type === "credit";
  const time = new Date(tx.time).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

  // Resolve account or card name
  const linkedCard = (creditCards || []).find((c) => c.id === tx.accountId || c.id === tx.creditCardId);
  const linkedBank = (banks || []).find((b) => b.id === tx.accountId);
  const linkedGoal = (goals || []).find((g) => g.id === tx.goalId);
  const linkedDebt = (debts || []).find((d) => d.id === tx.debtId);
  const linkedInv = (investments || []).find((inv) => inv.id === tx.investmentId);
  const linkedBill = (bills || []).find((b) => b.id === tx.billId);

  let accountBadge = null;
  if (linkedCard) {
    const left = Math.max(0, (linkedCard.totalLimit || 0) - (linkedCard.currentOutstanding || 0));
    accountBadge = {
      label: `💳 ${linkedCard.name} (${inr(left)} left)`,
      color: "#3B82F6",
      bg: "#3B82F615",
    };
  } else if (tx.accountId === "cash") {
    accountBadge = { label: "💵 Cash", color: "#FBBF24", bg: "#FBBF2415" };
  } else if (linkedBank) {
    accountBadge = { label: `🏦 ${linkedBank.name}`, color: "#14B8A6", bg: "#14B8A615" };
  }

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all hover:shadow-sm"
      style={{ background: C.paper, border: `1px solid ${C.rule}` }}
    >
      {/* Category icon */}
      <div
        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
        style={{ background: `${cat.color}1A` }}
      >
        {cat.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: C.ink }}>
          {tx.note || cat.label}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: `${cat.color}1A`, color: cat.color }}>
            {cat.icon} {cat.label}
          </span>

          {accountBadge && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: accountBadge.bg, color: accountBadge.color }}>
              {accountBadge.label}
            </span>
          )}

          {/* Linked Goal Badge */}
          {linkedGoal && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#8B5CF618", color: "#8B5CF6" }}>
              🎯 {linkedGoal.name}
            </span>
          )}

          {/* Linked EMI Debt Badge */}
          {linkedDebt && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#EF444415", color: "#EF4444" }}>
              🏦 EMI: {linkedDebt.name}
            </span>
          )}

          {/* Linked SIP Investment Badge */}
          {linkedInv && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#05966915", color: "#059669" }}>
              📈 SIP: {linkedInv.name}
            </span>
          )}

          {/* Linked Recurring Bill Badge */}
          {linkedBill && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#EAB30815", color: "#CA8A04" }}>
              📄 Bill: {linkedBill.name}
            </span>
          )}

          {/* Invoice Badge & Direct Attach button */}
          {tx.invoice ? (
            <button
              onClick={() => onPreviewInvoice && onPreviewInvoice(tx.invoice, tx)}
              className="text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 border transition-opacity hover:opacity-80"
              style={{ background: "#2563EB15", borderColor: "#2563EB33", color: "#2563EB" }}
              title="Click to view attached invoice"
            >
              <span>📎</span>
              <span>Invoice</span>
            </button>
          ) : onAttachInvoice ? (
            <label
              className="text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 border border-dashed cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
              style={{ borderColor: C.rule, color: C.muted }}
              title="Attach invoice or receipt directly to this transaction"
            >
              <span>📎</span>
              <span>+ Receipt</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const processed = await processInvoiceFile(file);
                    onAttachInvoice(selectedDay, tx.id, {
                      id: "inv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
                      fileName: processed.name,
                      fileType: processed.type,
                      fileSize: processed.size,
                      fileData: processed.dataUrl,
                      thumbnail: processed.thumbnail,
                    });
                  } catch (err) {
                    alert(err.message || "Failed to attach invoice file.");
                  }
                }}
              />
            </label>
          ) : null}

          <span className="text-xs" style={{ color: C.faint }}>{time}</span>
          <span className="text-xs" style={{ color: C.faint }}>· {PAY_METHODS.find((m) => m.value === tx.method)?.label?.split(" ")[0] || tx.method}</span>
        </div>
      </div>

      {/* Amount + delete */}
      <div className="text-right flex-shrink-0">
        <div
          className="text-sm font-bold"
          style={{ ...NUM, color: isCredit ? "#34D399" : "#F87171" }}
        >
          {isCredit ? "+" : "-"}{inr(tx.amount)}
        </div>
        <button
          onClick={() => onDelete(tx.id)}
          className="text-xs mt-0.5 opacity-40 hover:opacity-80 transition-opacity"
          style={{ color: C.danger || "#F87171" }}
        >
          delete
        </button>
      </div>
    </div>
  );
}

/* ─── Day strip (compact) ────────────────────────────────────────── */
function DayStrip({ days, selected, onSelect, logs, C }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {days.map((d) => {
        const entries = logs[d]?.entries || [];
        const debits = entries.filter((e) => e.type !== "credit").reduce((s, e) => s + e.amount, 0);
        const credits = entries.filter((e) => e.type === "credit").reduce((s, e) => s + e.amount, 0);
        const isSelected = d === selected;
        const isToday = d === todayStr();
        const date = new Date(d + "T00:00:00");

        return (
          <button
            key={d}
            onClick={() => onSelect(d)}
            className="flex flex-col items-center gap-0.5 rounded-2xl px-2.5 py-2.5 min-w-[52px] transition-all flex-shrink-0"
            style={{
              background: isSelected ? C.ink : C.card,
              border: `1.5px solid ${isSelected ? C.ink : isToday ? C.sure : C.rule}`,
            }}
          >
            <span className="text-xs" style={{ color: isSelected ? "rgba(255,255,255,0.6)" : C.faint }}>
              {date.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 2)}
            </span>
            <span className="text-sm font-bold" style={{ color: isSelected ? "#fff" : C.ink }}>
              {date.getDate()}
            </span>
            {debits > 0 && (
              <span className="text-xs font-semibold" style={{ color: isSelected ? "#F87171" : "#F87171", ...NUM }}>
                -{(debits / 1000).toFixed(1)}k
              </span>
            )}
            {credits > 0 && (
              <span className="text-xs font-semibold" style={{ color: "#34D399", ...NUM }}>
                +{(credits / 1000).toFixed(1)}k
              </span>
            )}
            {debits === 0 && credits === 0 && (
              <span className="text-xs" style={{ color: isSelected ? "rgba(255,255,255,0.3)" : C.faint }}>—</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────── */
export default function DailyTrackerTab({
  logs,
  onAddEntry,
  onDeleteEntry,
  onAttachInvoice,
  onDetachInvoice,
  categories,
  banks = [],
  cash = 0,
  debts = [],
  investments = [],
  creditCards = [],
  goals = [],
  bills = [],
}) {
  const C = useContext(ThemeContext);
  const [selectedDay, setSelectedDay] = useState(todayStr());
  const [showForm, setShowForm] = useState(true);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [viewingFileContent, setViewingFileContent] = useState(null);
  const [viewingFileLoading, setViewingFileLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (viewingInvoice) {
      if (viewingInvoice.fileData) {
        setViewingFileContent(viewingInvoice.fileData);
        setViewingFileLoading(false);
      } else {
        const invId = viewingInvoice.id || viewingInvoice.tx?.id;
        setViewingFileLoading(true);
        getLocalInvoiceFile(invId)
          .then((cached) => {
            if (active && cached?.fileData) {
              setViewingFileContent(cached.fileData);
              setViewingFileLoading(false);
              return true;
            }
            return false;
          })
          .then((found) => {
            if (!found && active) {
              return loadInvoiceFile(invId).then((cloud) => {
                if (active) {
                  setViewingFileContent(cloud?.fileData || null);
                  setViewingFileLoading(false);
                }
              });
            }
          })
          .catch(() => {
            if (active) setViewingFileLoading(false);
          });
      }
    } else {
      setViewingFileContent(null);
      setViewingFileLoading(false);
    }
    return () => { active = false; };
  }, [viewingInvoice]);
  const last30 = useMemo(() => getLast30Days(), []);

  const selectedLog = logs[selectedDay] || { entries: [] };
  const entries = selectedLog.entries || [];

  const dayDebits = entries.filter((e) => e.type !== "credit").reduce((s, e) => s + e.amount, 0);
  const dayCredits = entries.filter((e) => e.type === "credit").reduce((s, e) => s + e.amount, 0);
  const dayNet = dayCredits - dayDebits;

  const handleAdd = (tx) => {
    onAddEntry(selectedDay, tx);
  };

  const handleDelete = (id) => {
    onDeleteEntry(selectedDay, id);
  };

  // All-time totals for the mini summary
  const allEntries = useMemo(() => {
    const all = [];
    Object.values(logs).forEach((log) => all.push(...(log.entries || [])));
    return all;
  }, [logs]);
  const totalDebits = allEntries.filter((e) => e.type !== "credit").reduce((s, e) => s + e.amount, 0);
  const totalCredits = allEntries.filter((e) => e.type === "credit").reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-5">
      {/* Top summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total In", value: inr(totalCredits), color: "#34D399", icon: "↑" },
          { label: "Total Out", value: inr(totalDebits), color: "#F87171", icon: "↓" },
          { label: "Net Balance", value: inr(totalCredits - totalDebits), color: totalCredits >= totalDebits ? "#34D399" : "#F87171", icon: "=" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl p-4 text-center border"
            style={{ background: C.card, borderColor: C.rule }}
          >
            <div className="text-lg font-bold" style={{ color: s.color }}>{s.icon}</div>
            <div className="text-xs font-medium mt-1" style={{ color: C.muted }}>{s.label}</div>
            <div className="text-base font-bold mt-0.5" style={{ ...NUM, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Day picker */}
      <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.rule }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold" style={{ color: C.ink }}>📅 Select Day</span>
          <span className="text-xs" style={{ color: C.faint }}>Last 30 days</span>
        </div>
        <DayStrip days={last30} selected={selectedDay} onSelect={setSelectedDay} logs={logs} C={C} />
      </div>

      {/* Selected day panel */}
      <div className="rounded-2xl overflow-hidden border" style={{ borderColor: C.rule }}>
        {/* Day header */}
        <div
          className="px-5 py-4 flex items-center justify-between border-b"
          style={{ background: C.card, borderColor: C.rule }}
        >
          <div>
            <div className="font-bold text-base" style={{ color: C.ink }}>{formatDateLabel(selectedDay)}</div>
            <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: C.muted }}>
              <span style={{ color: "#34D399", ...NUM }}>+{inr(dayCredits)}</span>
              <span style={{ color: "#F87171", ...NUM }}>-{inr(dayDebits)}</span>
              <span style={{ color: dayNet >= 0 ? "#34D399" : "#F87171", fontWeight: 700, ...NUM }}>
                Net {dayNet >= 0 ? "+" : ""}{inr(dayNet)}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowForm((p) => !p)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white transition-all shadow-sm"
            style={{ background: showForm ? C.faint : C.sure }}
          >
            {showForm ? "✕ Hide" : "+ Add"}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="p-5 border-b" style={{ background: C.paper, borderColor: C.rule }}>
            <TransactionForm
              onAdd={handleAdd}
              categories={categories}
              C={C}
              banks={banks}
              cash={cash}
              debts={debts}
              investments={investments}
              creditCards={creditCards}
              goals={goals}
              bills={bills}
            />
          </div>
        )}

        {/* Transactions list */}
        <div className="p-4" style={{ background: C.card }}>
          {entries.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-sm font-medium" style={{ color: C.ink }}>No transactions {selectedDay === todayStr() ? "today" : "this day"}</p>
              <p className="text-xs mt-1" style={{ color: C.faint }}>Hit "+ Add" to log one</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...entries]
                .sort((a, b) => new Date(b.time) - new Date(a.time))
                .map((tx) => (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    categories={categories}
                    onDelete={handleDelete}
                    onPreviewInvoice={(inv, t) => setViewingInvoice({ ...inv, tx: t })}
                    onAttachInvoice={onAttachInvoice}
                    selectedDay={selectedDay}
                    C={C}
                    banks={banks}
                    creditCards={creditCards}
                    goals={goals}
                    debts={debts}
                    investments={investments}
                    bills={bills}
                  />
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent history — all dates with entries */}
      {Object.keys(logs).filter((d) => (logs[d]?.entries || []).length > 0 && d !== selectedDay).length > 0 && (
        <div className="rounded-2xl overflow-hidden border" style={{ borderColor: C.rule }}>
          <div className="px-5 py-3 font-semibold text-sm border-b" style={{ background: C.card, color: C.ink, borderColor: C.rule }}>
            📋 Transaction History
          </div>
          <div className="divide-y" style={{ borderColor: C.rule }}>
            {Object.keys(logs)
              .filter((d) => (logs[d]?.entries || []).length > 0 && d !== selectedDay)
              .sort((a, b) => b.localeCompare(a))
              .slice(0, 10)
              .map((d) => {
                const dayEntries = logs[d]?.entries || [];
                const debit = dayEntries.filter((e) => e.type !== "credit").reduce((s, e) => s + e.amount, 0);
                const credit = dayEntries.filter((e) => e.type === "credit").reduce((s, e) => s + e.amount, 0);
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDay(d)}
                    className="w-full px-5 py-3 flex items-center justify-between hover:opacity-80 transition-opacity text-left"
                    style={{ background: C.card }}
                  >
                    <div>
                      <div className="text-sm font-medium" style={{ color: C.ink }}>{formatDateLabel(d)}</div>
                      <div className="text-xs mt-0.5" style={{ color: C.faint }}>{dayEntries.length} transaction{dayEntries.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div className="text-right">
                      {credit > 0 && <div className="text-xs font-semibold" style={{ color: "#34D399", ...NUM }}>+{inr(credit)}</div>}
                      {debit > 0 && <div className="text-xs font-semibold" style={{ color: "#F87171", ...NUM }}>-{inr(debit)}</div>}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Invoice Quick Lightbox from Transaction */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div
            className="w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl border"
            style={{ background: C.card, borderColor: C.rule }}
          >
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ background: C.paper, borderColor: C.rule }}>
              <div className="text-sm font-bold" style={{ color: C.ink }}>
                📎 Attached Invoice / Receipt
              </div>
              <button
                onClick={() => setViewingInvoice(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold border"
                style={{ borderColor: C.rule, color: C.muted }}
              >
                ✕
              </button>
            </div>
            <div className="p-4 flex items-center justify-center max-h-[70vh] overflow-auto bg-black/5 dark:bg-black/30 min-h-[250px]">
              {viewingFileLoading ? (
                <div className="text-center py-10" style={{ color: C.muted }}>
                  <div className="text-2xl animate-spin mb-2">⏳</div>
                  <div className="text-xs">Loading receipt attachment…</div>
                </div>
              ) : viewingFileContent ? (
                viewingInvoice.fileType === "application/pdf" || viewingInvoice.fileName?.endsWith(".pdf") ? (
                  <iframe
                    src={viewingFileContent}
                    title="Invoice PDF"
                    className="w-full h-96 rounded-lg border"
                    style={{ borderColor: C.rule }}
                  />
                ) : (
                  <img
                    src={viewingFileContent}
                    alt={viewingInvoice.fileName}
                    className="max-h-[60vh] max-w-full rounded-lg object-contain"
                  />
                )
              ) : (
                <div className="text-center py-10" style={{ color: C.muted }}>
                  <span className="text-3xl block mb-2">📁</span>
                  File content preview not available on this device.
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t flex items-center justify-between text-xs gap-2" style={{ background: C.paper, borderColor: C.rule }}>
              <span className="truncate max-w-[200px]" style={{ color: C.muted }}>{viewingInvoice.fileName}</span>
              <div className="flex items-center gap-2">
                {onDetachInvoice && viewingInvoice.tx && (
                  <button
                    onClick={() => {
                      onDetachInvoice(selectedDay, viewingInvoice.tx.id);
                      setViewingInvoice(null);
                    }}
                    className="px-2.5 py-1 rounded-lg font-semibold text-red-500 hover:bg-red-500/10 transition-colors border border-red-500/30"
                  >
                    ✂️ Detach Receipt
                  </button>
                )}
                {viewingFileContent && (
                  <a
                    href={viewingFileContent}
                    download={viewingInvoice.fileName || "invoice"}
                    className="px-3 py-1 rounded-lg text-white font-bold"
                    style={{ background: "#2563EB" }}
                  >
                    ⬇️ Download
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
