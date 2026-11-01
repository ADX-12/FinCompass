import React, { useState, useMemo, useContext } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, ReferenceLine,
} from "recharts";
import { ThemeContext } from "./FinCompassContext";
import { inr } from "./DailyTracker";

/* ================================================================== *
 * SpendingAnalysis — Category budgets + weekly/monthly analytics
 * ================================================================== */

const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };
const inrShort = (n) => {
  const v = Math.round(n || 0); const a = Math.abs(v);
  if (a >= 100000) return "₹" + (v / 100000).toFixed(1) + "L";
  if (a >= 1000) return "₹" + (v / 1000).toFixed(1) + "k";
  return "₹" + v;
};

const PERIOD_OPTIONS = [
  { value: "month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "3months", label: "Last 3 Months" },
  { value: "week", label: "This Week" },
];

const CAT_COLORS = [
  "#F97316", "#3B82F6", "#A855F7", "#EC4899", "#EAB308",
  "#22C55E", "#14B8A6", "#6366F1", "#F43F5E", "#64748B",
  "#10B981", "#F59E0B", "#8B5CF6", "#06B6D4", "#EF4444",
];

function getPeriodDates(period, selectedMonth) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // Sunday
    return {
      start: start.toISOString().slice(0, 10),
      end: todayStr,
      label: "This Week",
      monthName: "This Week",
      monthKey: now.toISOString().slice(0, 7),
    };
  }

  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthName = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      label: `This Month (${monthName})`,
      monthName,
      monthKey: now.toISOString().slice(0, 7),
    };
  }

  if (period === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    const monthName = start.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      label: `Last Month (${monthName})`,
      monthName,
      monthKey: start.toISOString().slice(0, 7),
    };
  }

  if (period === "custom_month" && selectedMonth) {
    const [y, m] = selectedMonth.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const monthName = start.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      label: monthName,
      monthName,
      monthKey: selectedMonth,
    };
  }

  if (period === "3months") {
    const start = new Date(now);
    start.setMonth(now.getMonth() - 2);
    start.setDate(1);
    return {
      start: start.toISOString().slice(0, 10),
      end: todayStr,
      label: "Last 3 Months",
      monthName: "Last 3 Months",
      monthKey: now.toISOString().slice(0, 7),
    };
  }

  return {
    start: todayStr,
    end: todayStr,
    label: "Today",
    monthName: "Today",
    monthKey: todayStr.slice(0, 7),
  };
}

function ChartTip({ active, payload, label }) {
  const C = useContext(ThemeContext);
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-xl" style={{ background: C.ink, color: C.paper, ...NUM }}>
      <div style={{ color: "rgba(255,255,255,0.5)" }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="mt-0.5 flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm inline-block" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto font-semibold">{inr(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Category Budget Card ──────────────────────────────────────── */
function BudgetCard({ cat, spent, onEditBudget, C }) {
  const [editing, setEditing] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(cat.budget || 0));

  const budget = cat.budget || 0;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const isOver = budget > 0 && spent > budget;
  const barColor = isOver ? "#F87171" : pct > 80 ? "#FBBF24" : cat.color;

  const handleSave = () => {
    const val = parseFloat(budgetInput) || 0;
    onEditBudget(cat.id, val);
    setEditing(false);
  };

  return (
    <div
      className="rounded-2xl p-4 transition-all"
      style={{ background: C.card, border: `1.5px solid ${isOver ? "#F87171" : C.rule}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: `${cat.color}1A` }}
          >
            {cat.icon}
          </span>
          <div>
            <div className="font-semibold text-sm" style={{ color: C.ink }}>{cat.label}</div>
            {isOver && (
              <span className="text-xs font-semibold" style={{ color: "#F87171" }}>
                Over by {inr(spent - budget)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => { setEditing((p) => !p); setBudgetInput(String(budget)); }}
          className="text-xs px-2 py-1 rounded-lg border transition-colors"
          style={{ borderColor: C.rule, color: C.muted, background: C.paper }}
        >
          {editing ? "✕" : "✏️ Budget"}
        </button>
      </div>

      {/* Budget edit */}
      {editing && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium" style={{ color: C.faint }}>₹</span>
          <input
            autoFocus
            type="number"
            min="0"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            className="flex-1 rounded-lg border px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1"
            style={{ borderColor: cat.color, color: C.ink, background: C.paper }}
          />
          <button
            onClick={handleSave}
            className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
            style={{ background: cat.color }}
          >
            Save
          </button>
        </div>
      )}

      {/* Amounts */}
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-lg font-bold" style={{ ...NUM, color: isOver ? "#F87171" : C.ink }}>{inr(spent)}</span>
        {budget > 0 && (
          <span className="text-xs" style={{ color: C.faint }}>
            / {inr(budget)} budget
          </span>
        )}
        {budget === 0 && (
          <span className="text-xs italic" style={{ color: C.faint }}>no budget set</span>
        )}
      </div>

      {/* Progress bar */}
      {budget > 0 && (
        <div>
          <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: C.rule }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs" style={{ color: C.faint }}>
            <span>{pct.toFixed(0)}% used</span>
            <span>{inr(Math.max(0, budget - spent))} left</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Add Category Form ──────────────────────────────────────────── */
function AddCategoryForm({ onAdd, C }) {
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [budget, setBudget] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const [show, setShow] = useState(false);

  const QUICK_ICONS = ["🏷️", "🎁", "🍕", "🏋️", "✈️", "🎵", "💻", "🏠", "🐾", "👗", "⚽", "🎮", "📱", "💈", "🌿"];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    onAdd({
      id: "cat_" + Date.now(),
      label: label.trim(),
      icon,
      color: CAT_COLORS[colorIdx % CAT_COLORS.length],
      budget: parseFloat(budget) || 0,
    });
    setLabel(""); setIcon("🏷️"); setBudget(""); setColorIdx(0); setShow(false);
  };

  if (!show) {
    return (
      <button
        onClick={() => setShow(true)}
        className="w-full rounded-2xl py-3 text-sm font-semibold border-2 border-dashed transition-colors hover:opacity-80 flex items-center justify-center gap-2"
        style={{ borderColor: C.sure, color: C.sure, background: "transparent" }}
      >
        ＋ Create New Category
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl p-5 space-y-4" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm" style={{ color: C.ink }}>Create Category</span>
        <button type="button" onClick={() => setShow(false)} className="text-xs" style={{ color: C.faint }}>✕ Cancel</button>
      </div>

      {/* Icon picker */}
      <div>
        <label className="text-xs font-medium" style={{ color: C.muted }}>Icon</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcon(ic)}
              className="w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all"
              style={{ background: icon === ic ? CAT_COLORS[colorIdx] : C.paper, border: `1.5px solid ${icon === ic ? CAT_COLORS[colorIdx] : C.rule}` }}
            >
              {ic}
            </button>
          ))}
        </div>
      </div>

      {/* Color picker */}
      <div>
        <label className="text-xs font-medium" style={{ color: C.muted }}>Color</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {CAT_COLORS.map((col, i) => (
            <button
              key={col}
              type="button"
              onClick={() => setColorIdx(i)}
              className="w-7 h-7 rounded-full transition-all"
              style={{ background: col, border: `2.5px solid ${colorIdx === i ? C.ink : "transparent"}`, outline: colorIdx === i ? `2px solid ${col}` : "none", outlineOffset: "2px" }}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Category Name *</span>
          <input
            required
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Subscriptions"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1"
            style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Monthly Budget (₹)</span>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: C.faint }}>₹</span>
            <input
              type="number"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-1"
              style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
            />
          </div>
        </label>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: C.paper }}>
        <span className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${CAT_COLORS[colorIdx]}1A` }}>{icon}</span>
        <div>
          <div className="font-semibold text-sm" style={{ color: C.ink }}>{label || "Category Name"}</div>
          <div className="text-xs" style={{ color: C.faint }}>Budget: {budget ? inr(parseFloat(budget)) : "None"}</div>
        </div>
      </div>

      <button type="submit" className="w-full rounded-xl py-2.5 text-sm font-bold text-white" style={{ background: CAT_COLORS[colorIdx] }}>
        Create Category
      </button>
    </form>
  );
}

/* ─── Main SpendingAnalysis Component ───────────────────────────── */
export default function SpendingAnalysisTab({ logs, categories, onEditBudget, onAddCategory, onDeleteCategory }) {
  const C = useContext(ThemeContext);
  const [period, setPeriod] = useState("month"); // "month" | "last_month" | "custom_month" | "3months" | "week"
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return new Date().toISOString().slice(0, 7); // "YYYY-MM"
  });

  // Calculate available months from logs + previous 12 months
  const availableMonths = useMemo(() => {
    const monthSet = new Set();
    const now = new Date();
    // Pre-populate last 12 calendar months
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthSet.add(d.toISOString().slice(0, 7));
    }
    // Add any months present in historical transaction logs
    Object.keys(logs || {}).forEach((d) => {
      if (typeof d === "string" && d.length >= 7) {
        monthSet.add(d.slice(0, 7));
      }
    });
    return Array.from(monthSet)
      .sort()
      .reverse()
      .map((ym) => {
        const [y, m] = ym.split("-").map(Number);
        const d = new Date(y, m - 1, 1);
        return {
          value: ym,
          label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
        };
      });
  }, [logs]);

  const { start, end, label: periodLabel, monthName, monthKey } = useMemo(
    () => getPeriodDates(period, selectedMonth),
    [period, selectedMonth]
  );

  // Month stepping handlers
  const handlePrevMonth = () => {
    const activeKey = monthKey || selectedMonth;
    const [y, m] = activeKey.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevKey = prevDate.toISOString().slice(0, 7);
    setSelectedMonth(prevKey);
    setPeriod("custom_month");
  };

  const handleNextMonth = () => {
    const activeKey = monthKey || selectedMonth;
    const [y, m] = activeKey.split("-").map(Number);
    const nextDate = new Date(y, m, 1);
    const nextKey = nextDate.toISOString().slice(0, 7);
    setSelectedMonth(nextKey);
    setPeriod("custom_month");
  };

  const handleSelectMonth = (ym) => {
    setSelectedMonth(ym);
    const nowKey = new Date().toISOString().slice(0, 7);
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    const lastKey = prev.toISOString().slice(0, 7);

    if (ym === nowKey) {
      setPeriod("month");
    } else if (ym === lastKey) {
      setPeriod("last_month");
    } else {
      setPeriod("custom_month");
    }
  };

  // All debit entries in active period
  const periodEntries = useMemo(() => {
    const all = [];
    Object.keys(logs || {}).forEach((d) => {
      if (d >= start && d <= end) {
        (logs[d]?.entries || []).forEach((e) => {
          if (e.type !== "credit") all.push({ ...e, date: d });
        });
      }
    });
    return all;
  }, [logs, start, end]);

  const totalSpent = useMemo(() => periodEntries.reduce((s, e) => s + e.amount, 0), [periodEntries]);

  // Category sums in selected period
  const catSpend = useMemo(() => {
    const sums = {};
    periodEntries.forEach((e) => {
      sums[e.catId] = (sums[e.catId] || 0) + e.amount;
    });
    return sums;
  }, [periodEntries]);

  // Pie data
  const pieData = useMemo(() =>
    categories
      .filter((c) => catSpend[c.id] > 0)
      .map((c) => ({ name: c.label, value: catSpend[c.id], color: c.color }))
      .sort((a, b) => b.value - a.value),
    [categories, catSpend]
  );

  // Trend data: days for week, weeks (W1-W5) for month/last_month/custom_month, months for 3months
  const trendData = useMemo(() => {
    if (period === "week") {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().slice(0, 10);
        const spent = (logs[ds]?.entries || []).filter((e) => e.type !== "credit").reduce((s, e) => s + e.amount, 0);
        days.push({ label: d.toLocaleDateString("en-IN", { weekday: "short" }), Spent: spent });
      }
      return days;
    }
    if (period === "month" || period === "last_month" || period === "custom_month") {
      const daysInMonth = new Date(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0).getDate();
      const weeks = { "W1 (1-7)": 0, "W2 (8-14)": 0, "W3 (15-21)": 0, "W4 (22-28)": 0 };
      if (daysInMonth > 28) {
        weeks[`W5 (29-${daysInMonth})`] = 0;
      }
      Object.keys(logs || {}).filter((d) => d >= start && d <= end).forEach((d) => {
        const day = new Date(d + "T00:00:00").getDate();
        let wKey = "W1 (1-7)";
        if (day > 28) wKey = `W5 (29-${daysInMonth})`;
        else if (day > 21) wKey = "W4 (22-28)";
        else if (day > 14) wKey = "W3 (15-21)";
        else if (day > 7) wKey = "W2 (8-14)";

        (logs[d]?.entries || []).filter((e) => e.type !== "credit").forEach((e) => {
          weeks[wKey] = (weeks[wKey] || 0) + e.amount;
        });
      });
      return Object.entries(weeks).map(([k, v]) => ({ label: k, Spent: v }));
    }
    // 3 months
    const months = {};
    Object.keys(logs || {}).filter((d) => d >= start && d <= end).forEach((d) => {
      const mLabel = new Date(d + "T00:00:00").toLocaleDateString("en-IN", { month: "short" });
      (logs[d]?.entries || []).filter((e) => e.type !== "credit").forEach((e) => {
        months[mLabel] = (months[mLabel] || 0) + e.amount;
      });
    });
    return Object.entries(months).map(([k, v]) => ({ label: k, Spent: v }));
  }, [logs, period, start, end]);

  const totalBudget = categories.reduce((s, c) => s + (c.budget || 0), 0);
  const isOverBudget = totalBudget > 0 && totalSpent > totalBudget;
  const budgetDiff = totalBudget > 0 ? Math.abs(totalBudget - totalSpent) : 0;
  const currentMonthPickerVal = monthKey || selectedMonth;

  return (
    <div className="space-y-6">
      {/* Interactive Month & Period Control Bar */}
      <div
        className="rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border"
        style={{ background: C.card, borderColor: C.rule }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `${C.model}1A` }}>
            📅
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
              Analyzing Spending For
            </div>
            <div className="text-base sm:text-lg font-bold flex items-center gap-2" style={{ color: C.ink }}>
              <span>{monthName}</span>
              <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: C.paper, color: C.muted, border: `1px solid ${C.rule}` }}>
                {start} to {end}
              </span>
            </div>
          </div>
        </div>

        {/* Month Selector dropdown + Previous/Next controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center rounded-xl border p-1 shadow-sm"
            style={{ borderColor: C.rule, background: C.paper }}
          >
            <button
              type="button"
              onClick={handlePrevMonth}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: C.ink }}
              title="Previous Month"
            >
              ◀
            </button>

            <select
              value={currentMonthPickerVal}
              onChange={(e) => handleSelectMonth(e.target.value)}
              className="bg-transparent text-xs font-bold px-2 py-1 focus:outline-none cursor-pointer"
              style={{ color: C.ink }}
            >
              {availableMonths.map((m) => (
                <option key={m.value} value={m.value} style={{ background: C.card, color: C.ink }}>
                  {m.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleNextMonth}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: C.ink }}
              title="Next Month"
            >
              ▶
            </button>
          </div>

          {/* Quick Filter Pill Buttons */}
          <div className="flex rounded-xl overflow-hidden border shadow-sm" style={{ borderColor: C.rule }}>
            {PERIOD_OPTIONS.map((p) => {
              const isActive = period === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => {
                    setPeriod(p.value);
                    if (p.value === "month") {
                      setSelectedMonth(new Date().toISOString().slice(0, 7));
                    } else if (p.value === "last_month") {
                      const prev = new Date();
                      prev.setMonth(prev.getMonth() - 1);
                      setSelectedMonth(prev.toISOString().slice(0, 7));
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap"
                  style={{
                    background: isActive ? C.ink : "transparent",
                    color: isActive ? C.paper : C.muted,
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Budget overview summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Total Monthly Budget",
            value: totalBudget > 0 ? inr(totalBudget) : "Not set",
            color: C.model,
            icon: "🎯",
          },
          {
            label: `Spent in ${monthName}`,
            value: inr(totalSpent),
            color: isOverBudget ? "#F87171" : C.ink,
            icon: "📊",
          },
          {
            label: isOverBudget ? "Over Budget" : "Remaining Budget",
            value: totalBudget > 0
              ? isOverBudget
                ? `+${inr(budgetDiff)} over`
                : inr(budgetDiff)
              : "—",
            color: isOverBudget ? "#F87171" : C.sure,
            icon: isOverBudget ? "⚠️" : "💚",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
            <div className="text-2xl">{s.icon}</div>
            <div className="text-xs font-medium mt-1 truncate" style={{ color: C.muted }}>{s.label}</div>
            <div className="text-2xl font-bold mt-0.5" style={{ ...NUM, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="font-semibold text-base" style={{ color: C.ink }}>📈 Spending Breakdown</h2>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              Total spent in {monthName}: <span style={{ fontWeight: 700, color: "#F87171", ...NUM }}>{inr(totalSpent)}</span>
            </p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-lg border" style={{ borderColor: C.rule, color: C.muted }}>
            {trendData.length} time intervals tracked
          </span>
        </div>

        {trendData.length > 0 && totalSpent > 0 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
                <CartesianGrid stroke={C.rule} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.faint }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.faint }} axisLine={false} tickLine={false} tickFormatter={inrShort} width={46} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="Spent" radius={[4, 4, 0, 0]}>
                  {trendData.map((_, i) => (
                    <Cell key={i} fill={C.model} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center" style={{ color: C.faint }}>
            <div className="text-center">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm">No spending logged for {monthName}</p>
              <p className="text-xs mt-1" style={{ color: C.muted }}>
                Use the Month Selector above or click "Last Month" to see historical data.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Pie breakdown */}
      {pieData.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
            <h3 className="font-semibold text-sm mb-4" style={{ color: C.ink }}>🍰 Category Split ({monthName})</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                    {pieData.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [inr(v), ""]} contentStyle={{ background: C.ink, border: "none", borderRadius: "10px", color: C.paper, fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
            <h3 className="font-semibold text-sm mb-4" style={{ color: C.ink }}>Top Categories ({monthName})</h3>
            <div className="space-y-3">
              {pieData.slice(0, 6).map((c) => {
                const pct = totalSpent > 0 ? (c.value / totalSpent) * 100 : 0;
                return (
                  <div key={c.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium" style={{ color: C.ink }}>{c.name}</span>
                      <span className="font-semibold" style={{ ...NUM, color: c.color }}>{inr(c.value)} <span style={{ color: C.faint }}>({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: C.rule }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Category Budget Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-base" style={{ color: C.ink }}>💰 Category Budgets</h2>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              Spending tracked against <strong>{monthName}</strong> data
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
          {categories.map((cat) => (
            <div key={cat.id} className="relative group">
              <BudgetCard cat={cat} spent={catSpend[cat.id] || 0} onEditBudget={onEditBudget} C={C} />
              {/* Delete button — visible on hover for all categories */}
              <button
                onClick={() => {
                  if (window.confirm(`Delete "${cat.label}" category? This won't delete past transactions.`)) {
                    onDeleteCategory(cat.id);
                  }
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-150 text-xs w-7 h-7 flex items-center justify-center rounded-lg"
                style={{ color: "#F87171", background: C.paper, border: `1px solid #F8717144` }}
                title={`Delete ${cat.label}`}
              >
                🗑️
              </button>
            </div>
          ))}
        </div>

        {/* Add new category */}
        <AddCategoryForm onAdd={onAddCategory} C={C} />
      </div>
    </div>
  );
}
