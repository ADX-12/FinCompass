import React, { useState, useMemo, useContext } from "react";
import { ThemeContext } from "./FinCompassContext";

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
  { id: "salary", label: "Salary / Income", icon: "💼", color: "#10B981", budget: 0 },
  { id: "transfer", label: "Transfer", icon: "🔄", color: "#64748B", budget: 0 },
  { id: "other", label: "Other", icon: "📦", color: "#94A3B8", budget: 0 },
];

const PAY_METHODS = [
  { value: "upi", label: "📱 UPI / GPay" },
  { value: "card", label: "💳 Card" },
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
function TransactionForm({ onAdd, categories, C }) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("debit"); // credit | debit
  const [catId, setCatId] = useState(categories[0]?.id || "food");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("upi");

  const cat = categories.find((c) => c.id === catId) || categories[0];

  const handleSubmit = (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    onAdd({
      id: "tx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      time: new Date().toISOString(),
      type, // "credit" or "debit"
      catId,
      note: note.trim(),
      amount: amt,
      method,
    });
    setAmount("");
    setNote("");
  };

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
              onClick={() => setCatId(c.id)}
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

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Note */}
        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Lunch with Priya"
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

      <button
        type="submit"
        disabled={!amount || parseFloat(amount) <= 0}
        className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
        style={{ background: type === "credit" ? "#34D399" : "#F87171" }}
      >
        {type === "credit" ? "✅ Add Income" : "➕ Add Expense"}
      </button>
    </form>
  );
}

/* ─── Single Transaction Row ─────────────────────────────────────── */
function TxRow({ tx, categories, onDelete, C }) {
  const cat = categories.find((c) => c.id === tx.catId) || { icon: "📦", label: "Other", color: "#94A3B8" };
  const isCredit = tx.type === "credit";
  const time = new Date(tx.time).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

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
        <div className="text-sm font-medium truncate" style={{ color: C.ink }}>
          {tx.note || cat.label}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: `${cat.color}1A`, color: cat.color }}>
            {cat.icon} {cat.label}
          </span>
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
export default function DailyTrackerTab({ logs, onAddEntry, onDeleteEntry, categories }) {
  const C = useContext(ThemeContext);
  const [selectedDay, setSelectedDay] = useState(todayStr());
  const [showForm, setShowForm] = useState(true);
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
            className="rounded-2xl p-4 text-center"
            style={{ background: C.card, border: `1.5px solid ${C.rule}` }}
          >
            <div className="text-lg font-bold" style={{ color: s.color }}>{s.icon}</div>
            <div className="text-xs font-medium mt-1" style={{ color: C.muted }}>{s.label}</div>
            <div className="text-base font-bold mt-0.5" style={{ ...NUM, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Day picker */}
      <div className="rounded-2xl p-4" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold" style={{ color: C.ink }}>📅 Select Day</span>
          <span className="text-xs" style={{ color: C.faint }}>Last 30 days</span>
        </div>
        <DayStrip days={last30} selected={selectedDay} onSelect={setSelectedDay} logs={logs} C={C} />
      </div>

      {/* Selected day panel */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${C.rule}` }}>
        {/* Day header */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ background: C.card, borderBottom: `1px solid ${C.rule}` }}
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
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white transition-all"
            style={{ background: showForm ? C.faint : C.sure }}
          >
            {showForm ? "✕ Hide" : "+ Add"}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="p-5" style={{ background: C.paper, borderBottom: `1px solid ${C.rule}` }}>
            <TransactionForm onAdd={handleAdd} categories={categories} C={C} />
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
                  <TxRow key={tx.id} tx={tx} categories={categories} onDelete={handleDelete} C={C} />
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent history — all dates with entries */}
      {Object.keys(logs).filter((d) => (logs[d]?.entries || []).length > 0 && d !== selectedDay).length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${C.rule}` }}>
          <div className="px-5 py-3 font-semibold text-sm" style={{ background: C.card, color: C.ink, borderBottom: `1px solid ${C.rule}` }}>
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
    </div>
  );
}
