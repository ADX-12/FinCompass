import React, { useState, useMemo, useContext } from "react";
import { ThemeContext } from "./FinCompassContext";

const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };

export const PROJECTION_CATEGORIES = [
  { id: "salary", label: "Salary / Bonus", icon: "💼", color: "#10B981" },
  { id: "freelance", label: "Freelance / Consulting", icon: "💻", color: "#3B82F6" },
  { id: "investment", label: "Investment Returns / FD", icon: "📈", color: "#059669" },
  { id: "rental", label: "Rental / Property Income", icon: "🏠", color: "#8B5CF6" },
  { id: "refund", label: "Tax Refund / Cashback", icon: "💰", color: "#F59E0B" },
  { id: "gift", label: "Gift / Family Support", icon: "🎁", color: "#EC4899" },
  { id: "reimbursement", label: "Expense Reimbursement", icon: "🧾", color: "#14B8A6" },
  { id: "other", label: "Other Expected Inflow", icon: "📦", color: "#64748B" },
];

export default function ProjectionsTab({
  projectedIncomes = [],
  onAddProjection,
  onUpdateProjection,
  onDeleteProjection,
  onMarkAsReceived, // creates a credit transaction in DailyTracker & sets status to received
  banks = [],
  cash = 0,
  upcomingExpenses = 0,
}) {
  const C = useContext(ThemeContext);
  const [filter, setFilter] = useState("all"); // "all" | "pending" | "received"
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form State
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");
  const [projectedDate, setProjectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [category, setCategory] = useState("salary");
  const [notes, setNotes] = useState("");
  const [targetAccount, setTargetAccount] = useState("");

  const todayStr = new Date().toISOString().slice(0, 10);

  // Filtered and sorted projections
  const filteredList = useMemo(() => {
    let list = [...projectedIncomes];
    if (filter === "pending") list = list.filter((p) => p.status !== "received");
    if (filter === "received") list = list.filter((p) => p.status === "received");
    return list.sort((a, b) => (a.projectedDate || "").localeCompare(b.projectedDate || ""));
  }, [projectedIncomes, filter]);

  // Aggregate Metrics
  const totalPending = useMemo(() => {
    return projectedIncomes
      .filter((p) => p.status !== "received")
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }, [projectedIncomes]);

  const next30Days = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    const limitStr = limit.toISOString().slice(0, 10);

    return projectedIncomes
      .filter((p) => p.status !== "received" && p.projectedDate >= todayStr && p.projectedDate <= limitStr)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }, [projectedIncomes, todayStr]);

  const totalReceived = useMemo(() => {
    return projectedIncomes
      .filter((p) => p.status === "received")
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }, [projectedIncomes]);

  // Total current liquid cash
  const currentLiquid = (banks || []).reduce((s, b) => s + (b.balance || 0), 0) + (Number(cash) || 0);
  const projectedFutureLiquid = currentLiquid + totalPending;

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setSource(item.source || "");
    setAmount(String(item.amount || ""));
    setProjectedDate(item.projectedDate || todayStr);
    setCategory(item.category || "salary");
    setNotes(item.notes || "");
    setTargetAccount(item.accountId || "");
    setShowAddForm(true);
  };

  const handleResetForm = () => {
    setEditingItem(null);
    setSource("");
    setAmount("");
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setProjectedDate(d.toISOString().slice(0, 10));
    setCategory("salary");
    setNotes("");
    setTargetAccount("");
    setShowAddForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedAmt = parseFloat(amount);
    if (!source.trim() || !parsedAmt || parsedAmt <= 0) return;

    if (editingItem) {
      onUpdateProjection({
        ...editingItem,
        source: source.trim(),
        amount: parsedAmt,
        projectedDate,
        category,
        notes: notes.trim(),
        accountId: targetAccount,
      });
    } else {
      const newItem = {
        id: "proj_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        source: source.trim(),
        amount: parsedAmt,
        projectedDate,
        category,
        notes: notes.trim(),
        status: "pending",
        accountId: targetAccount,
        createdAt: new Date().toISOString(),
      };
      onAddProjection(newItem);
    }
    handleResetForm();
  };

  // Group items by Month
  const groupedByMonth = useMemo(() => {
    const groups = {};
    filteredList.forEach((item) => {
      const ym = item.projectedDate ? item.projectedDate.slice(0, 7) : "Undated";
      if (!groups[ym]) groups[ym] = [];
      groups[ym].push(item);
    });
    return groups;
  }, [filteredList]);

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div
          className="rounded-2xl p-4 sm:p-5 flex flex-col justify-between border"
          style={{ background: C.card, borderColor: C.rule }}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
                🔮 Total Pending
              </span>
              <span className="text-lg">💰</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold mt-2 text-emerald-500" style={NUM}>
              {inr(totalPending)}
            </div>
          </div>
          <div className="text-xs mt-2" style={{ color: C.faint }}>
            {projectedIncomes.filter((p) => p.status !== "received").length} upcoming income stream(s)
          </div>
        </div>

        <div
          className="rounded-2xl p-4 sm:p-5 flex flex-col justify-between border"
          style={{ background: C.card, borderColor: C.rule }}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-500">
                ⚡ Next 30 Days
              </span>
              <span className="text-lg">🗓️</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold mt-2 text-blue-500" style={NUM}>
              {inr(next30Days)}
            </div>
          </div>
          <div className="text-xs mt-2" style={{ color: C.faint }}>
            Projected incoming within a month
          </div>
        </div>

        <div
          className="rounded-2xl p-4 sm:p-5 flex flex-col justify-between border"
          style={{ background: C.card, borderColor: C.rule }}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-500">
                📊 Projected Liquid
              </span>
              <span className="text-lg">📈</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold mt-2 text-purple-500" style={NUM}>
              {inr(projectedFutureLiquid)}
            </div>
          </div>
          <div className="text-xs mt-2" style={{ color: C.faint }}>
            Current liquid ({inr(currentLiquid)}) + Inflows
          </div>
        </div>

        <div
          className="rounded-2xl p-4 sm:p-5 flex flex-col justify-between border"
          style={{ background: C.card, borderColor: C.rule }}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-500">
                ✅ Realized Inflows
              </span>
              <span className="text-lg">🎉</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold mt-2 text-teal-500" style={NUM}>
              {inr(totalReceived)}
            </div>
          </div>
          <div className="text-xs mt-2" style={{ color: C.faint }}>
            Already received & logged
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.rule, background: C.card }}>
        {/* Header bar */}
        <div
          className="p-5 flex flex-wrap items-center justify-between gap-4 border-b"
          style={{ background: C.paper, borderColor: C.rule }}
        >
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.ink }}>
              Projected Money & Upcoming Inflows
            </h2>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              Plan upcoming bonuses, client payouts, dividends, and receivables before they arrive
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Pills */}
            <div className="flex rounded-xl p-1 border text-xs font-semibold" style={{ borderColor: C.rule, background: C.card }}>
              {[
                { v: "all", label: "All" },
                { v: "pending", label: "Pending" },
                { v: "received", label: "Received" },
              ].map((f) => (
                <button
                  key={f.v}
                  onClick={() => setFilter(f.v)}
                  className="px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    background: filter === f.v ? C.ink : "transparent",
                    color: filter === f.v ? C.paper : C.muted,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                if (showAddForm) handleResetForm();
                else setShowAddForm(true);
              }}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 shadow-sm"
              style={{ background: showAddForm ? C.faint : "#10B981" }}
            >
              {showAddForm ? "✕ Cancel" : "➕ Add Upcoming Money"}
            </button>
          </div>
        </div>

        {/* Add / Edit Form */}
        {showAddForm && (
          <form
            onSubmit={handleSubmit}
            className="p-5 sm:p-6 border-b space-y-4"
            style={{ background: C.paper, borderColor: C.rule }}
          >
            <div className="font-bold text-sm" style={{ color: C.ink }}>
              {editingItem ? "✏️ Edit Projected Money" : "➕ Project Upcoming Source of Money"}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Source Name */}
              <label className="block">
                <span className="text-xs font-medium" style={{ color: C.muted }}>Source / Description</span>
                <input
                  type="text"
                  required
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. Diwali Bonus, Freelance Client A, FD Maturity"
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ borderColor: C.rule, color: C.ink, background: C.card }}
                />
              </label>

              {/* Amount */}
              <label className="block">
                <span className="text-xs font-medium" style={{ color: C.muted }}>Projected Amount (₹)</span>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-emerald-500">₹</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full rounded-xl border pl-7 pr-3 py-2 text-sm font-bold text-emerald-500 focus:outline-none focus:ring-2"
                    style={{ borderColor: C.rule, background: C.card }}
                  />
                </div>
              </label>

              {/* Projected Date */}
              <label className="block">
                <span className="text-xs font-medium" style={{ color: C.muted }}>Projected Date</span>
                <input
                  type="date"
                  required
                  value={projectedDate}
                  onChange={(e) => setProjectedDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: C.rule, color: C.ink, background: C.card }}
                />
              </label>

              {/* Category */}
              <label className="block">
                <span className="text-xs font-medium" style={{ color: C.muted }}>Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: C.rule, color: C.ink, background: C.card }}
                >
                  {PROJECTION_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id} style={{ background: C.card }}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Expected Destination Account */}
              <label className="block">
                <span className="text-xs font-medium" style={{ color: C.muted }}>Target Account (Optional)</span>
                <select
                  value={targetAccount}
                  onChange={(e) => setTargetAccount(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: C.rule, color: C.ink, background: C.card }}
                >
                  <option value="" style={{ background: C.card }}>— Select account to deposit into —</option>
                  <option value="cash" style={{ background: C.card }}>💵 Cash in Hand ({inr(cash)})</option>
                  {(banks || []).map((b) => (
                    <option key={b.id} value={b.id} style={{ background: C.card }}>
                      🏦 {b.name} ({inr(b.balance || 0)})
                    </option>
                  ))}
                </select>
              </label>

              {/* Notes */}
              <label className="block sm:col-span-2 lg:col-span-1">
                <span className="text-xs font-medium" style={{ color: C.muted }}>Notes / Conditions (Optional)</span>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Depends on quarterly project approval"
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: C.rule, color: C.ink, background: C.card }}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2 rounded-xl text-xs font-semibold border transition-colors"
                style={{ borderColor: C.rule, color: C.muted, background: C.card }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90 shadow-sm"
                style={{ background: "#10B981" }}
              >
                {editingItem ? "Save Changes" : "Confirm Projection"}
              </button>
            </div>
          </form>
        )}

        {/* Projections List grouped by month */}
        <div className="p-5 space-y-6">
          {Object.keys(groupedByMonth).length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🔮</div>
              <h3 className="text-base font-semibold" style={{ color: C.ink }}>
                No projected money found
              </h3>
              <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: C.muted }}>
                Add your upcoming bonuses, expected client payments, dividends, or gifts to project your cash flow into the future.
              </p>
              <button
                onClick={() => setShowAddForm(true)}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                style={{ background: "#10B981" }}
              >
                + Add Upcoming Money
              </button>
            </div>
          ) : (
            Object.keys(groupedByMonth).map((ym) => {
              const monthItems = groupedByMonth[ym];
              const monthTotal = monthItems
                .filter((p) => p.status !== "received")
                .reduce((s, p) => s + (p.amount || 0), 0);

              let formattedMonth = ym;
              try {
                const [year, month] = ym.split("-");
                const d = new Date(year, month - 1, 1);
                formattedMonth = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
              } catch {}

              return (
                <div key={ym} className="space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b" style={{ borderColor: C.rule }}>
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: C.ink }}>
                      🗓️ {formattedMonth}
                    </span>
                    <span className="text-xs font-bold text-emerald-500" style={NUM}>
                      Expected: +{inr(monthTotal)}
                    </span>
                  </div>

                  <div className="grid gap-3">
                    {monthItems.map((item) => {
                      const cat = PROJECTION_CATEGORIES.find((c) => c.id === item.category) || PROJECTION_CATEGORIES[0];
                      const isReceived = item.status === "received";

                      // Days calculation
                      const itemDate = new Date(item.projectedDate + "T00:00:00");
                      const now = new Date(todayStr + "T00:00:00");
                      const diffDays = Math.round((itemDate - now) / (1000 * 60 * 60 * 24));

                      let badgeText = "";
                      let badgeColor = "#3B82F6";
                      if (isReceived) {
                        badgeText = "✅ Received";
                        badgeColor = "#10B981";
                      } else if (diffDays < 0) {
                        badgeText = `⚠️ Overdue (${Math.abs(diffDays)}d ago)`;
                        badgeColor = "#EF4444";
                      } else if (diffDays === 0) {
                        badgeText = "🌟 Due Today";
                        badgeColor = "#F59E0B";
                      } else if (diffDays === 1) {
                        badgeText = "Tomorrow";
                        badgeColor = "#3B82F6";
                      } else {
                        badgeText = `In ${diffDays} days`;
                        badgeColor = "#6366F1";
                      }

                      return (
                        <div
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border transition-all hover:shadow-sm"
                          style={{
                            background: isReceived ? `${C.paper}88` : C.paper,
                            borderColor: isReceived ? C.rule : `${cat.color}44`,
                            opacity: isReceived ? 0.75 : 1,
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                              style={{ background: `${cat.color}22` }}
                            >
                              {cat.icon}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-semibold text-sm truncate ${isReceived ? "line-through text-gray-400" : ""}`} style={{ color: C.ink }}>
                                  {item.source}
                                </span>
                                <span
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                  style={{ background: `${badgeColor}22`, color: badgeColor }}
                                >
                                  {badgeText}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 mt-0.5 text-xs flex-wrap" style={{ color: C.muted }}>
                                <span>📅 {item.projectedDate}</span>
                                <span>·</span>
                                <span style={{ color: cat.color }}>{cat.label}</span>
                                {item.accountId && (
                                  <>
                                    <span>·</span>
                                    <span>
                                      Target: {item.accountId === "cash" ? "💵 Cash" : (banks.find((b) => b.id === item.accountId)?.name || "🏦 Bank")}
                                    </span>
                                  </>
                                )}
                                {item.notes && (
                                  <>
                                    <span>·</span>
                                    <span className="italic">"{item.notes}"</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-base font-extrabold text-emerald-500" style={NUM}>
                                +{inr(item.amount)}
                              </div>
                              <div className="text-[10px]" style={{ color: C.faint }}>
                                {isReceived ? "Deposited" : "Projected"}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {!isReceived && (
                                <button
                                  onClick={() => onMarkAsReceived(item)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 shadow-sm"
                                  style={{ background: "#10B981" }}
                                  title="Mark as Received & Log into Daily Transactions"
                                >
                                  <span>✅</span>
                                  <span>Received</span>
                                </button>
                              )}

                              <button
                                onClick={() => handleOpenEdit(item)}
                                className="p-1.5 rounded-lg text-xs border transition-colors hover:opacity-80"
                                style={{ borderColor: C.rule, color: C.muted, background: C.card }}
                                title="Edit"
                              >
                                ✏️
                              </button>

                              <button
                                onClick={() => onDeleteProjection(item.id)}
                                className="p-1.5 rounded-lg text-xs border transition-colors hover:bg-red-500/10 text-red-500"
                                style={{ borderColor: C.rule, background: C.card }}
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
