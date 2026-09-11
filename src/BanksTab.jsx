import React, { useState, useMemo, useContext } from "react";
import { ThemeContext } from "./FinCompassContext";

/* ================================================================== *
 * BanksTab — Manage bank accounts and cash in hand
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

function StatCard({ label, value, sub, color, icon }) {
  const C = useContext(ThemeContext);
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-1"
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
      {/* Decorative accent */}
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
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(bank.id)}
            className="rounded-lg px-2 py-1 text-xs font-medium border transition-colors hover:opacity-80"
            style={{ borderColor: C.rule, color: "#F87171", background: C.paper }}
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
  const [balance, setBalance] = useState(initial?.balance ?? 0);
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

export default function BanksTab({ banks, cash, setBanks, setCash }) {
  const C = useContext(ThemeContext);
  const [showForm, setShowForm] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState(String(cash ?? 0));

  const totalBank = useMemo(
    () => (banks || []).reduce((s, b) => s + (b.balance || 0), 0),
    [banks]
  );
  const totalLiquid = totalBank + (cash || 0);

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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
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
          label="Total Liquid"
          value={inr(totalLiquid)}
          sub="Banks + Cash"
          color="#818CF8"
          icon="💎"
        />
      </div>

      {/* Cash Card */}
      <div
        className="rounded-2xl p-5"
        style={{ background: C.card, border: `1.5px solid ${C.rule}` }}
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

      {/* Bank Accounts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: C.ink }}>
              🏦 Bank Accounts ({(banks || []).length})
            </h2>
            <p className="text-sm mt-0.5" style={{ color: C.muted }}>
              Track balances across all your accounts
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingBank(null); }}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
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
          className="rounded-2xl p-5"
          style={{ background: C.card, border: `1.5px solid ${C.rule}` }}
        >
          <div className="font-semibold text-sm mb-3" style={{ color: C.ink }}>
            Balance Distribution
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
    </div>
  );
}
