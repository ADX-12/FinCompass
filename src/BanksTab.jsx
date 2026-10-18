import React, { useState, useMemo, useContext } from "react";
import { ThemeContext } from "./FinCompassContext";
import CreditCardStatementModal from "./CreditCardStatementModal";

/* ================================================================== *
 * BanksTab — Manage bank accounts, cash in hand, and credit cards
 * ================================================================== */

const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };

const BANK_TYPES = [
  { value: "savings", label: "🏦 Savings Account", icon: "🏦" },
  { value: "current", label: "🏢 Current Account", icon: "🏢" },
  { value: "salary", label: "💼 Salary Account", icon: "💼" },
  { value: "wallet", label: "📱 Digital Wallet (Paytm, GPay…)", icon: "📱" },
  { value: "fd", label: "🔒 Fixed Deposit", icon: "🔒" },
  { value: "other", label: "📁 Other", icon: "📁" },
];

const BANK_COLORS = {
  savings: "#14B8A6",
  current: "#818CF8",
  salary: "#34D399",
  wallet: "#FB923C",
  fd: "#FBBF24",
  other: "#94A3B8",
};

export const CARD_COLORS = [
  { id: "navy", label: "Midnight Indigo", bg: "linear-gradient(135deg, #1E3A8A, #3B82F6)", accent: "#60A5FA" },
  { id: "emerald", label: "Emerald Luxury", bg: "linear-gradient(135deg, #064E3B, #059669)", accent: "#34D399" },
  { id: "slate", label: "Titanium Platinum", bg: "linear-gradient(135deg, #0F172A, #334155)", accent: "#94A3B8" },
  { id: "amber", label: "Gold Signature", bg: "linear-gradient(135deg, #78350F, #D97706)", accent: "#FCD34D" },
  { id: "rose", label: "Crimson Elite", bg: "linear-gradient(135deg, #881337, #E11D48)", accent: "#FDA4AF" },
  { id: "purple", label: "Amethyst Black", bg: "linear-gradient(135deg, #3B0764, #7E22CE)", accent: "#C084FC" },
];

function StatCard({ label, value, sub, color, icon }) {
  const C = useContext(ThemeContext);
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-1 transition-all"
      style={{
        background: `linear-gradient(135deg, ${color}22, ${color}11)`,
        border: `1px solid ${color}44`,
      }}
    >
      <div className="text-2xl">{icon}</div>
      <div className="text-xs font-medium mt-1" style={{ color: C.muted }}>{label}</div>
      <div className="text-2xl font-bold" style={{ ...NUM, color: color }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: C.faint }}>{sub}</div>}
    </div>
  );
}

function BankCard({ bank, onEdit, onDelete, C }) {
  const color = BANK_COLORS[bank.type] || BANK_COLORS.other;
  const typeInfo = BANK_TYPES.find((t) => t.value === bank.type) || BANK_TYPES[BANK_TYPES.length - 1];
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all hover:shadow-lg"
      style={{
        background: C.card,
        border: `1.5px solid ${C.rule}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: `linear-gradient(90deg, ${color}, ${color}88)`,
          borderRadius: "16px 16px 0 0",
        }}
      />

      <div className="flex items-start justify-between gap-2 mt-1">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center w-9 h-9 rounded-xl text-lg"
            style={{ background: `${color}22` }}
          >
            {typeInfo.icon}
          </span>
          <div>
            <div className="font-semibold text-sm" style={{ color: C.ink }}>{bank.name}</div>
            <div className="text-xs" style={{ color: C.muted }}>{typeInfo.label.replace(/^[^ ]+ /, "")}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(bank)}
            className="rounded-lg px-2 py-1 text-xs font-medium border transition-colors hover:opacity-80"
            style={{ borderColor: C.rule, color: C.ink2, background: C.paper }}
            title="Edit Account"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(bank.id)}
            className="rounded-lg px-2 py-1 text-xs font-medium border transition-colors hover:opacity-80"
            style={{ borderColor: C.rule, color: "#F87171", background: C.paper }}
            title="Delete Account"
          >
            🗑️
          </button>
        </div>
      </div>

      <div>
        <div className="text-xs" style={{ color: C.faint }}>Balance</div>
        <div className="text-2xl font-bold mt-0.5" style={{ ...NUM, color }}>
          {inr(bank.balance)}
        </div>
      </div>

      {bank.lastUpdated && (
        <div className="text-xs" style={{ color: C.faint }}>
          Updated {new Date(bank.lastUpdated).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </div>
      )}
    </div>
  );
}

function BankForm({ initial, onSave, onCancel, C }) {
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.type || "savings");
  const [balanceInput, setBalanceInput] = useState(String(initial?.balance ?? ""));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: initial?.id || "bank_" + Date.now(),
      name: name.trim(),
      type,
      balance: Number(balanceInput) || 0,
      lastUpdated: new Date().toISOString(),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl p-5 space-y-4"
      style={{ background: C.paper, border: `1px solid ${C.rule}` }}
    >
      <div className="font-semibold text-sm" style={{ color: C.ink }}>
        {initial ? "Edit Account" : "Add New Account"}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Account Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. HDFC Savings, Paytm Wallet"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: C.rule, color: C.ink, background: C.card, "--tw-ring-color": C.sure }}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Account Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: C.rule, color: C.ink, background: C.card }}
          >
            {BANK_TYPES.map((t) => (
              <option key={t.value} value={t.value} style={{ background: C.card }}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Current Balance (₹)</span>
          <div className="relative mt-1">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold"
              style={{ color: C.faint }}
            >
              ₹
            </span>
            <input
              type="number"
              min="0"
              required
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              placeholder="e.g. 45000"
              className="w-full rounded-xl border pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: C.rule, color: C.ink, background: C.card }}
            />
          </div>
        </label>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2 text-sm font-medium border transition-colors"
          style={{ borderColor: C.rule, color: C.ink2, background: C.card }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: C.sure }}
        >
          {initial ? "Save Changes" : "Add Account"}
        </button>
      </div>
    </form>
  );
}

/* ─── Credit Card Card & Form ─────────────────────────────────────── */
function CreditCardItem({ card, onEdit, onDelete, onGenerateStatement, C }) {
  const totalLimit = Number(card.totalLimit) || 0;
  const currentOutstanding = Number(card.currentOutstanding) || 0;
  // Calculate how much is left in credit card
  const availableLimit = Math.max(0, totalLimit - currentOutstanding);
  const utilizationPct = totalLimit > 0 ? (currentOutstanding / totalLimit) * 100 : 0;

  const theme = CARD_COLORS.find((t) => t.id === card.colorTheme) || CARD_COLORS[0];

  let utilizationColor = "#10B981";
  let utilizationLabel = "Healthy (<30%)";
  if (utilizationPct > 50) {
    utilizationColor = "#EF4444";
    utilizationLabel = "High Usage (>50%)";
  } else if (utilizationPct >= 30) {
    utilizationColor = "#F59E0B";
    utilizationLabel = "Moderate (30-50%)";
  }

  return (
    <div
      className="rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-xl border relative overflow-hidden"
      style={{ background: C.card, borderColor: C.rule }}
    >
      {/* Virtual Card Front Preview */}
      <div
        className="rounded-xl p-4 text-white shadow-md relative overflow-hidden flex flex-col justify-between min-h-[140px]"
        style={{ background: theme.bg }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-widest opacity-75">{card.bank || "CREDIT CARD"}</div>
            <div className="text-base font-extrabold tracking-wide mt-0.5">{card.name}</div>
          </div>
          <div className="flex items-center gap-1">
            {/* Card chip graphic */}
            <div className="w-8 h-6 rounded bg-amber-300/80 border border-amber-500/40 flex items-center justify-center text-[9px] font-mono font-bold text-amber-900">
              SIM
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="font-mono text-sm tracking-wider opacity-90">
            •••• •••• •••• {card.last4 || "8888"}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
            Bill Day: {card.billDay || 15}th
          </span>
        </div>
      </div>

      {/* Credit Limits & Remaining Calculation */}
      <div className="mt-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-xs block" style={{ color: C.faint }}>Left to Spend (Available)</span>
            <span className="text-2xl font-black" style={{ ...NUM, color: "#10B981" }}>
              {inr(availableLimit)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs block" style={{ color: C.faint }}>Outstanding Due</span>
            <span className="text-sm font-bold text-red-500" style={NUM}>
              {inr(currentOutstanding)}
            </span>
          </div>
        </div>

        {/* Progress Bar of Utilization */}
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
            <span style={{ color: C.muted }}>Credit Used: {utilizationPct.toFixed(1)}%</span>
            <span style={{ color: utilizationColor }}>{utilizationLabel}</span>
          </div>
          <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: C.paper }}>
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(3, utilizationPct))}%`,
                background: utilizationColor,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] mt-1" style={{ color: C.faint }}>
            <span>Limit: {inr(totalLimit)}</span>
            <span>Grace: {card.dueDays || 20}d</span>
          </div>
        </div>

        {/* Billing Dates Info */}
        <div
          className="rounded-xl p-2.5 text-xs flex items-center justify-between border"
          style={{ background: C.paper, borderColor: C.rule }}
        >
          <div>
            <span className="block text-[10px]" style={{ color: C.faint }}>Bill Generated:</span>
            <span className="font-semibold" style={{ color: C.ink }}>{card.billDay || 15}th of every month</span>
          </div>
          <div className="text-right">
            <span className="block text-[10px]" style={{ color: C.faint }}>Due Date:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              +{card.dueDays || 20} days after bill
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: C.rule }}>
        <button
          onClick={() => onGenerateStatement(card)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
          style={{ background: "#2563EB" }}
        >
          <span>📄</span>
          <span>Generate Bill</span>
        </button>

        <button
          onClick={() => onEdit(card)}
          className="p-2 rounded-xl text-xs border transition-colors hover:opacity-80"
          style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
          title="Edit Card Details"
        >
          ✏️
        </button>

        <button
          onClick={() => onDelete(card.id)}
          className="p-2 rounded-xl text-xs border transition-colors hover:bg-red-500/10 text-red-500"
          style={{ borderColor: C.rule, background: C.paper }}
          title="Delete Card"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

function CreditCardForm({ initial, onSave, onCancel, C }) {
  const [name, setName] = useState(initial?.name || "");
  const [bank, setBank] = useState(initial?.bank || "");
  const [last4, setLast4] = useState(initial?.last4 || "");
  const [totalLimit, setTotalLimit] = useState(String(initial?.totalLimit ?? "100000"));
  const [currentOutstanding, setCurrentOutstanding] = useState(String(initial?.currentOutstanding ?? "0"));
  const [billDay, setBillDay] = useState(String(initial?.billDay ?? "15"));
  const [dueDays, setDueDays] = useState(String(initial?.dueDays ?? "20"));
  const [interestRatePct, setInterestRatePct] = useState(String(initial?.interestRatePct ?? "42"));
  const [colorTheme, setColorTheme] = useState(initial?.colorTheme || "navy");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: initial?.id || "cc_" + Date.now(),
      name: name.trim(),
      bank: bank.trim() || "Credit Card",
      last4: last4.trim() || "8492",
      totalLimit: Number(totalLimit) || 0,
      currentOutstanding: Number(currentOutstanding) || 0,
      billDay: Math.min(31, Math.max(1, Number(billDay) || 15)),
      dueDays: Number(dueDays) || 20,
      interestRatePct: Number(interestRatePct) || 42,
      colorTheme,
      lastUpdated: new Date().toISOString(),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl p-5 sm:p-6 space-y-4 border"
      style={{ background: C.paper, borderColor: C.rule }}
    >
      <div className="font-bold text-sm" style={{ color: C.ink }}>
        {initial ? "✏️ Edit Credit Card" : "➕ Add Credit Card"}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Card Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. HDFC Regalia Gold, ICICI Amazon Pay"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: C.rule, color: C.ink, background: C.card }}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Issuing Bank</span>
          <input
            type="text"
            required
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            placeholder="e.g. HDFC Bank, SBI Card, Axis Bank"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: C.rule, color: C.ink, background: C.card }}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Last 4 Digits</span>
          <input
            type="text"
            maxLength={4}
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 4589"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-mono focus:outline-none"
            style={{ borderColor: C.rule, color: C.ink, background: C.card }}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Total Credit Limit (₹)</span>
          <input
            type="number"
            min="1000"
            required
            value={totalLimit}
            onChange={(e) => setTotalLimit(e.target.value)}
            placeholder="e.g. 150000"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-bold text-emerald-500 focus:outline-none"
            style={{ borderColor: C.rule, background: C.card }}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Current Balance / Outstanding (₹)</span>
          <input
            type="number"
            min="0"
            required
            value={currentOutstanding}
            onChange={(e) => setCurrentOutstanding(e.target.value)}
            placeholder="e.g. 25000"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-bold text-red-500 focus:outline-none"
            style={{ borderColor: C.rule, background: C.card }}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Bill Generation Day of Month (1 - 31)</span>
          <input
            type="number"
            min="1"
            max="31"
            required
            value={billDay}
            onChange={(e) => setBillDay(e.target.value)}
            placeholder="e.g. 15"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: C.rule, color: C.ink, background: C.card }}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Due Days After Bill Date (Grace Period)</span>
          <input
            type="number"
            min="1"
            max="45"
            required
            value={dueDays}
            onChange={(e) => setDueDays(e.target.value)}
            placeholder="e.g. 20 (typically 18-22 days)"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: C.rule, color: C.ink, background: C.card }}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Annual Interest Rate (% APR)</span>
          <input
            type="number"
            min="0"
            max="60"
            step="0.5"
            value={interestRatePct}
            onChange={(e) => setInterestRatePct(e.target.value)}
            placeholder="e.g. 42"
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: C.rule, color: C.ink, background: C.card }}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: C.muted }}>Card Visual Theme</span>
          <select
            value={colorTheme}
            onChange={(e) => setColorTheme(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: C.rule, color: C.ink, background: C.card }}
          >
            {CARD_COLORS.map((t) => (
              <option key={t.id} value={t.id} style={{ background: C.card }}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t" style={{ borderColor: C.rule }}>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2 text-xs font-semibold border transition-colors"
          style={{ borderColor: C.rule, color: C.ink2, background: C.card }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-xl px-5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 shadow-sm"
          style={{ background: "#2563EB" }}
        >
          {initial ? "Save Changes" : "Confirm Card"}
        </button>
      </div>
    </form>
  );
}

/* ─── Main Export ─────────────────────────────────────────────────── */
export default function BanksTab({
  banks,
  cash,
  setBanks,
  setCash,
  creditCards = [],
  setCreditCards,
  dailyLogs = {},
  userProfile = {},
}) {
  const C = useContext(ThemeContext);
  const [showForm, setShowForm] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState(String(cash ?? 0));

  // Credit Card States
  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [activeStatementCard, setActiveStatementCard] = useState(null);

  const totalBank = useMemo(
    () => (banks || []).reduce((s, b) => s + (b.balance || 0), 0),
    [banks]
  );
  const totalLiquid = totalBank + (cash || 0);

  // Credit Card Aggregates
  const totalCreditLimit = useMemo(
    () => (creditCards || []).reduce((s, c) => s + (Number(c.totalLimit) || 0), 0),
    [creditCards]
  );
  const totalCreditUsed = useMemo(
    () => (creditCards || []).reduce((s, c) => s + (Number(c.currentOutstanding) || 0), 0),
    [creditCards]
  );
  const totalCreditAvailable = Math.max(0, totalCreditLimit - totalCreditUsed);

  const handleSaveBank = (bankData) => {
    if (editingBank) {
      setBanks((prev) => prev.map((b) => (b.id === bankData.id ? bankData : b)));
    } else {
      setBanks((prev) => [...(prev || []), bankData]);
    }
    setShowForm(false);
    setEditingBank(null);
  };

  const handleEditBank = (bank) => {
    setEditingBank(bank);
    setShowForm(true);
  };

  const handleDeleteBank = (id) => {
    setBanks((prev) => (prev || []).filter((b) => b.id !== id));
  };

  const handleSaveCash = () => {
    setCash(Number(cashInput) || 0);
    setEditingCash(false);
  };

  // Credit Card Handlers
  const handleSaveCard = (cardData) => {
    if (setCreditCards) {
      if (editingCard) {
        setCreditCards((prev) => (prev || []).map((c) => (c.id === cardData.id ? cardData : c)));
      } else {
        setCreditCards((prev) => [...(prev || []), cardData]);
      }
    }
    setShowCardForm(false);
    setEditingCard(null);
  };

  const handleEditCard = (card) => {
    setEditingCard(card);
    setShowCardForm(true);
  };

  const handleDeleteCard = (id) => {
    if (setCreditCards) {
      setCreditCards((prev) => (prev || []).filter((c) => c.id !== id));
    }
  };

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Bank Balance"
          value={inr(totalBank)}
          sub={`${(banks || []).length} account${(banks || []).length !== 1 ? "s" : ""}`}
          color="#14B8A6"
          icon="🏦"
        />
        <StatCard
          label="Cash in Hand"
          value={inr(cash || 0)}
          sub="Physical currency"
          color="#FBBF24"
          icon="💵"
        />
        <StatCard
          label="Total Liquid Cash"
          value={inr(totalLiquid)}
          sub="Banks + Cash"
          color="#818CF8"
          icon="💎"
        />
        <StatCard
          label="Available Credit Limit"
          value={inr(totalCreditAvailable)}
          sub={`Used: ${inr(totalCreditUsed)} / Limit: ${inr(totalCreditLimit)}`}
          color="#38BDF8"
          icon="💳"
        />
      </div>

      {/* Cash Card */}
      <div
        className="rounded-2xl p-5 border"
        style={{ background: C.card, borderColor: C.rule }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="flex items-center justify-center w-10 h-10 rounded-xl text-xl"
              style={{ background: "#FBBF2422" }}
            >
              💵
            </span>
            <div>
              <div className="font-semibold text-sm" style={{ color: C.ink }}>Cash in Hand</div>
              <div className="text-xs" style={{ color: C.muted }}>Physical currency / pocket money</div>
            </div>
          </div>
          {editingCash ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold"
                  style={{ color: C.faint }}
                >
                  ₹
                </span>
                <input
                  autoFocus
                  type="number"
                  min="0"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  className="w-36 rounded-xl border pl-7 pr-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
                />
              </div>
              <button
                onClick={handleSaveCash}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-white"
                style={{ background: C.sure }}
              >
                Save
              </button>
              <button
                onClick={() => setEditingCash(false)}
                className="rounded-xl px-3 py-2 text-xs font-medium border"
                style={{ borderColor: C.rule, color: C.ink2, background: C.paper }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-xl font-bold" style={{ ...NUM, color: "#FBBF24" }}>
                {inr(cash || 0)}
              </div>
              <button
                onClick={() => { setEditingCash(true); setCashInput(String(cash ?? 0)); }}
                className="rounded-xl px-3 py-2 text-xs font-medium border transition-colors hover:opacity-80"
                style={{ borderColor: C.rule, color: C.ink2, background: C.paper }}
              >
                ✏️ Edit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* CREDIT CARDS SECTION                                            */}
      {/* ────────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.ink }}>
              💳 Credit Cards & Limits ({(creditCards || []).length})
            </h2>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              Track available limits, bill generation dates, and generate instant credit card statements
            </p>
          </div>
          {!showCardForm && (
            <button
              onClick={() => { setShowCardForm(true); setEditingCard(null); }}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ background: "#2563EB" }}
            >
              + Add Credit Card
            </button>
          )}
        </div>

        {showCardForm && (
          <div className="mb-4">
            <CreditCardForm
              initial={editingCard}
              onSave={handleSaveCard}
              onCancel={() => { setShowCardForm(false); setEditingCard(null); }}
              C={C}
            />
          </div>
        )}

        {(creditCards || []).length === 0 && !showCardForm ? (
          <div
            className="rounded-2xl border-2 border-dashed p-8 text-center"
            style={{ borderColor: C.rule }}
          >
            <div className="text-4xl mb-2">💳</div>
            <p className="font-semibold text-sm" style={{ color: C.ink }}>No credit cards tracked yet</p>
            <p className="mt-1 text-xs" style={{ color: C.muted }}>
              Add your credit cards to track how much limit is left and generate official statements.
            </p>
            <button
              onClick={() => setShowCardForm(true)}
              className="mt-3 px-4 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm"
              style={{ background: "#2563EB" }}
            >
              + Add First Credit Card
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(creditCards || []).map((card) => (
              <CreditCardItem
                key={card.id}
                card={card}
                onEdit={handleEditCard}
                onDelete={handleDeleteCard}
                onGenerateStatement={(c) => setActiveStatementCard(c)}
                C={C}
              />
            ))}
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* BANK ACCOUNTS SECTION                                          */}
      {/* ────────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.ink }}>
              🏦 Bank Accounts ({(banks || []).length})
            </h2>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              Track balances across all your checking and savings accounts
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingBank(null); }}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ background: C.sure }}
            >
              + Add Account
            </button>
          )}
        </div>

        {showForm && (
          <div className="mb-4">
            <BankForm
              initial={editingBank}
              onSave={handleSaveBank}
              onCancel={() => { setShowForm(false); setEditingBank(null); }}
              C={C}
            />
          </div>
        )}

        {(banks || []).length === 0 && !showForm ? (
          <div
            className="rounded-2xl border-2 border-dashed p-10 text-center"
            style={{ borderColor: C.rule }}
          >
            <div className="text-4xl mb-3">🏦</div>
            <p className="font-semibold text-sm" style={{ color: C.ink }}>No bank accounts added yet</p>
            <p className="mt-1 text-xs" style={{ color: C.muted }}>
              Click "Add Account" to start tracking your balances
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(banks || []).map((bank) => (
              <BankCard
                key={bank.id}
                bank={bank}
                onEdit={handleEditBank}
                onDelete={handleDeleteBank}
                C={C}
              />
            ))}
          </div>
        )}
      </div>

      {/* Balance distribution bar */}
      {(banks || []).length > 0 && (
        <div
          className="rounded-2xl p-5 border"
          style={{ background: C.card, borderColor: C.rule }}
        >
          <div className="font-semibold text-sm mb-3" style={{ color: C.ink }}>
            Liquid Wealth Distribution
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full flex" style={{ background: C.rule }}>
            {[...banks, { id: "_cash", name: "Cash", balance: cash || 0, type: "cash_special" }]
              .filter((b) => b.balance > 0)
              .map((b, i) => {
                const color = b.id === "_cash" ? "#FBBF24" : BANK_COLORS[b.type] || BANK_COLORS.other;
                const pct = totalLiquid > 0 ? (b.balance / totalLiquid) * 100 : 0;
                return (
                  <div
                    key={b.id}
                    style={{
                      width: `${pct}%`,
                      background: color,
                      opacity: 1 - i * 0.08,
                      borderRight: `2px solid ${C.card}`,
                    }}
                    title={`${b.name}: ${inr(b.balance)} (${pct.toFixed(1)}%)`}
                  />
                );
              })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {[...banks, { id: "_cash", name: "Cash", balance: cash || 0, type: "cash_special" }]
              .filter((b) => b.balance > 0)
              .map((b) => {
                const color = b.id === "_cash" ? "#FBBF24" : BANK_COLORS[b.type] || BANK_COLORS.other;
                const pct = totalLiquid > 0 ? (b.balance / totalLiquid) * 100 : 0;
                return (
                  <div key={b.id} className="flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
                    <span>{b.name}</span>
                    <span className="font-semibold" style={{ color: C.ink }}>{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Credit Card Statement Generator Modal */}
      {activeStatementCard && (
        <CreditCardStatementModal
          card={activeStatementCard}
          dailyLogs={dailyLogs}
          userProfile={userProfile}
          onClose={() => setActiveStatementCard(null)}
          C={C}
        />
      )}
    </div>
  );
}
