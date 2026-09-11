import React, { useState, useMemo, useContext } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from "recharts";
import { ThemeContext } from "./FinCompassContext";

/* ================================================================== *
 * Personal Balance Sheet & Monthly Report
 * ================================================================== */

const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };
const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const inrS = (n) => {
  const v = Math.round(n || 0); const a = Math.abs(v);
  if (a >= 10000000) return (v < 0 ? "-" : "") + "₹" + (Math.abs(v) / 10000000).toFixed(2) + "Cr";
  if (a >= 100000) return (v < 0 ? "-" : "") + "₹" + (Math.abs(v) / 100000).toFixed(2) + "L";
  if (a >= 1000) return (v < 0 ? "-" : "") + "₹" + (Math.abs(v) / 1000).toFixed(1) + "k";
  return "₹" + v;
};
const pct = (n, d = 1) => (n || 0).toFixed(d) + "%";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getMonthLabel(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function ChartTip({ active, payload, label }) {
  const C = useContext(ThemeContext);
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-xl min-w-[130px]" style={{ background: C.ink, color: C.paper, ...NUM }}>
      <div className="mb-1 opacity-60">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3 mt-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm inline-block flex-shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold">{inrS(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Section Header ─────────────────────────────────────────────── */
function SectionHeader({ icon, title, subtitle, right, C }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h2 className="text-base font-bold flex items-center gap-2" style={{ color: C.ink }}>
          <span>{icon}</span>{title}
        </h2>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: C.muted }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/* ─── Stat Tile ──────────────────────────────────────────────────── */
function Tile({ label, value, sub, color, icon, C, highlight }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: highlight ? `${color}15` : C.card,
        border: `1.5px solid ${highlight ? color : C.rule}`,
      }}
    >
      <div className="text-xl">{icon}</div>
      <div className="text-xs font-medium mt-2" style={{ color: C.muted }}>{label}</div>
      <div className="text-2xl font-black mt-1" style={{ ...NUM, color: color || C.ink }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: C.faint }}>{sub}</div>}
    </div>
  );
}

/* ─── Balance Sheet Row ──────────────────────────────────────────── */
function BSRow({ label, value, sub, color, C, indent }) {
  return (
    <div
      className="flex items-center justify-between py-2"
      style={{ paddingLeft: indent ? "1.25rem" : 0, borderBottom: `1px solid ${C.rule}` }}
    >
      <div>
        <span className="text-sm font-medium" style={{ color: indent ? C.ink : C.ink, opacity: indent ? 0.8 : 1 }}>{label}</span>
        {sub && <div className="text-xs" style={{ color: C.faint }}>{sub}</div>}
      </div>
      <span className="text-sm font-bold" style={{ ...NUM, color: color || C.ink }}>{inr(value)}</span>
    </div>
  );
}

function BSGroup({ title, total, color, children, C }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between py-2 mb-1">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.muted }}>{title}</span>
        <span className="text-sm font-black" style={{ ...NUM, color }}>{inr(total)}</span>
      </div>
      {children}
    </div>
  );
}

/* ─── Monthly Report Component ───────────────────────────────────── */
function MonthlyReport({ data, profile, dailyLogs, categories, C }) {
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  // Pull this month's transactions from dailyLogs
  const monthEntries = useMemo(() => {
    const all = [];
    Object.keys(dailyLogs).forEach((d) => {
      if (d.startsWith(currentMonthStr)) {
        (dailyLogs[d]?.entries || []).forEach((e) => all.push({ ...e, date: d }));
      }
    });
    return all;
  }, [dailyLogs, currentMonthStr]);

  const trackedCredits = useMemo(() =>
    monthEntries.filter((e) => e.type === "credit").reduce((s, e) => s + e.amount, 0), [monthEntries]);
  const trackedDebits = useMemo(() =>
    monthEntries.filter((e) => e.type !== "credit").reduce((s, e) => s + e.amount, 0), [monthEntries]);

  // Monthly income from profile
  const income = profile.income;
  const living = profile.living;
  const emi = profile.emi;
  const sip = profile.sip;
  const surplus = profile.surplus;

  // Expense breakdown: from cashFlow
  const expenses = data.cashFlow?.expenses || {};
  const expenseItems = [
    { label: "Rent / Housing", value: expenses.rent || 0, color: "#F97316" },
    { label: "Food & Dining", value: expenses.food || 0, color: "#EF4444" },
    { label: "Transport", value: expenses.transport || 0, color: "#3B82F6" },
    { label: "Utilities", value: expenses.utilities || 0, color: "#EAB308" },
    { label: "Entertainment", value: expenses.entertainment || 0, color: "#EC4899" },
    { label: "Insurance Premiums", value: expenses.insurancePremiums || 0, color: "#22C55E" },
    { label: "Subscriptions", value: expenses.subscriptions || 0, color: "#A855F7" },
    { label: "Other", value: expenses.other || 0, color: "#94A3B8" },
  ].filter((e) => e.value > 0);

  // Daily spend trend this month
  const dailyTrend = useMemo(() => {
    const today = new Date();
    const rows = [];
    for (let d = 1; d <= today.getDate(); d++) {
      const ds = `${currentMonthStr}-${String(d).padStart(2, "0")}`;
      const ents = dailyLogs[ds]?.entries || [];
      const debit = ents.filter((e) => e.type !== "credit").reduce((s, e) => s + e.amount, 0);
      const credit = ents.filter((e) => e.type === "credit").reduce((s, e) => s + e.amount, 0);
      rows.push({ day: String(d), Expense: debit, Income: credit });
    }
    return rows;
  }, [dailyLogs, currentMonthStr]);

  // Category spend this month
  const catSpend = useMemo(() => {
    const sums = {};
    monthEntries.filter((e) => e.type !== "credit").forEach((e) => {
      sums[e.catId] = (sums[e.catId] || 0) + e.amount;
    });
    return sums;
  }, [monthEntries]);

  const catData = useMemo(() =>
    categories
      .filter((c) => catSpend[c.id] > 0)
      .map((c) => ({ name: c.label, value: catSpend[c.id], color: c.color, budget: c.budget || 0 }))
      .sort((a, b) => b.value - a.value),
    [categories, catSpend]
  );

  // Income vs Expense bar (profile-based)
  const cashFlowBar = [
    { label: "Income", Income: income, color: "#34D399" },
    { label: "Living", Expenses: living, color: "#F87171" },
    { label: "EMIs", EMIs: emi, color: "#FBBF24" },
    { label: "Investments", Investing: sip, color: "#60A5FA" },
    { label: "Surplus", Surplus: Math.max(0, surplus), color: "#A78BFA" },
  ];

  const savingsRate = income > 0 ? ((income - living - emi) / income) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Top KPI tiles */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Tile label="Monthly Income" value={inrS(income)} icon="💼" color="#34D399" C={C} />
        <Tile label="Living Expenses" value={inrS(living)} icon="🏠" color="#F87171" C={C} />
        <Tile label="EMI Outflow" value={inrS(emi)} icon="🏦" color="#FBBF24" C={C} />
        <Tile
          label="Free Surplus"
          value={inrS(surplus)}
          icon={surplus >= 0 ? "✅" : "🚨"}
          color={surplus >= 0 ? "#34D399" : "#F87171"}
          sub={`${pct(surplus / Math.max(1, income) * 100)} of income`}
          highlight={surplus < 0}
          C={C}
        />
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Tile label="Savings Rate" value={pct(savingsRate)} icon="📈" color={savingsRate >= 30 ? "#34D399" : savingsRate >= 15 ? "#FBBF24" : "#F87171"} C={C} />
        <Tile label="SIP / Investing" value={inrS(sip)} icon="🌱" color="#60A5FA" C={C} />
        <Tile label="Tracked Debits" value={inrS(trackedDebits)} icon="💸" color="#F87171" sub="from daily log" C={C} />
        <Tile label="Tracked Credits" value={inrS(trackedCredits)} icon="💰" color="#34D399" sub="from daily log" C={C} />
      </div>

      {/* Cash flow bar */}
      <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
        <SectionHeader icon="💰" title="Monthly Cash Flow Breakdown" subtitle="Where every rupee of your income goes" C={C} />
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cashFlowBar} margin={{ top: 5, right: 8, left: 0, bottom: 5 }} layout="vertical">
              <CartesianGrid stroke={C.rule} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: C.faint }} axisLine={false} tickLine={false} tickFormatter={inrS} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: C.ink }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="Income" fill="#34D399" radius={[0, 4, 4, 0]} name="Income" />
              <Bar dataKey="Expenses" fill="#F87171" radius={[0, 4, 4, 0]} name="Expenses" />
              <Bar dataKey="EMIs" fill="#FBBF24" radius={[0, 4, 4, 0]} name="EMIs" />
              <Bar dataKey="Investing" fill="#60A5FA" radius={[0, 4, 4, 0]} name="Investing" />
              <Bar dataKey="Surplus" fill="#A78BFA" radius={[0, 4, 4, 0]} name="Surplus" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expense breakdown + pie */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Expense pie */}
        <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
          <SectionHeader icon="🍰" title="Expense Breakdown" subtitle="Monthly living cost split" C={C} />
          {expenseItems.length > 0 ? (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expenseItems} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value">
                      {expenseItems.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [inr(v), ""]} contentStyle={{ background: C.ink, border: "none", borderRadius: "10px", color: C.paper, fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                {expenseItems.map((e) => {
                  const p = living > 0 ? (e.value / living) * 100 : 0;
                  return (
                    <div key={e.label}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: e.color }} />
                          <span style={{ color: C.ink }}>{e.label}</span>
                        </span>
                        <span style={{ ...NUM, color: e.color }}>{inr(e.value)} <span style={{ color: C.faint }}>({p.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: C.rule }}>
                        <div className="h-full rounded-full" style={{ width: `${p}%`, background: e.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="h-44 flex items-center justify-center" style={{ color: C.faint }}>
              <div className="text-center"><div className="text-3xl mb-2">📭</div><p className="text-sm">No expense data. Fill in Your Numbers.</p></div>
            </div>
          )}
        </div>

        {/* Daily spend trend */}
        <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
          <SectionHeader icon="📆" title="Daily Spending This Month" subtitle="From your transaction log" C={C} />
          {dailyTrend.some((d) => d.Expense > 0 || d.Income > 0) ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyTrend} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke={C.rule} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: C.faint }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: C.faint }} axisLine={false} tickLine={false} tickFormatter={inrS} width={40} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="Expense" fill="#F87171" radius={[3, 3, 0, 0]} name="Expense" stackId="a" />
                  <Bar dataKey="Income" fill="#34D399" radius={[3, 3, 0, 0]} name="Income" stackId="b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center" style={{ color: C.faint }}>
              <div className="text-center"><div className="text-3xl mb-2">📭</div><p className="text-sm">No transactions logged yet this month.</p></div>
            </div>
          )}
        </div>
      </div>

      {/* Category vs budget tracker */}
      {catData.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
          <SectionHeader icon="🏷️" title="Category Spending vs Budget" subtitle="This month's tracked expenses by category" C={C} />
          <div className="space-y-3">
            {catData.map((c) => {
              const budgetPct = c.budget > 0 ? Math.min(100, (c.value / c.budget) * 100) : null;
              const isOver = c.budget > 0 && c.value > c.budget;
              return (
                <div key={c.name} className="rounded-xl p-3" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium" style={{ color: C.ink }}>{c.name}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span style={{ ...NUM, color: isOver ? "#F87171" : C.ink, fontWeight: 700 }}>{inr(c.value)}</span>
                      {c.budget > 0 && <span style={{ color: C.faint }}>/ {inr(c.budget)}</span>}
                      {isOver && <span className="px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ background: "#7F1D1D", color: "#F87171" }}>Over!</span>}
                    </div>
                  </div>
                  {budgetPct !== null ? (
                    <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: C.rule }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${budgetPct}%`, background: isOver ? "#F87171" : budgetPct > 80 ? "#FBBF24" : c.color }} />
                    </div>
                  ) : (
                    <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: C.rule }}>
                      <div className="h-full rounded-full" style={{ width: "100%", background: `${c.color}44` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Debt status */}
      {(data.debts || []).filter((d) => d.outstanding > 0).length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
          <SectionHeader icon="🏦" title="Debt Overview" subtitle="Outstanding balances and monthly EMI burden" C={C} />
          <div className="grid gap-3 sm:grid-cols-2">
            {(data.debts || []).filter((d) => d.outstanding > 0).map((debt) => {
              const payoffMonths = debt.emi > 0 ? Math.ceil(debt.outstanding / debt.emi) : 0;
              const progressPct = debt.originalPrincipal > 0 ? Math.min(100, ((debt.originalPrincipal - debt.outstanding) / debt.originalPrincipal) * 100) : 0;
              const isToxic = (debt.annualInterestRatePct || 0) >= 15;
              return (
                <div key={debt.id} className="rounded-xl p-4" style={{ background: C.paper, border: `1.5px solid ${isToxic ? "#F87171" : C.rule}` }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-sm" style={{ color: C.ink }}>{debt.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: isToxic ? "#F87171" : C.faint }}>
                        {debt.annualInterestRatePct}% p.a. {isToxic && "⚠️ High"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-base" style={{ ...NUM, color: "#F87171" }}>{inrS(debt.outstanding)}</div>
                      <div className="text-xs" style={{ color: C.faint }}>EMI {inr(debt.emi)}/mo</div>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full overflow-hidden mb-1" style={{ background: C.rule }}>
                    <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: "#34D399" }} />
                  </div>
                  <div className="flex justify-between text-xs" style={{ color: C.faint }}>
                    <span>{progressPct.toFixed(0)}% repaid</span>
                    {payoffMonths > 0 && <span>~{payoffMonths} months left</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between px-1">
            <span className="text-sm font-semibold" style={{ color: C.ink }}>Total Outstanding</span>
            <span className="text-base font-black" style={{ ...NUM, color: "#F87171" }}>{inr(profile.totalDebt)}</span>
          </div>
          <div className="flex items-center justify-between px-1 mt-1">
            <span className="text-sm" style={{ color: C.muted }}>Monthly EMI Total</span>
            <span className="text-sm font-bold" style={{ ...NUM, color: "#FBBF24" }}>{inr(emi)}/month</span>
          </div>
          <div className="flex items-center justify-between px-1 mt-1">
            <span className="text-sm" style={{ color: C.muted }}>EMI-to-Income Ratio</span>
            <span className="text-sm font-bold" style={{ ...NUM, color: profile.emiToIncomePct > 40 ? "#F87171" : "#34D399" }}>
              {pct(profile.emiToIncomePct)} {profile.emiToIncomePct > 40 ? "⚠️ High" : "✅ OK"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Balance Sheet Component ────────────────────────────────────── */
function BalanceSheetView({ data, profile, C }) {
  const d = data;
  const s = d.savings || {};
  const investments = d.investments || [];
  const debts = d.debts || [];
  const assets = d.assets || [];

  // Assets
  const liquidAssets = [
    { label: "Bank Balance", value: s.bankBalance || 0 },
    { label: "Emergency Fund", value: s.emergencyFund || 0 },
    { label: "Cash in Hand", value: s.cash || 0 },
    { label: "Fixed Deposits", value: s.fixedDeposits || 0 },
    { label: "Recurring Deposits", value: s.recurringDeposits || 0 },
    { label: "Other Liquid", value: s.otherLiquid || 0 },
  ].filter((a) => a.value > 0);

  const totalLiquid = liquidAssets.reduce((s, a) => s + a.value, 0);

  const investAssets = investments.map((inv) => ({
    label: inv.name,
    value: inv.currentValue || 0,
    sub: inv.kind?.replace(/_/g, " "),
  })).filter((a) => a.value > 0);

  const otherAssets = assets.map((a) => ({
    label: a.name,
    value: a.currentValue || 0,
    sub: a.kind,
  })).filter((a) => a.value > 0);

  // Liabilities
  const liabilities = debts.filter((d) => d.outstanding > 0).map((d) => ({
    label: d.name,
    value: d.outstanding || 0,
    sub: `${d.annualInterestRatePct}% p.a. · EMI ${inr(d.emi)}/mo`,
  }));

  const netWorth = profile.netWorth;
  const isPositive = netWorth >= 0;

  // Ratios
  const totalAssets = profile.totalAssets;
  const totalDebt = profile.totalDebt;
  const debtToAssetRatio = totalAssets > 0 ? (totalDebt / totalAssets) * 100 : 0;
  const liquidityRatio = profile.living > 0 ? totalLiquid / profile.living : 0;

  // Waterfall data
  const waterfallData = [
    { name: "Liquid Assets", value: totalLiquid, fill: "#34D399" },
    { name: "Investments", value: profile.totalInvestments, fill: "#60A5FA" },
    { name: "Other Assets", value: otherAssets.reduce((s, a) => s + a.value, 0), fill: "#A78BFA" },
    { name: "Total Debt", value: -totalDebt, fill: "#F87171" },
    { name: "Net Worth", value: netWorth, fill: isPositive ? "#34D399" : "#F87171" },
  ].filter((d) => d.value !== 0);

  return (
    <div className="space-y-6">
      {/* Net worth hero */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: isPositive ? "linear-gradient(135deg, #065F46 0%, #047857 100%)" : "linear-gradient(135deg, #7F1D1D 0%, #991B1B 100%)" }}
      >
        <div className="relative z-10">
          <p className="text-sm font-medium text-white opacity-70">Personal Net Worth</p>
          <p className="text-5xl font-black text-white mt-1" style={NUM}>{inrS(netWorth)}</p>
          <p className="text-sm text-white opacity-60 mt-1">{inr(netWorth)} exactly</p>
          <div className="flex flex-wrap gap-4 mt-4">
            {[
              { label: "Total Assets", value: inrS(totalAssets), icon: "📈" },
              { label: "Total Debt", value: inrS(totalDebt), icon: "📉" },
              { label: "Debt/Asset Ratio", value: pct(debtToAssetRatio), icon: "⚖️" },
            ].map((s) => (
              <div key={s.label} className="text-white">
                <div className="text-xs opacity-60">{s.icon} {s.label}</div>
                <div className="text-base font-bold" style={NUM}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute right-4 top-4 text-6xl opacity-10">{isPositive ? "🏆" : "⚡"}</div>
      </div>

      {/* Ratio KPIs */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Liquidity (months)" value={liquidityRatio.toFixed(1) + "×"}
          icon="💧" color={liquidityRatio >= 6 ? "#34D399" : liquidityRatio >= 3 ? "#FBBF24" : "#F87171"}
          sub="liquid ÷ monthly expenses" C={C} />
        <Tile label="Debt-to-Asset" value={pct(debtToAssetRatio)}
          icon="⚖️" color={debtToAssetRatio <= 30 ? "#34D399" : debtToAssetRatio <= 50 ? "#FBBF24" : "#F87171"}
          sub="lower is better" C={C} />
        <Tile label="Solvency Ratio" value={totalDebt > 0 ? (totalAssets / totalDebt).toFixed(2) + "×" : "∞"}
          icon="🛡️" color="#60A5FA" sub="assets ÷ liabilities (>1 = solvent)" C={C} />
        <Tile label="Investment Ratio" value={pct(totalAssets > 0 ? (profile.totalInvestments / totalAssets) * 100 : 0)}
          icon="🌱" color="#A78BFA" sub="investments as % of total assets" C={C} />
      </div>

      {/* Waterfall chart */}
      <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
        <SectionHeader icon="📊" title="Net Worth Composition" subtitle="How your assets and liabilities add up" C={C} />
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfallData} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.faint }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.faint }} axisLine={false} tickLine={false} tickFormatter={inrS} width={50} />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine y={0} stroke={C.rule} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Amount">
                {waterfallData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Classic T-account balance sheet */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ASSETS */}
        <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base" style={{ color: "#34D399" }}>📈 ASSETS</h3>
            <span className="text-lg font-black" style={{ ...NUM, color: "#34D399" }}>{inrS(totalAssets)}</span>
          </div>

          {totalLiquid > 0 && (
            <BSGroup title="Liquid Assets" total={totalLiquid} color="#34D399" C={C}>
              {liquidAssets.map((a) => <BSRow key={a.label} label={a.label} value={a.value} color="#34D399" indent C={C} />)}
            </BSGroup>
          )}

          {investAssets.length > 0 && (
            <BSGroup title="Investments & Securities" total={profile.totalInvestments} color="#60A5FA" C={C}>
              {investAssets.map((a) => <BSRow key={a.label} label={a.label} value={a.value} sub={a.sub} color="#60A5FA" indent C={C} />)}
            </BSGroup>
          )}

          {otherAssets.length > 0 && (
            <BSGroup title="Other Assets" total={otherAssets.reduce((s, a) => s + a.value, 0)} color="#A78BFA" C={C}>
              {otherAssets.map((a) => <BSRow key={a.label} label={a.label} value={a.value} sub={a.sub} color="#A78BFA" indent C={C} />)}
            </BSGroup>
          )}

          <div className="flex items-center justify-between pt-3 mt-2" style={{ borderTop: `2px solid ${C.sure}` }}>
            <span className="font-black text-sm" style={{ color: C.ink }}>TOTAL ASSETS</span>
            <span className="font-black text-base" style={{ ...NUM, color: "#34D399" }}>{inr(totalAssets)}</span>
          </div>
        </div>

        {/* LIABILITIES + NET WORTH */}
        <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base" style={{ color: "#F87171" }}>📉 LIABILITIES</h3>
            <span className="text-lg font-black" style={{ ...NUM, color: "#F87171" }}>{inrS(totalDebt)}</span>
          </div>

          {liabilities.length > 0 ? (
            <BSGroup title="Outstanding Debts" total={totalDebt} color="#F87171" C={C}>
              {liabilities.map((l) => <BSRow key={l.label} label={l.label} value={l.value} sub={l.sub} color="#F87171" indent C={C} />)}
            </BSGroup>
          ) : (
            <div className="flex items-center justify-center py-8 mb-4 rounded-xl" style={{ background: "#065F4622" }}>
              <div className="text-center">
                <div className="text-3xl">🎉</div>
                <p className="text-sm font-semibold mt-2" style={{ color: "#34D399" }}>Debt Free!</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 pb-2" style={{ borderTop: `1px solid ${C.rule}` }}>
            <span className="text-sm font-semibold" style={{ color: C.ink }}>TOTAL LIABILITIES</span>
            <span className="font-bold text-sm" style={{ ...NUM, color: "#F87171" }}>{inr(totalDebt)}</span>
          </div>

          {/* Net worth section */}
          <div
            className="mt-4 rounded-xl p-4"
            style={{ background: isPositive ? "#065F4622" : "#7F1D1D22", border: `1.5px solid ${isPositive ? "#34D399" : "#F87171"}` }}
          >
            <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.muted }}>Net Worth (Assets − Liabilities)</div>
            <div className="text-3xl font-black" style={{ ...NUM, color: isPositive ? "#34D399" : "#F87171" }}>{inrS(netWorth)}</div>
            <div className="text-xs mt-1" style={{ color: C.faint }}>{inr(netWorth)}</div>
          </div>
        </div>
      </div>

      {/* Goal progress */}
      {(data.goals || []).length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: C.card, border: `1.5px solid ${C.rule}` }}>
          <SectionHeader icon="🎯" title="Financial Goals Progress" subtitle="Where you stand on your targets" C={C} />
          <div className="grid gap-3 sm:grid-cols-2">
            {(data.goals || []).map((g) => {
              const pctDone = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
              const remaining = Math.max(0, g.targetAmount - g.currentAmount);
              const targetDate = g.targetDate ? new Date(g.targetDate) : null;
              const monthsLeft = targetDate ? Math.max(0, Math.round((targetDate - Date.now()) / (1000 * 60 * 60 * 24 * 30))) : null;
              return (
                <div key={g.id} className="rounded-xl p-4" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-sm" style={{ color: C.ink }}>{g.name}</div>
                      {monthsLeft !== null && <div className="text-xs" style={{ color: C.faint }}>{monthsLeft} months left</div>}
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: pctDone >= 100 ? "#065F46" : pctDone >= 50 ? "#78350F" : C.card, color: pctDone >= 100 ? "#34D399" : pctDone >= 50 ? "#FBBF24" : C.faint }}>
                      {pctDone.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full overflow-hidden mb-2" style={{ background: C.rule }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pctDone}%`, background: pctDone >= 100 ? "#34D399" : pctDone >= 50 ? "#FBBF24" : "#60A5FA" }} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ ...NUM, color: C.ink }}>{inrS(g.currentAmount)} saved</span>
                    <span style={{ ...NUM, color: C.faint }}>{inrS(g.targetAmount)} target</span>
                  </div>
                  {remaining > 0 && <div className="text-xs mt-1" style={{ color: "#F87171", ...NUM }}>{inrS(remaining)} more needed</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Export ─────────────────────────────────────────────────── */
const VIEWS = [
  { id: "balance", label: "Balance Sheet" },
  { id: "report", label: "Monthly Report" },
];

export default function BalanceSheetTab({ data, profile, dailyLogs, categories }) {
  const C = useContext(ThemeContext);
  const [view, setView] = useState("balance");
  const monthLabel = getMonthLabel(0);

  return (
    <div className="space-y-5">
      {/* Header + view switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black" style={{ color: C.ink }}>
            📋 Personal Finance Report
          </h1>
          <p className="text-sm mt-0.5" style={{ color: C.muted }}>
            {monthLabel} · {data.personal?.name || "Your"} financial snapshot
          </p>
        </div>
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.rule }}>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className="px-4 py-2 text-sm font-semibold transition-all"
              style={{ background: view === v.id ? C.ink : "transparent", color: view === v.id ? C.paper : C.muted }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "balance" && <BalanceSheetView data={data} profile={profile} C={C} />}
      {view === "report" && <MonthlyReport data={data} profile={profile} dailyLogs={dailyLogs} categories={categories} C={C} />}
    </div>
  );
}
