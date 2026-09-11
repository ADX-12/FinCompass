import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BanksTab from "./BanksTab";
import DailyTrackerTab, { DEFAULT_CATEGORIES } from "./DailyTracker";
import SpendingAnalysisTab from "./SpendingAnalysis";
import BalanceSheetTab from "./BalanceSheet";
import { ThemeContext } from "./FinCompassContext";
import {
  FIREBASE_CONFIGURED,
  loadUserData,
  saveUserData,
  loadBanks,
  saveBanks,
  loadDailyLogs,
  saveDailyLog,
  deleteDailyEntry,
} from "./firebase";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* ==================================================================== *
 * FinCompass — a personal financial decision engine.
 * ==================================================================== */

const LIGHT_THEME = {
  isDark: false,
  paper: "#EEF2F7",
  card: "#FFFFFF",
  ink: "#16202E",
  ink2: "#31435A",
  muted: "#5B6B7F",
  faint: "#8A9AAC",
  rule: "#DCE3EC",
  sure: "#0E7C6B", // guaranteed
  sureBg: "#E3F4F0",
  model: "#4B4FCE", // expected / modelled
  modelBg: "#E9E9FB",
  danger: "#B4231E",
  dangerBg: "#FBE9E8",
  warn: "#A8620A",
  warnBg: "#FBF0E2",
};

const DARK_THEME = {
  isDark: true,
  paper: "#0B1320", // Deep dark background
  card: "#162234",  // Rich slate dark card
  ink: "#F1F5F9",   // Bright crisp heading text
  ink2: "#CBD5E1",  // Secondary text
  muted: "#94A3B8", // Soft muted text
  faint: "#64748B", // Faint label text
  rule: "#26354A",  // Subtle border line
  sure: "#14B8A6",  // Vibrant teal
  sureBg: "#064E3B",// Dark teal background
  model: "#818CF8", // Vibrant indigo
  modelBg: "#312E81",// Dark indigo background
  danger: "#F87171",// Bright red
  dangerBg: "#7F1D1D",// Dark red background
  warn: "#FBBF24",  // Bright amber
  warnBg: "#78350F", // Dark amber background
};

const useTheme = () => React.useContext(ThemeContext);

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };

/* ---------------------------------------------------------------- */
/* Formatting                                                        */
/* ---------------------------------------------------------------- */

const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

const inrShort = (n) => {
  const v = Math.round(n || 0);
  const a = Math.abs(v);
  if (a >= 1e7) return "₹" + (v / 1e7).toFixed(a >= 1e8 ? 1 : 2) + " Cr";
  if (a >= 1e5) return "₹" + (v / 1e5).toFixed(a >= 1e6 ? 1 : 2) + " L";
  if (a >= 1000) return "₹" + Math.round(v / 1000) + "k";
  return "₹" + v;
};

const months = (m) => {
  if (!Number.isFinite(m)) return "never";
  const y = Math.floor(m / 12);
  const r = Math.round(m % 12);
  if (y === 0) return `${r} month${r === 1 ? "" : "s"}`;
  if (r === 0) return `${y} year${y === 1 ? "" : "s"}`;
  return `${y}y ${r}m`;
};

const pct = (n, d = 1) => `${(n || 0).toFixed(d)}%`;
const clamp01 = (n) => Math.min(1, Math.max(0, n));

/* ---------------------------------------------------------------- */
/* Core maths — mirrors packages/engine/src/core                     */
/* ---------------------------------------------------------------- */

const mRate = (annualPct) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;
const loanRate = (annualPct) => annualPct / 100 / 12;

const realReturn = (nominal, inflation) =>
  ((1 + nominal / 100) / (1 + inflation / 100) - 1) * 100;

const fvLump = (p, r, years) => p * Math.pow(1 + r / 100, years);

function fvSip(monthly, annualPct, n) {
  if (n <= 0) return 0;
  const i = mRate(annualPct);
  if (Math.abs(i) < 1e-12) return monthly * n;
  return monthly * ((Math.pow(1 + i, n) - 1) / i);
}

function requiredMonthly(target, current, annualPct, n) {
  if (n <= 0) return Math.max(0, target - current);
  const i = mRate(annualPct);
  const grown = current * Math.pow(1 + i, n);
  const gap = target - grown;
  if (gap <= 0) return 0;
  if (Math.abs(i) < 1e-12) return gap / n;
  return gap / ((Math.pow(1 + i, n) - 1) / i);
}

function projectGrowth({
  initial = 0,
  monthly = 0,
  annualPct = 12,
  years = 20,
  stepUpPct = 0,
  inflationPct = 0,
}) {
  const i = mRate(annualPct);
  let balance = initial;
  let invested = initial;
  let c = monthly;
  const schedule = [];
  for (let y = 1; y <= Math.max(0, Math.round(years)); y++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + i) + c;
      invested += c;
    }
    schedule.push({
      year: y,
      invested: Math.round(invested),
      balance: Math.round(balance),
      growth: Math.round(balance - invested),
      real: Math.round(balance / Math.pow(1 + inflationPct / 100, y)),
    });
    c *= 1 + stepUpPct / 100;
  }
  return {
    totalInvested: Math.round(invested),
    finalCorpus: Math.round(balance),
    returns: Math.round(balance - invested),
    real: Math.round(balance / Math.pow(1 + inflationPct / 100, Math.max(0, years))),
    schedule,
  };
}

function yearsToTarget(target, initial, monthly, annualPct, maxYears = 60) {
  const i = mRate(annualPct);
  let b = initial;
  for (let m = 1; m <= maxYears * 12; m++) {
    b = b * (1 + i) + monthly;
    if (b >= target) return Number((m / 12).toFixed(2));
  }
  return null;
}

function calcEmi(principal, annualPct, n) {
  if (n <= 0) return principal;
  const r = loanRate(annualPct);
  if (r === 0) return principal / n;
  const f = Math.pow(1 + r, n);
  return (principal * r * f) / (f - 1);
}

function monthsToPayoff(balance, annualPct, payment) {
  if (balance <= 0) return 0;
  const r = loanRate(annualPct);
  if (r === 0) return Math.ceil(balance / payment);
  if (payment <= balance * r) return Infinity;
  return Math.ceil(-Math.log(1 - (balance * r) / payment) / Math.log(1 + r));
}

function amortize(balance, annualPct, payment, extra = 0, maxMonths = 600) {
  const r = loanRate(annualPct);
  const pay = payment + extra;
  let bal = balance;
  let interest = 0;
  let n = 0;
  if (balance <= 0) return { months: 0, totalInterest: 0, neverPays: false };
  if (pay <= bal * r) return { months: Infinity, totalInterest: Infinity, neverPays: true };
  while (bal > 0.5 && n < maxMonths) {
    n++;
    const int = bal * r;
    interest += int;
    bal = bal + int - Math.min(pay, bal + int);
  }
  return { months: n, totalInterest: Math.round(interest), neverPays: false };
}

function prepaymentImpact(balance, annualPct, emi, extra, penaltyPct = 0) {
  const base = amortize(balance, annualPct, emi);
  const fast = amortize(balance, annualPct, emi, extra);
  const penalty = Math.round(extra * fast.months * (penaltyPct / 100));
  const saved = Math.round(base.totalInterest - fast.totalInterest);
  return {
    baselineMonths: base.months,
    fastMonths: fast.months,
    monthsSaved: base.months - fast.months,
    interestSaved: saved,
    penalty,
    net: saved - penalty,
  };
}

const effectiveDebtRate = (rate, deductible, taxRate) =>
  deductible ? rate * (1 - taxRate / 100) : rate;

/* Scenario simulator — projects net worth over a horizon with modified
   salary, expenses, extra debt payments and extra investments.          */
function simulate(d, p, levers) {
  const {
    salaryChangePct = 0,
    expenseChangePct = 0,
    extraInvestment = 0,
    extraDebtPayment = 0,
    horizonYears = 10,
  } = levers;

  const months = Math.max(1, Math.round(horizonYears * 12));
  const inflation = d.assumptions?.inflationPct || 6;
  const investReturn = p.expectedReturn || 12;

  // Adjusted monthly figures
  const newIncome = p.income * (1 + salaryChangePct / 100);
  const newLiving = p.living * (1 + expenseChangePct / 100);

  const i = mRate(investReturn);
  const r = loanRate(p.weightedDebtRate || 0);

  let corpus = p.totalInvestments;
  let debtBal = p.totalDebt;
  const baseSip = p.sip + extraInvestment;
  const baseEmi = p.emi + extraDebtPayment;

  for (let m = 0; m < months; m++) {
    // Grow investments
    corpus = corpus * (1 + i) + Math.max(0, baseSip);
    // Pay down debt
    if (debtBal > 0) {
      const interest = debtBal * r;
      const pay = Math.min(baseEmi, debtBal + interest);
      debtBal = Math.max(0, debtBal + interest - pay);
    }
  }

  const liquidGrown = (p.liquidSavings || 0) * Math.pow(1 + (d.assumptions?.savingsAccountReturnPct || 3.5) / 100, horizonYears);
  const netWorth = corpus + liquidGrown - debtBal;
  const netWorthReal = netWorth / Math.pow(1 + inflation / 100, horizonYears);

  return {
    netWorth: Math.round(netWorth),
    netWorthReal: Math.round(netWorthReal),
    debtRemaining: Math.round(debtBal),
    finalCorpus: Math.round(corpus),
    newIncome: Math.round(newIncome),
    newLiving: Math.round(newLiving),
    newSurplus: Math.round(newIncome - newLiving - baseEmi - baseSip),
  };
}

/* ---------------------------------------------------------------- */
/* Domain constants & Kinds                                          */
/* ---------------------------------------------------------------- */

const INCOME_STABILITY = {
  salaried_government: 0.95,
  salaried_private: 0.75,
  contract: 0.55,
  business_owner: 0.5,
  freelancer: 0.45,
};

const RISK_PREMIUM = { conservative: 4, moderate: 2.5, aggressive: 1 };

const EQUITY_WEIGHT = {
  equity_mutual_fund: 1, stocks: 1, etf: 0.9, hybrid_mutual_fund: 0.6,
  crypto: 1, nps: 0.5, epf: 0.15, ppf: 0, debt_mutual_fund: 0, fd: 0,
  gold: 0, digital_gold: 0, real_estate: 0, other: 0.5,
};

const ILLIQUID = ["ppf", "epf", "nps", "real_estate"];
const TOXIC_RATE = 15;
const WEIGHTS = {
  emergencyFund: 20, debt: 20, savingsRate: 15, investmentRate: 15,
  cashFlow: 10, insurance: 5, netWorth: 10, goalProgress: 5,
};
const NW_BENCHMARK = [[22, 0], [25, 0.4], [30, 1.5], [35, 3], [40, 5], [45, 8], [50, 11], [60, 18]];

const DEBT_KINDS = [
  { value: "credit_card", label: "Credit Card" },
  { value: "personal_loan", label: "Personal Loan" },
  { value: "home_loan", label: "Home Loan" },
  { value: "car_loan", label: "Car / Vehicle Loan" },
  { value: "education_loan", label: "Education Loan" },
  { value: "other", label: "Other Debt" },
];

const INVESTMENT_KINDS = [
  { value: "equity_mutual_fund", label: "Equity Mutual Fund" },
  { value: "stocks", label: "Direct Stocks" },
  { value: "etf", label: "ETF" },
  { value: "hybrid_mutual_fund", label: "Hybrid Fund" },
  { value: "epf", label: "EPF" },
  { value: "ppf", label: "PPF" },
  { value: "nps", label: "NPS" },
  { value: "fd", label: "Fixed Deposit (FD)" },
  { value: "gold", label: "Gold / Digital Gold" },
  { value: "real_estate", label: "Real Estate" },
  { value: "crypto", label: "Crypto" },
  { value: "other", label: "Other Asset" },
];

const GOAL_KINDS = [
  { value: "emergency_fund", label: "Emergency Fund" },
  { value: "car", label: "Vehicle / Asset" },
  { value: "house", label: "House Downpayment" },
  { value: "education", label: "Higher Education" },
  { value: "vacation", label: "Travel / Lifestyle" },
  { value: "retirement", label: "Retirement Corpus" },
  { value: "other", label: "Custom Goal" },
];

/* ---------------------------------------------------------------- */
/* Derived profile                                                   */
/* ---------------------------------------------------------------- */

const sumExpenses = (e) =>
  (e?.rent || 0) + (e?.utilities || 0) + (e?.food || 0) + (e?.transport || 0) +
  (e?.insurancePremiums || 0) + (e?.subscriptions || 0) + (e?.entertainment || 0) + (e?.other || 0);

function recommendedEmergencyMonths(d) {
  const stability = INCOME_STABILITY[d.personal?.employmentType] ?? 0.75;
  let m = 6;
  m += (0.75 - stability) * 8;
  m += Math.min(d.personal?.dependents || 0, 4) * 0.75;
  const debts = d.debts || [];
  if (debts.some((x) => x.emi > 0 && x.outstanding > 0)) m += 0.5;
  if ((d.personal?.healthInsuranceCover || 0) <= 0) m += 1;
  return Math.round(Math.min(12, Math.max(3, m)) * 2) / 2;
}

function deriveProfile(d) {
  const income = (d.cashFlow?.monthlySalary || 0) + (d.cashFlow?.otherMonthlyIncome || 0);
  const living = sumExpenses(d.cashFlow?.expenses);
  const debts = d.debts || [];
  const investments = d.investments || [];
  const assets = d.assets || [];

  const emi = debts.reduce((s, x) => s + (x.outstanding > 0 ? (x.emi || 0) : 0), 0);
  const sip = investments.reduce((s, x) => s + (x.monthlyContribution || 0), 0);
  const surplus = income - living - emi - sip;

  const s = d.savings || {};
  const cashLike = (s.bankBalance || 0) + (s.emergencyFund || 0) + (s.fixedDeposits || 0) +
    (s.recurringDeposits || 0) + (s.cash || 0) + (s.otherLiquid || 0);
  const totalInvestments = investments.reduce((a, x) => a + (x.currentValue || 0), 0);
  const totalDebt = debts.reduce((a, x) => a + Math.max(0, x.outstanding || 0), 0);
  const otherAssets = assets.reduce((a, x) => a + (x.currentValue || 0), 0);
  const totalAssets = cashLike + totalInvestments + otherAssets;

  const efMonthsTarget = recommendedEmergencyMonths(d);
  const efCover = (s.emergencyFund || 0) + (s.bankBalance || 0) + (s.cash || 0);
  const efMonths = living > 0 ? efCover / living : 0;
  const efTarget = Math.round(living * efMonthsTarget);

  const saved = income - living - emi;
  const expectedReturn = totalInvestments > 0
    ? investments.reduce((a, x) => a + (x.expectedAnnualReturnPct || 0) * (x.currentValue || 0), 0) / totalInvestments
    : (d.assumptions?.equityReturnPct || 12);
  const weightedDebtRate = totalDebt > 0
    ? debts.reduce((a, x) => a + (x.annualInterestRatePct || 0) * Math.max(0, x.outstanding || 0), 0) / totalDebt
    : 0;
  const equityValue = investments.reduce(
    (a, x) => a + (x.currentValue || 0) * (EQUITY_WEIGHT[x.kind] ?? 0.5), 0);
  const equityShare = totalInvestments > 0 ? equityValue / totalInvestments : 0;

  const riskTol = d.personal?.riskTolerance || "moderate";
  const ltcgRate = d.assumptions?.ltcgRatePct || 12.5;
  const taxDrag = expectedReturn * equityShare * (ltcgRate / 100);
  const hurdle = expectedReturn - taxDrag - (RISK_PREMIUM[riskTol] || 2.5);

  return {
    income, living, emi, sip, surplus,
    expenses: living + emi,
    savingsRatePct: income > 0 ? (saved / income) * 100 : 0,
    investmentRatePct: income > 0 ? (sip / income) * 100 : 0,
    emiToIncomePct: income > 0 ? (emi / income) * 100 : 0,
    debtToIncomePct: income > 0 ? (totalDebt / (income * 12)) * 100 : 0,
    liquidSavings: cashLike,
    efCover, efMonths, efMonthsTarget, efTarget,
    efGap: Math.max(0, efTarget - efCover),
    totalInvestments, totalDebt, totalAssets,
    totalLiabilities: totalDebt,
    netWorth: totalAssets - totalDebt,
    expectedReturn, weightedDebtRate,
    hurdle,
    equitySharePct: equityShare * 100,
  };
}

/* ---------------------------------------------------------------- */
/* Health score                                                      */
/* ---------------------------------------------------------------- */

const statusFor = (r) => (r >= 0.85 ? "strong" : r >= 0.6 ? "fair" : r >= 0.3 ? "weak" : "critical");

function benchmarkMultiple(age) {
  const p = NW_BENCHMARK;
  if (age <= p[0][0]) return p[0][1];
  if (age >= p[p.length - 1][0]) return p[p.length - 1][1];
  for (let i = 1; i < p.length; i++) {
    if (age <= p[i][0]) {
      const [a0, m0] = p[i - 1], [a1, m1] = p[i];
      return m0 + ((age - a0) / (a1 - a0)) * (m1 - m0);
    }
  }
  return 0;
}

function healthScore(d, p) {
  const cs = [];
  const add = (key, label, ratio, detail, improvement) => {
    const max = WEIGHTS[key];
    const score = ratio * max;
    cs.push({
      key, label, ratio, max,
      score: Number(score.toFixed(1)),
      headroom: Number((max - score).toFixed(1)),
      status: statusFor(ratio), detail, improvement,
    });
  };

  add("emergencyFund", "Emergency fund", clamp01(p.efMonths / (p.efMonthsTarget || 6)),
    `${p.efMonths.toFixed(1)} of ${p.efMonthsTarget} months of expenses covered.`,
    p.efGap > 0 ? `Add ${inr(p.efGap)} to reach ${p.efMonthsTarget} months.` : null);

  const debts = d.debts || [];
  const live = debts.filter((x) => x.outstanding > 0);
  const toxic = live.some((x) => x.annualInterestRatePct >= TOXIC_RATE);
  let debtRatio = p.totalDebt === 0 ? 1 : clamp01(
    1 - (clamp01(p.emiToIncomePct / 40) * 0.45 +
         clamp01(p.weightedDebtRate / 18) * 0.35 +
         clamp01(p.debtToIncomePct / 300) * 0.2));
  if (toxic) debtRatio = Math.min(debtRatio, 0.45);
  const priciest = [...live].sort((a, b) => b.annualInterestRatePct - a.annualInterestRatePct)[0];
  add("debt", "Debt management", debtRatio,
    p.totalDebt === 0 ? "No outstanding debt."
      : `${inr(p.totalDebt)} at a blended ${pct(p.weightedDebtRate)}. EMIs take ${pct(p.emiToIncomePct, 0)} of income.`,
    priciest ? `Clear ${priciest.name} at ${priciest.annualInterestRatePct}% first — it is the most expensive money you hold.` : null);

  add("savingsRate", "Savings rate", clamp01(p.savingsRatePct / 30),
    `You keep ${pct(p.savingsRatePct)} of income after expenses and EMIs. Target is 30%.`,
    p.savingsRatePct < 30 ? `Free up ${inr(Math.max(0, 0.3 * p.income - (p.income - p.living - p.emi)))}/month to reach 30%.` : null);

  add("investmentRate", "Investing", clamp01(p.investmentRatePct / 20),
    `${inr(p.sip)}/month invested — ${pct(p.investmentRatePct)} of income.`,
    p.investmentRatePct < 20 ? `Raise monthly investing by ${inr(Math.max(0, 0.2 * p.income - p.sip))}/month.` : null);

  add("cashFlow", "Cash flow", clamp01((p.surplus / Math.max(1, p.income) + 0.05) / 0.25),
    p.surplus >= 0
      ? `${inr(p.surplus)}/month uncommitted after expenses, EMIs and existing investments.`
      : `You are ${inr(Math.abs(p.surplus))}/month short — outflows exceed income.`,
    p.surplus < p.income * 0.2 ? "Cut variable spending or raise income to widen monthly breathing room." : null);

  const annual = p.income * 12;
  const deps = d.personal?.dependents || 0;
  const needsLife = deps > 0;
  const lifeTarget = needsLife ? annual * 10 : 0;
  const healthTarget = d.personal?.cityTier === 1 ? 1000000 : 500000;
  const healthCover = d.personal?.healthInsuranceCover || 0;
  const lifeCover = d.personal?.lifeInsuranceCover || 0;
  const healthRatio = clamp01(healthCover / healthTarget);
  const lifeRatio = needsLife ? clamp01(lifeCover / Math.max(1, lifeTarget)) : 1;
  add("insurance", "Insurance", clamp01(healthRatio * 0.6 + lifeRatio * 0.4),
    healthCover > 0
      ? `Health cover ${inr(healthCover)}${needsLife ? `, life cover ${inr(lifeCover)}` : ""}.`
      : "No health cover recorded. One hospital stay can undo years of saving.",
    healthRatio < 1 ? `Take health cover of at least ${inr(healthTarget)}.`
      : lifeRatio < 1 ? `Increase term life cover toward ${inr(lifeTarget)} (about 10× annual income).` : null);

  const age = d.personal?.age || 28;
  const mult = benchmarkMultiple(age);
  const nwTarget = annual * mult;
  add("netWorth", "Net worth for age", nwTarget <= 0 ? (p.netWorth >= 0 ? 1 : 0) : clamp01(p.netWorth / nwTarget),
    nwTarget > 0
      ? `${inr(p.netWorth)} against a ${inr(nwTarget)} benchmark for age ${age} (${mult.toFixed(1)}× annual income).`
      : `${inr(p.netWorth)} net worth.`,
    p.netWorth < nwTarget ? `Close a ${inr(nwTarget - p.netWorth)} gap through consistent investing and debt reduction.` : null);

  const goals = d.goals || [];
  const gp = goals.length === 0 ? 0.5
    : clamp01(goals.reduce((s, g) => s + clamp01(g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0), 0) / goals.length);
  add("goalProgress", "Goal progress", gp,
    goals.length === 0 ? "No goals set. Money without a destination tends to leak."
      : `${goals.length} goal${goals.length > 1 ? "s" : ""}, ${(gp * 100).toFixed(0)}% funded on average.`,
    goals.length === 0 ? "Add at least one dated, costed goal." : null);

  const total = Math.round(cs.reduce((s, c) => s + c.score, 0));
  const band = total >= 85 ? "excellent" : total >= 70 ? "strong" : total >= 55 ? "stable" : total >= 35 ? "fragile" : "critical";
  const label = {
    excellent: "Excellent — real financial freedom is in sight",
    strong: "Strong — the fundamentals are in place",
    stable: "Stable — solid base, clear gaps to close",
    fragile: "Fragile — one setback would hurt",
    critical: "Critical — fix the basics before anything else",
  }[band];

  return {
    total, band, label, components: cs,
    path: cs.filter((c) => c.headroom >= 0.5 && c.improvement)
      .sort((a, b) => b.headroom - a.headroom).slice(0, 4),
  };
}

/* ---------------------------------------------------------------- */
/* Allocation engine                                                 */
/* ---------------------------------------------------------------- */

function allocate(d, p, amount, mode = "monthly") {
  if (amount <= 0) {
    return {
      amount: 0, mode, buckets: [], unallocated: 0,
      headline: p.surplus < 0
        ? "There is nothing to allocate — your outflows exceed your income."
        : "There is nothing left to allocate this month.",
      constraint: p.surplus < 0 ? "Negative monthly cash flow" : "No surplus",
      notes: ["Every rupee is already committed. The highest-impact move is reducing a fixed cost or raising income."],
    };
  }

  const taxRate = d.assumptions?.marginalTaxRatePct || 20;
  const debts = d.debts || [];
  const live = debts.filter((x) => x.outstanding > 0);
  const survivalTarget = p.living;
  const survivalGap = Math.max(0, survivalTarget - p.efCover);
  const cands = [];

  if (survivalGap > 0) {
    cands.push({
      id: "survival_buffer", label: "Survival buffer", target: "Instant-access savings",
      capacity: survivalGap, weight: 100, rate: d.assumptions?.savingsAccountReturnPct || 3.5,
      certainty: "guaranteed", urgency: "critical", phase: "critical",
      reason: `You hold less than one month of expenses in cash. Fix this before investing further.`,
      impact: () => `Covers ${inr(survivalTarget)} of essential spending for one month`,
    });
  }

  const toxic = live.filter((x) => x.annualInterestRatePct >= TOXIC_RATE);
  toxic.forEach((x) => {
    const rate = effectiveDebtRate(x.annualInterestRatePct, x.taxDeductible, taxRate);
    cands.push({
      id: `toxic_debt_${x.id}`, label: "Clear high-cost debt", target: `${x.name} @ ${x.annualInterestRatePct}%`,
      capacity: mode === "windfall" ? x.outstanding : Math.max(x.emi || 0, x.outstanding / 12),
      weight: 100, rate, certainty: "guaranteed", urgency: "critical", phase: "critical",
      reason: `At ${x.annualInterestRatePct}% this costs more than any investment can reliably earn. Paying it down is a guaranteed ${pct(rate)} return.`,
      impact: (a) => `Saves roughly ${inr((a * rate) / 100)} of interest in the first year`,
    });
  });

  if (p.efGap > 0) {
    const thin = p.efMonths < 3;
    cands.push({
      id: "emergency_fund", label: "Emergency fund", target: "Liquid fund or sweep-in FD",
      capacity: p.efGap, weight: thin ? 3.2 : 1.5, rate: d.assumptions?.savingsAccountReturnPct || 3.5,
      certainty: "guaranteed", urgency: thin ? "high" : "medium", phase: "balanced",
      reason: thin
        ? `You have ${p.efMonths.toFixed(1)} months cover. Below three months, a shock forces selling investments.`
        : `${inr(p.efGap)} separates you from a full ${p.efMonthsTarget}-month cushion.`,
      impact: (a) => `Adds ${(a / Math.max(1, p.living)).toFixed(1)} months of cover`,
    });
  }

  live.filter((x) => x.annualInterestRatePct < TOXIC_RATE).forEach((x) => {
    const eff = effectiveDebtRate(x.annualInterestRatePct, x.taxDeductible, taxRate);
    if (eff > p.hurdle) {
      cands.push({
        id: `loan_${x.id}`, label: "Prepay debt", target: `${x.name} @ ${x.annualInterestRatePct}%`,
        capacity: mode === "windfall" ? x.outstanding : Math.max(1000, x.outstanding / 24),
        weight: 1.2, rate: eff, certainty: "guaranteed", urgency: "medium", phase: "balanced",
        reason: `Guaranteed ${pct(eff)} return beats your risk-adjusted hurdle of ${pct(p.hurdle)}.`,
        impact: (a) => `Saves interest on ${inr(a)} principal`,
      });
    }
  });

  cands.push({
    id: "investing", label: "Invest surplus", target: "Diversified index funds",
    capacity: Infinity, weight: 1.0, rate: p.expectedReturn,
    certainty: "projected", urgency: "low", phase: "balanced",
    reason: `Compounding wealth for long-term goals at an assumed ${pct(p.expectedReturn)}.`,
    impact: (a) => `Projected ${inrShort(fvSip(a, p.expectedReturn, 120))} over 10 years`,
  });

  let remaining = amount;
  const buckets = [];

  const crit = cands.filter((c) => c.phase === "critical");
  for (const c of crit) {
    if (remaining <= 0) break;
    const alloc = Math.min(remaining, c.capacity);
    if (alloc > 0) {
      buckets.push({ ...c, amount: Math.round(alloc), sharePct: (alloc / amount) * 100, impact: c.impact(alloc) });
      remaining -= alloc;
    }
  }

  if (remaining > 0) {
    const bal = cands.filter((c) => c.phase === "balanced");
    const totalW = bal.reduce((s, c) => s + c.weight, 0);
    if (totalW > 0) {
      for (const c of bal) {
        if (remaining <= 0) break;
        const targetShare = (c.weight / totalW) * remaining;
        const alloc = Math.min(targetShare, c.capacity);
        if (alloc > 0) {
          buckets.push({ ...c, amount: Math.round(alloc), sharePct: (alloc / amount) * 100, impact: c.impact(alloc) });
        }
      }
    }
  }

  return {
    amount, mode, buckets, unallocated: Math.max(0, Math.round(remaining)),
    headline: crit.length > 0
      ? `Priority 1: Fix critical gaps (${crit.map((c) => c.label).join(", ")})`
      : `Balanced split across emergency savings, debt reduction, and long-term investing`,
    constraint: crit.length > 0 ? "Critical financial gap" : "Balanced allocation",
    notes: [],
  };
}

const SEVERITY = { critical: 1000, high: 100, medium: 10, low: 1 };

function recommend(d, p, health) {
  const out = [];
  const debts = d.debts || [];
  const live = debts.filter((x) => x.outstanding > 0);
  const taxRate = d.assumptions?.marginalTaxRatePct || 20;
  const surplus = Math.max(0, p.surplus);
  const comp = (k) => health.components.find((c) => c.key === k);

  if (p.surplus < 0) {
    out.push({
      id: "cashflow_negative", title: "Close the monthly gap before anything else",
      priority: "critical", category: "protect", confidence: "high",
      action: `Find ${inr(Math.abs(p.surplus))}/month by cutting variable spending or pausing a SIP.`,
      reason: `Outflows exceed monthly income. Address this immediately to stop debt build-up.`,
      impact: `Stops an annual cash drain of ${inr(Math.abs(p.surplus) * 12)}`,
      impactValue: Math.abs(p.surplus) * 12, monthlyAmount: Math.abs(p.surplus),
      scoreGain: comp("cashFlow")?.headroom ?? 5,
    });
  }

  if (p.efMonths < 1) {
    out.push({
      id: "survival_buffer", title: "Build one month of cash cover immediately",
      priority: "critical", category: "protect", confidence: "high",
      action: `Move ${inr(Math.max(0, p.living - p.efCover))} into an instant-access account.`,
      reason: `Holding under 1 month of cash forces borrowing for routine surprises.`,
      impact: `Avoids emergency borrowing at high interest rates`,
      impactValue: p.living * 0.18 * 12, monthlyAmount: null,
      scoreGain: Math.min(8, comp("emergencyFund")?.headroom ?? 0),
    });
  }

  live.filter((x) => x.annualInterestRatePct >= TOXIC_RATE).forEach((x) => {
    const extra = Math.max(2000, Math.round(surplus * 0.5));
    const im = prepaymentImpact(x.outstanding, x.annualInterestRatePct, x.emi || 0, extra, x.prepaymentPenaltyPct || 0);
    out.push({
      id: `toxic_debt_${x.id}`, title: `Attack ${x.name} at ${x.annualInterestRatePct}%`,
      priority: "critical", category: "reduce_debt", confidence: "high",
      action: `Add ${inr(extra)}/month on top of the ${inr(x.emi || 0)} payment.`,
      reason: `At ${x.annualInterestRatePct}% interest, clearing this is a guaranteed return no market investment guarantees.`,
      impact: `Saves ${inr(im.net)} of interest and clears it ${im.monthsSaved} months sooner`,
      impactValue: im.net, monthlyAmount: extra,
      scoreGain: Math.min(10, comp("debt")?.headroom ?? 0),
    });
  });

  if (p.efGap > 0 && p.efMonths >= 1) {
    const thin = p.efMonths < 3;
    const monthly = Math.max(1000, Math.round(Math.min(surplus * 0.4, p.efGap / 6)));
    out.push({
      id: "emergency_fund", title: `Top up your emergency fund by ${inr(p.efGap)}`,
      priority: thin ? "high" : "medium", category: "protect", confidence: "high",
      action: `Automate ${inr(monthly)}/month into a liquid fund or savings account.`,
      reason: `You have ${p.efMonths.toFixed(1)} months of cover against a ${p.efMonthsTarget}-month target.`,
      impact: `Protects your investments from premature liquidations`,
      impactValue: p.efGap * 0.5, monthlyAmount: monthly,
      scoreGain: comp("emergencyFund")?.headroom ?? 0,
    });
  }

  live.filter((x) => x.annualInterestRatePct < TOXIC_RATE).forEach((x) => {
    const eff = effectiveDebtRate(x.annualInterestRatePct, x.taxDeductible, taxRate);
    const spread = eff - p.hurdle;
    if (spread <= 0) return;
    const extra = Math.max(1000, Math.round(surplus * 0.25));
    const im = prepaymentImpact(x.outstanding, x.annualInterestRatePct, x.emi || 0, extra, x.prepaymentPenaltyPct || 0);
    out.push({
      id: `prepay_${x.id}`, title: `Prepay ${x.name} ahead of extra investing`,
      priority: spread > 3 ? "high" : "medium", category: "reduce_debt", confidence: "high",
      action: `Direct ${inr(extra)}/month extra to this loan.`,
      reason: `Loan costs ${pct(eff)} guaranteed vs risk-adjusted investment hurdle of ${pct(p.hurdle)}.`,
      impact: `Saves ${inr(im.net)} of interest, ${im.monthsSaved} months earlier`,
      impactValue: im.net, monthlyAmount: extra,
      scoreGain: (comp("debt")?.headroom ?? 0) * 0.6,
    });
  });

  if (p.emiToIncomePct > 40) {
    out.push({
      id: "emi_burden", title: "Your EMI load is above 40% threshold",
      priority: "high", category: "reduce_debt", confidence: "medium",
      action: "Refinance or prepay high-rate debts to free monthly cash flow.",
      reason: `EMIs consume ${pct(p.emiToIncomePct, 0)} of income. High fixed liabilities reduce financial agility.`,
      impact: `Frees committed monthly cash flow`,
      impactValue: Math.max(0, p.emi * 12 * 0.1), monthlyAmount: null,
      scoreGain: (comp("debt")?.headroom ?? 0) * 0.4,
    });
  }

  if (p.efMonths >= 3 && surplus > 1000) {
    const bump = Math.round(Math.max(1000, surplus * 0.5) / 500) * 500;
    const age = d.personal?.age || 28;
    const retAge = d.assumptions?.retirementAge || 60;
    const yrs = Math.min(25, Math.max(10, retAge - age));
    const gain = fvSip(bump, p.expectedReturn, yrs * 12);
    out.push({
      id: "increase_sip", title: `Increase monthly investing by ${inr(bump)}`,
      priority: p.investmentRatePct < 15 ? "high" : "medium", category: "grow", confidence: "modelled",
      action: `Raise your SIP from ${inr(p.sip)} to ${inr(p.sip + bump)}/month.`,
      reason: `With emergency fund intact, surplus money can compound towards long-term goals.`,
      impact: `About ${inrShort(gain)} extra over ${yrs} years at ${pct(p.expectedReturn)}`,
      impactValue: gain * 0.25, monthlyAmount: bump,
      scoreGain: comp("investmentRate")?.headroom ?? 0,
    });
  }

  const ins = comp("insurance");
  if (ins && ins.improvement) {
    out.push({
      id: "insurance_gap",
      title: (d.personal?.healthInsuranceCover || 0) <= 0 ? "You have no health cover" : "Close insurance gap",
      priority: (d.personal?.healthInsuranceCover || 0) <= 0 ? "high" : "medium",
      category: "protect", confidence: "high", action: ins.improvement,
      reason: "Uninsured medical shocks deplete liquid savings rapidly.",
      impact: "Shields net worth against unforeseen healthcare costs",
      impactValue: 500000, monthlyAmount: null, scoreGain: ins.headroom,
    });
  }

  return out.sort((a, b) => SEVERITY[b.priority] - SEVERITY[a.priority]);
}

function generateAlerts(d, p) {
  const alerts = [];
  const debts = d.debts || [];
  const toxic = debts.filter((x) => x.outstanding > 0 && x.annualInterestRatePct >= TOXIC_RATE);
  if (toxic.length > 0) {
    alerts.push({
      id: "toxic_debt", severity: "danger",
      title: `High-Cost Debt Alert: ${toxic.map((t) => t.name).join(", ")}`,
      detail: `Interest rates reach ${Math.max(...toxic.map((t) => t.annualInterestRatePct))}% APR. Priority #1 is clearing these.`,
    });
  }
  if (p.surplus < 0) {
    alerts.push({
      id: "negative_surplus", severity: "danger",
      title: "Outflows Exceed Income",
      detail: `You spend ${inr(Math.abs(p.surplus))}/month more than earn. Reduce expenses or pause optional investments.`,
    });
  }
  if (p.efMonths < 1) {
    alerts.push({
      id: "low_ef", severity: "warning",
      title: "Inadequate Emergency Cushion",
      detail: `Cash cover is ${p.efMonths.toFixed(1)} months. Aim for at least 3 to 6 months of living expenses.`,
    });
  }
  if ((d.personal?.healthInsuranceCover || 0) <= 0) {
    alerts.push({
      id: "no_health_insurance", severity: "warning",
      title: "No Health Insurance",
      detail: "Add health insurance to prevent emergency medical expenses from damaging your savings.",
    });
  }
  return alerts;
}

function analysePortfolio(d, p) {
  const total = p.totalInvestments;
  const investments = d.investments || [];
  const share = (fn) => total > 0 ? (investments.filter((x) => fn(x.kind)).reduce((s, x) => s + x.currentValue, 0) / total) * 100 : 0;
  const equityPct = p.equitySharePct;
  const goldPct = share((k) => k === "gold" || k === "digital_gold");
  const illiquidPct = share((k) => ILLIQUID.includes(k));
  const age = d.personal?.age || 28;
  const risk = d.personal?.riskTolerance || "moderate";
  const suggested = Math.max(20, Math.min(90, 100 - age + { conservative: -15, moderate: 0, aggressive: 10 }[risk]));
  const holdings = investments.map((x) => ({
    ...x, sharePct: total > 0 ? (x.currentValue / total) * 100 : 0,
  })).sort((a, b) => b.currentValue - a.currentValue);
  const largest = holdings.length ? holdings[0].sharePct : 0;

  const notes = [];
  if (total === 0) notes.push("No investments recorded yet. Start investing to compound wealth.");
  else {
    const drift = equityPct - suggested;
    if (drift < -12) notes.push(`Equity is ${pct(equityPct, 0)} vs ${suggested}% guide for age ${age}.`);
    else if (drift > 12) notes.push(`Equity is ${pct(equityPct, 0)} vs ${suggested}% guide for age ${age}.`);
    else notes.push(`Equity at ${pct(equityPct, 0)} aligns with your age and risk appetite.`);
    if (largest > 50) notes.push(`${pct(largest, 0)} concentrated in a single asset.`);
    if (illiquidPct > 40) notes.push(`${pct(illiquidPct, 0)} locked in illiquid retirement assets.`);
  }
  return { total, equityPct, goldPct, illiquidPct, debtPct: Math.max(0, 100 - equityPct - goldPct), suggested, holdings, largest, notes };
}

function compareDebtVsInvest({ outstanding, ratePct, emi, extra, returnPct, splitPct }) {
  const horizon = Math.min(120, Math.max(12, monthsToPayoff(outstanding, ratePct, emi + extra) || 60));
  const effRate = ratePct;

  const optRepay = () => {
    const r = loanRate(ratePct), i = mRate(returnPct);
    let bal = outstanding, corpus = 0, totalInt = 0, debtFree = null;
    const timeline = [];
    for (let m = 1; m <= horizon; m++) {
      let pay = emi + extra;
      if (bal > 0) {
        const int = bal * r;
        totalInt += int;
        const p = Math.min(pay, bal + int);
        bal = bal + int - p;
        if (bal <= 0.5 && debtFree === null) debtFree = m;
        const leftover = pay - p;
        corpus = corpus * (1 + i) + leftover;
      } else {
        corpus = corpus * (1 + i) + pay;
      }
      if (m % 12 === 0 || m === horizon) {
        timeline.push({ month: m, year: m / 12, net: Math.round(corpus - Math.max(0, bal)), bal: Math.round(bal), corpus: Math.round(corpus) });
      }
    }
    return { key: "repay", label: "Path A: Prepay debt first", netWorth: Math.round(corpus - Math.max(0, bal)), totalInterest: Math.round(totalInt), debtFreeMonths: debtFree || horizon, corpus: Math.round(corpus), timeline };
  };

  const optInvest = () => {
    const r = loanRate(ratePct), i = mRate(returnPct);
    let bal = outstanding, corpus = 0, totalInt = 0, debtFree = null;
    const timeline = [];
    for (let m = 1; m <= horizon; m++) {
      if (bal > 0) {
        const int = bal * r;
        totalInt += int;
        const p = Math.min(emi, bal + int);
        bal = bal + int - p;
        if (bal <= 0.5 && debtFree === null) debtFree = m;
      }
      corpus = corpus * (1 + i) + extra;
      if (m % 12 === 0 || m === horizon) {
        timeline.push({ month: m, year: m / 12, net: Math.round(corpus - Math.max(0, bal)), bal: Math.round(bal), corpus: Math.round(corpus) });
      }
    }
    return { key: "invest", label: "Path B: Invest spare cash", netWorth: Math.round(corpus - Math.max(0, bal)), totalInterest: Math.round(totalInt), debtFreeMonths: debtFree || horizon, corpus: Math.round(corpus), timeline };
  };

  const optSplit = () => {
    const r = loanRate(ratePct), i = mRate(returnPct);
    const extraDebt = extra * (splitPct / 100);
    const extraInv = extra * (1 - splitPct / 100);
    let bal = outstanding, corpus = 0, totalInt = 0, debtFree = null;
    const timeline = [];
    for (let m = 1; m <= horizon; m++) {
      if (bal > 0) {
        const int = bal * r;
        totalInt += int;
        const pay = emi + extraDebt;
        const p = Math.min(pay, bal + int);
        bal = bal + int - p;
        if (bal <= 0.5 && debtFree === null) debtFree = m;
      }
      corpus = corpus * (1 + i) + extraInv;
      if (m % 12 === 0 || m === horizon) {
        timeline.push({ month: m, year: m / 12, net: Math.round(corpus - Math.max(0, bal)), bal: Math.round(bal), corpus: Math.round(corpus) });
      }
    }
    return { key: "split", label: `Path C: ${splitPct}% debt / ${100 - splitPct}% invest`, netWorth: Math.round(corpus - Math.max(0, bal)), totalInterest: Math.round(totalInt), debtFreeMonths: debtFree || horizon, corpus: Math.round(corpus), timeline };
  };

  const a = optRepay(), b = optInvest(), c = optSplit();
  const opts = [a, b, c];
  const best = [...opts].sort((x, y) => y.netWorth - x.netWorth)[0];

  return {
    horizon, effRate, options: opts, best,
    verdict: best.key === "repay" ? "Prepaying debt builds higher guaranteed net worth."
      : best.key === "invest" ? "Investing yields higher projected net worth."
      : "Split approach balances debt reduction and asset growth.",
    caveat: "Debt interest is contractual. Investment returns carry market risk.",
  };
}

/* ---------------------------------------------------------------- */
/* Templates & Sample Data                                           */
/* ---------------------------------------------------------------- */

const monthsFromNow = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

function buildHistory() {
  const rows = [];
  let nw = 5000;
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    nw += 14000 + Math.round(Math.cos(i) * 2500);
    rows.push({
      month: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("en-IN", { month: "short" }),
      netWorth: nw,
      income: 50000,
      expenses: i === 0 ? 33500 : 29000 + Math.round(Math.sin(i) * 1200),
    });
  }
  return rows;
}

const DEMO = {
  personal: {
    name: "Ananya Rao",
    email: "ananya.rao@example.com",
    city: "Bengaluru",
    cityTier: 1,
    age: 24,
    retirementAge: 60,
    dependents: 0,
    employmentType: "salaried_private",
    housingStatus: "rented",
    expectedAnnualSalaryGrowthPct: 10,
    riskTolerance: "moderate",
    lifeInsuranceCover: 0,
    healthInsuranceCover: 300000,
  },
  cashFlow: {
    monthlySalary: 50000, otherMonthlyIncome: 0,
    expenses: {
      rent: 13000, utilities: 1800, food: 6500, transport: 2500,
      insurancePremiums: 900, subscriptions: 1200, entertainment: 2600, other: 1500,
    },
  },
  savings: {
    bankBalance: 45000, emergencyFund: 60000, fixedDeposits: 40000,
    recurringDeposits: 0, cash: 5000, otherLiquid: 0,
  },
  investments: [
    { id: "i1", name: "Nifty 50 Index Fund", kind: "equity_mutual_fund", currentValue: 62000, monthlyContribution: 5000, expectedAnnualReturnPct: 12, lockInMonths: 0 },
    { id: "i2", name: "EPF", kind: "epf", currentValue: 31000, monthlyContribution: 1800, expectedAnnualReturnPct: 8.25, lockInMonths: 420 },
    { id: "i3", name: "Digital Gold", kind: "digital_gold", currentValue: 7000, monthlyContribution: 0, expectedAnnualReturnPct: 8, lockInMonths: 0 },
  ],
  debts: [
    { id: "d1", name: "Personal Loan", kind: "personal_loan", originalPrincipal: 250000, outstanding: 178000, annualInterestRatePct: 12, emi: 8000, remainingTenureMonths: 25, prepaymentPenaltyPct: 2, taxDeductible: false },
    { id: "d2", name: "HDFC Credit Card", kind: "credit_card", originalPrincipal: 22000, outstanding: 22000, annualInterestRatePct: 42, emi: 2500, remainingTenureMonths: 10, prepaymentPenaltyPct: 0, taxDeductible: false },
  ],
  assets: [],
  goals: [
    { id: "g1", name: "Emergency Fund Goal", kind: "emergency_fund", targetAmount: 180000, currentAmount: 110000, targetDate: monthsFromNow(12), monthlyContribution: 3000, expectedAnnualReturnPct: 6, priority: "must_have" },
    { id: "g2", name: "Bike Upgrade", kind: "car", targetAmount: 180000, currentAmount: 25000, targetDate: monthsFromNow(24), monthlyContribution: 2000, expectedAnnualReturnPct: 7, priority: "nice_to_have" },
    { id: "g3", name: "Higher Studies Fund", kind: "education", targetAmount: 1500000, currentAmount: 40000, targetDate: monthsFromNow(60), monthlyContribution: 4000, expectedAnnualReturnPct: 11, priority: "should_have" },
  ],
  assumptions: {
    inflationPct: 6, equityReturnPct: 12, savingsAccountReturnPct: 3.5,
    marginalTaxRatePct: 20, ltcgRatePct: 12.5, retirementAge: 60, safeWithdrawalRatePct: 3.5,
  },
  history: buildHistory(),
};

const BLANK_TEMPLATE = {
  personal: {
    name: "Apurva Donde",
    email: "apurva@example.com",
    city: "Mumbai",
    cityTier: 1,
    age: 26,
    retirementAge: 60,
    dependents: 0,
    employmentType: "salaried_private",
    housingStatus: "rented",
    expectedAnnualSalaryGrowthPct: 10,
    riskTolerance: "moderate",
    lifeInsuranceCover: 5000000,
    healthInsuranceCover: 1000000,
  },
  cashFlow: {
    monthlySalary: 85000, otherMonthlyIncome: 0,
    expenses: {
      rent: 22000, utilities: 3500, food: 12000, transport: 4000,
      insurancePremiums: 2000, subscriptions: 1500, entertainment: 4000, other: 3000,
    },
  },
  savings: {
    bankBalance: 75000, emergencyFund: 100000, fixedDeposits: 50000,
    recurringDeposits: 0, cash: 10000, otherLiquid: 0,
  },
  investments: [
    { id: "i_1", name: "Nifty 50 Index SIP", kind: "equity_mutual_fund", currentValue: 150000, monthlyContribution: 15000, expectedAnnualReturnPct: 12, lockInMonths: 0 },
  ],
  debts: [
    { id: "d_1", name: "Credit Card Balance", kind: "credit_card", originalPrincipal: 35000, outstanding: 35000, annualInterestRatePct: 38, emi: 3500, remainingTenureMonths: 12, prepaymentPenaltyPct: 0, taxDeductible: false },
  ],
  assets: [],
  goals: [
    { id: "g_1", name: "Emergency Buffer", kind: "emergency_fund", targetAmount: 300000, currentAmount: 175000, targetDate: monthsFromNow(12), monthlyContribution: 10000, expectedAnnualReturnPct: 6, priority: "must_have" },
  ],
  assumptions: {
    inflationPct: 6, equityReturnPct: 12, savingsAccountReturnPct: 3.5,
    marginalTaxRatePct: 20, ltcgRatePct: 12.5, retirementAge: 60, safeWithdrawalRatePct: 3.5,
  },
  history: buildHistory(),
};

/* ================================================================== */
/* UI PRIMITIVES                                                      */
/* ================================================================== */

function Card({ children, className = "", pad = "p-5", style }) {
  const C = useTheme();
  return (
    <div
      className={`rounded-xl ${pad} ${className}`}
      style={{ background: C.card, border: `1px solid ${C.rule}`, ...style }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children, sub, action }) {
  const C = useTheme();
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: C.ink, letterSpacing: "-0.01em" }}>
          {children}
        </h2>
        {sub && <p className="mt-1 text-sm leading-relaxed" style={{ color: C.muted }}>{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

function Certainty({ kind }) {
  const C = useTheme();
  const sure = kind === "guaranteed";
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        background: sure ? C.sureBg : C.modelBg,
        color: sure ? C.sure : C.model,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: sure ? C.sure : C.model }}
      />
      {sure ? "guaranteed" : "projected"}
    </span>
  );
}

function Stat({ label, value, hint, tone }) {
  const C = useTheme();
  return (
    <div>
      <div className="text-xs" style={{ color: C.faint }}>{label}</div>
      <div
        className="mt-0.5 text-xl font-semibold"
        style={{ ...NUM, color: tone || C.ink, letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs leading-snug" style={{ color: C.muted }}>{hint}</div>}
    </div>
  );
}

function Meter({ value, max, color, height = 6, track }) {
  const C = useTheme();
  const meterTrack = track || C.rule;
  const meterColor = color || C.sure;
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height, background: meterTrack }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, (value / (max || 1)) * 100))}%`, background: meterColor }}
      />
    </div>
  );
}

function TextField({ label, value, onChange, placeholder = "", type = "text", hint }) {
  const C = useTheme();
  return (
    <label className="block">
      <span className="text-xs font-medium" style={{ color: C.muted }}>{label}</span>
      <input
        type={type}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-1"
        style={{ borderColor: C.rule, color: C.ink, background: C.card }}
      />
      {hint && <div className="mt-1 text-xs" style={{ color: C.faint }}>{hint}</div>}
    </label>
  );
}

function SelectField({ label, value, onChange, options = [] }) {
  const C = useTheme();
  return (
    <label className="block">
      <span className="text-xs font-medium" style={{ color: C.muted }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-1"
        style={{ borderColor: C.rule, color: C.ink, background: C.card }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: C.card, color: C.ink }}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange, min = 0, max, step = 500, prefix = "₹", hint }) {
  const C = useTheme();
  // Local text state so user can type freely without being snapped by the slider
  const [textVal, setTextVal] = React.useState("");
  const [editing, setEditing] = React.useState(false);

  const displayText = editing ? textVal : (prefix === "₹" ? String(Math.round(value || 0)) : String(value || 0));

  const handleTextChange = (e) => {
    setTextVal(e.target.value);
  };

  const handleTextBlur = () => {
    const parsed = Number(String(textVal).replace(/[^0-9.-]/g, ""));
    if (!isNaN(parsed)) {
      const clamped = max !== undefined ? Math.min(max, Math.max(min, parsed)) : Math.max(min, parsed);
      onChange(clamped);
    }
    setEditing(false);
  };

  const handleTextFocus = () => {
    setTextVal(String(Math.round(value || 0)));
    setEditing(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") e.target.blur();
  };

  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: C.muted }}>{label}</span>
        {/* Editable number text box */}
        <div className="flex items-center gap-1">
          {prefix === "₹" && (
            <span className="text-xs font-medium" style={{ color: C.faint }}>₹</span>
          )}
          <input
            type="text"
            inputMode="numeric"
            value={displayText}
            onChange={handleTextChange}
            onFocus={handleTextFocus}
            onBlur={handleTextBlur}
            onKeyDown={handleKeyDown}
            className="w-24 rounded-md border px-2 py-0.5 text-sm font-semibold text-right focus:outline-none focus:ring-1"
            style={{
              borderColor: C.rule,
              color: C.ink,
              background: C.paper,
              fontVariantNumeric: "tabular-nums",
            }}
          />
          {prefix !== "₹" && (
            <span className="text-xs font-medium" style={{ color: C.faint }}>{prefix}</span>
          )}
        </div>
      </div>
      {/* Slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value || 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full cursor-pointer"
        style={{ accentColor: C.ink }}
      />
      {hint && <div className="text-xs" style={{ color: C.faint }}>{hint}</div>}
    </label>
  );
}

function Toggle({ options, value, onChange }) {
  const C = useTheme();
  return (
    <div className="inline-flex rounded-lg p-0.5" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: active ? C.card : "transparent",
              color: active ? C.ink : C.muted,
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ChartTip({ active, payload, label, formatter }) {
  const C = useTheme();
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: C.ink, color: C.paper, ...NUM }}
    >
      <div style={{ color: C.muted }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="mt-0.5 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto font-medium">{formatter ? formatter(p.value) : inrShort(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/* DECIDE TAB                                                         */
/* ================================================================== */

function AllocationWaterfall({ allocation }) {
  const C = useTheme();
  if (!allocation.buckets.length) return null;
  const palette = (b) => (b.certainty === "guaranteed" ? C.sure : C.model);

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: C.rule }}>
        {allocation.buckets.map((b, i) => (
          <div
            key={b.id + i}
            style={{
              width: `${b.sharePct}%`,
              background: palette(b),
              opacity: 1 - i * 0.13,
              borderRight: i < allocation.buckets.length - 1 ? `2px solid ${C.card}` : "none",
            }}
            title={`${b.target}: ${inr(b.amount)}`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-3">
        {allocation.buckets.map((b, i) => (
          <li key={b.id + i} className="flex gap-3">
            <span
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: palette(b), opacity: 1 - i * 0.13 }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium" style={{ color: C.ink }}>{b.target}</span>
                <Certainty kind={b.certainty} />
                <span className="ml-auto font-semibold" style={{ ...NUM, color: C.ink }}>
                  {inr(b.amount)}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: C.muted }}>{b.reason}</p>
              <p className="mt-1 text-sm" style={{ color: b.certainty === "guaranteed" ? C.sure : C.model }}>
                {b.impact}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DecideTab({ data, profile, health, recs, alerts, allocation }) {
  const C = useTheme();
  const [windfall, setWindfall] = useState(100000);
  const windfallPlan = useMemo(
    () => allocate(data, profile, windfall, "windfall"),
    [data, profile, windfall]
  );
  const top = recs[0];

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-6 sm:p-7 shadow-sm border" style={{ background: C.card, borderColor: C.rule, color: C.ink }}>
        <p className="text-sm" style={{ color: C.muted }}>
          Decision engine status for <strong>{data.personal?.name || "User"}</strong> ({data.personal?.city || "India"})
        </p>
        <p className="mt-1 text-xl font-bold" style={{ color: C.ink }}>
          {allocation.constraint}
        </p>

        {top && (
          <div className="mt-6 border-t pt-5" style={{ borderColor: C.rule }}>
            <div className="flex items-baseline gap-3">
              <span
                className="rounded px-2 py-0.5 text-xs font-semibold"
                style={{ background: top.priority === "critical" ? C.danger : top.priority === "high" ? C.warn : C.ink2, color: "#fff" }}
              >
                Do this first
              </span>
              {top.monthlyAmount && (
                <span className="text-sm" style={{ ...NUM, color: C.muted }}>
                  {inr(top.monthlyAmount)}/month
                </span>
              )}
            </div>
            <h1
              className="mt-3 text-2xl font-semibold sm:text-3xl"
              style={{ letterSpacing: "-0.025em", lineHeight: 1.15, color: C.ink }}
            >
              {top.action}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: C.muted }}>
              {top.reason}
            </p>
            <p className="mt-3 text-sm font-medium" style={{ color: C.sure }}>
              {top.impact}
            </p>
          </div>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {alerts.slice(0, 4).map((a) => {
            const tone =
              a.severity === "danger"
                ? { bg: C.dangerBg, fg: C.danger }
                : a.severity === "warning"
                ? { bg: C.warnBg, fg: C.warn }
                : { bg: C.paper, fg: C.ink2 };
            return (
              <div key={a.id} className="rounded-lg p-3 border" style={{ background: tone.bg, borderColor: C.rule }}>
                <div className="text-sm font-medium" style={{ color: tone.fg }}>{a.title}</div>
                <div className="mt-0.5 text-xs leading-relaxed" style={{ color: C.muted }}>{a.detail}</div>
              </div>
            );
          })}
        </div>
      )}

      <Card>
        <SectionTitle sub={allocation.headline}>
          Your {inr(Math.max(0, profile.surplus))} surplus this month
        </SectionTitle>
        {profile.surplus > 0 ? (
          <AllocationWaterfall allocation={allocation} />
        ) : (
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
            You currently have no uncommitted monthly surplus. Go to "Your numbers & Profile" to update your salary or reduce expenses.
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle sub="Got a bonus, tax refund or inheritance? Enter the amount to get an optimal one-time distribution.">
          Lump sum / Windfall planner
        </SectionTitle>
        <div className="mb-5 max-w-xs">
          <NumberField label="Windfall amount" value={windfall} onChange={setWindfall} min={10000} max={2000000} step={10000} />
        </div>
        <AllocationWaterfall allocation={windfallPlan} />
      </Card>
    </div>
  );
}

/* ================================================================== */
/* OTHER TABS                                                         */
/* ================================================================== */

function PlanTab({ data, profile, allocation, alerts }) {
  const C = useTheme();
  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Summary of monthly inflows and committed outflows based on your entered numbers.">
          Monthly Execution Plan for {data.personal?.name || "User"}
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total Monthly Income" value={inr(profile.income)} tone={C.sure} />
          <Stat label="Living Expenses" value={inr(profile.living)} />
          <Stat label="Total Loan EMIs" value={inr(profile.emi)} tone={profile.emiToIncomePct > 40 ? C.danger : C.ink} hint={`${pct(profile.emiToIncomePct, 0)} of income`} />
          <Stat label="SIPs / Investments" value={inr(profile.sip)} tone={C.model} />
        </div>
      </Card>

      <Card>
        <SectionTitle sub="Recommended action items ordered by priority">
          Action Checklist
        </SectionTitle>
        <ul className="space-y-3">
          {allocation.buckets.map((b, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: C.rule, background: C.paper }}>
              <div>
                <div className="font-medium text-sm" style={{ color: C.ink }}>{b.target}</div>
                <div className="text-xs" style={{ color: C.muted }}>{b.reason}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-sm" style={{ ...NUM, color: C.ink }}>{inr(b.amount)}</div>
                <Certainty kind={b.certainty} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function HealthTab({ health, profile }) {
  const C = useTheme();
  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub={health.label}>
          Overall Financial Health: {health.total}/100
        </SectionTitle>
        <Meter value={health.total} max={100} color={health.total >= 70 ? C.sure : health.total >= 50 ? C.warn : C.danger} height={10} />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {health.components.map((c) => (
            <div key={c.key} className="rounded-lg border p-4" style={{ borderColor: C.rule, background: C.paper }}>
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-sm" style={{ color: C.ink }}>{c.label}</span>
                <span className="text-xs font-bold" style={{ ...NUM, color: c.status === "strong" ? C.sure : c.status === "fair" ? C.model : C.danger }}>
                  {c.score} / {c.max}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: C.muted }}>{c.detail}</p>
              {c.improvement && (
                <p className="mt-1 text-xs font-medium" style={{ color: C.sure }}>
                  💡 {c.improvement}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function NetWorthTab({ data, profile, portfolio }) {
  const C = useTheme();
  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Total Assets minus Total Liabilities based on your entered data">
          Net Worth Breakdown
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Total Assets" value={inrShort(profile.totalAssets)} tone={C.sure} hint={inr(profile.totalAssets)} />
          <Stat label="Total Liabilities / Debt" value={inrShort(profile.totalLiabilities)} tone={C.danger} hint={inr(profile.totalLiabilities)} />
          <Stat label="Net Worth" value={inrShort(profile.netWorth)} tone={profile.netWorth >= 0 ? C.sure : C.danger} hint={inr(profile.netWorth)} />
        </div>
      </Card>

      <Card>
        <SectionTitle sub="Asset Allocation Analysis">Portfolio Mix</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Equity Share" value={pct(portfolio.equityPct)} tone={C.model} hint={`Suggested: ~${portfolio.suggested}% for age ${data.personal?.age}`} />
          <Stat label="Gold / Digital Gold" value={pct(portfolio.goldPct)} />
          <Stat label="Illiquid Assets (EPF/PPF)" value={pct(portfolio.illiquidPct)} />
        </div>
        {portfolio.notes.length > 0 && (
          <div className="mt-4 rounded-lg p-3 text-xs leading-relaxed border" style={{ background: C.paper, borderColor: C.rule, color: C.ink2 }}>
            {portfolio.notes.join(" · ")}
          </div>
        )}
      </Card>
    </div>
  );
}

function GoalsTab({ data, profile }) {
  const C = useTheme();
  const goals = (data.goals || []).map((g) => {
    const monthsLeft = 24;
    const req = requiredMonthly(g.targetAmount, g.currentAmount, g.expectedAnnualReturnPct || 10, monthsLeft);
    return {
      ...g,
      monthsRemaining: monthsLeft,
      requiredMonthly: Math.round(req),
      progressPct: g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0,
    };
  });

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Track your active financial targets">Financial Goals</SectionTitle>
        {goals.length === 0 ? (
          <p className="text-sm" style={{ color: C.muted }}>No goals added yet. Go to "Your numbers & Profile" to add goals.</p>
        ) : (
          <div className="space-y-4">
            {goals.map((g) => (
              <div key={g.id} className="rounded-lg border p-4" style={{ borderColor: C.rule, background: C.paper }}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm" style={{ color: C.ink }}>{g.name}</span>
                  <span className="text-xs font-semibold" style={{ ...NUM, color: C.sure }}>
                    {inr(g.currentAmount)} / {inr(g.targetAmount)}
                  </span>
                </div>
                <div className="mt-2">
                  <Meter value={g.currentAmount} max={g.targetAmount} color={C.sure} height={6} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3" style={{ color: C.muted }}>
                  <div>Contributing: <span className="font-semibold" style={{ color: C.ink }}>{inr(g.monthlyContribution)}/m</span></div>
                  <div>Required Pace: <span className="font-semibold" style={{ color: C.model }}>{inr(g.requiredMonthly)}/m</span></div>
                  <div>Assumed Return: <span className="font-semibold" style={{ color: C.ink }}>{g.expectedAnnualReturnPct}%</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function DebtVsInvestTab({ data, profile }) {
  const C = useTheme();
  const activeDebts = (data.debts || []).filter((x) => x.outstanding > 0);
  const firstDebt = activeDebts[0];

  const [selectedDebtId, setSelectedDebtId] = useState(firstDebt ? firstDebt.id : "");
  const currentDebt = activeDebts.find((x) => x.id === selectedDebtId) || firstDebt;

  const [outstanding, setOutstanding] = useState(currentDebt ? currentDebt.outstanding : 200000);
  const [ratePct, setRatePct] = useState(currentDebt ? currentDebt.annualInterestRatePct : 14);
  const [emi, setEmi] = useState(currentDebt ? currentDebt.emi : 5000);
  const [extra, setExtra] = useState(5000);
  const [returnPct, setReturnPct] = useState(Math.round(profile.expectedReturn || 12));
  const [splitPct, setSplitPct] = useState(60);

  useEffect(() => {
    if (currentDebt) {
      setOutstanding(currentDebt.outstanding);
      setRatePct(currentDebt.annualInterestRatePct);
      setEmi(currentDebt.emi);
    }
  }, [selectedDebtId]);

  const result = useMemo(
    () => compareDebtVsInvest({ outstanding, ratePct, emi, extra, returnPct, splitPct }),
    [outstanding, ratePct, emi, extra, returnPct, splitPct]
  );

  const merged = result.options[0].timeline.map((row, i) => ({
    year: row.year,
    Repay: row.net,
    Invest: result.options[1].timeline[i]?.net ?? 0,
    Split: result.options[2].timeline[i]?.net ?? 0,
  }));

  const OPT_COLOR = { repay: C.sure, invest: C.model, split: C.warn };

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Compare paying down debt vs investing extra money in market funds.">
          Debt Prepayment vs. Market Investment Simulator
        </SectionTitle>

        {activeDebts.length > 0 && (
          <div className="mb-4">
            <SelectField
              label="Select Debt to Analyze"
              value={selectedDebtId}
              onChange={setSelectedDebtId}
              options={activeDebts.map((d) => ({
                value: d.id,
                label: `${d.name} — ${inr(d.outstanding)} @ ${d.annualInterestRatePct}% APR`,
              }))}
            />
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Outstanding balance" value={outstanding} onChange={setOutstanding} min={10000} max={5000000} step={10000} />
          <NumberField label="Interest rate" value={ratePct} onChange={setRatePct} min={1} max={48} step={0.5} prefix="%" />
          <NumberField label="Current EMI / Payment" value={emi} onChange={setEmi} min={500} max={200000} step={500} />
          <NumberField label="Extra cash available" value={extra} onChange={setExtra} min={1000} max={200000} step={1000} />
          <NumberField label="Assumed market return" value={returnPct} onChange={setReturnPct} min={1} max={25} step={0.5} prefix="%" />
          <NumberField label="Split: % to loan" value={splitPct} onChange={setSplitPct} min={0} max={100} step={5} prefix="%" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {result.options.map((o) => {
          const winner = o.key === result.best.key;
          return (
            <Card
              key={o.key}
              style={winner ? { borderColor: OPT_COLOR[o.key], borderWidth: 2 } : undefined}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold" style={{ color: C.ink }}>{o.label}</h3>
                {winner && <span className="text-xs font-bold" style={{ color: OPT_COLOR[o.key] }}>RECOMMENDED</span>}
              </div>
              <div className="mt-4 space-y-3">
                <Stat label={`Net worth after ${months(result.horizon)}`} value={inrShort(o.netWorth)} tone={OPT_COLOR[o.key]} />
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Debt-free in" value={months(o.debtFreeMonths)} />
                  <Stat label="Interest paid" value={inrShort(o.totalInterest)} tone={C.danger} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <SectionTitle sub="Net worth trajectory over time">
          Path Comparison Chart
        </SectionTitle>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v)}y`} />
              <YAxis tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} tickFormatter={inrShort} width={54} />
              <Tooltip content={<ChartTip />} labelFormatter={(v) => `Year ${Number(v).toFixed(1)}`} />
              <ReferenceLine y={0} stroke={C.faint} />
              <Line type="monotone" dataKey="Repay" stroke={C.sure} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Invest" stroke={C.model} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Split" stroke={C.warn} strokeWidth={2} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function GrowTab({ data, profile }) {
  const C = useTheme();
  const [initial, setInitial] = useState(profile.totalInvestments);
  const [monthly, setMonthly] = useState(Math.max(1000, profile.sip));
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(20);
  const [stepUp, setStepUp] = useState(0);
  const inflation = data.assumptions?.inflationPct || 6;

  const proj = useMemo(
    () => projectGrowth({ initial, monthly, annualPct: rate, years, stepUpPct: stepUp, inflationPct: inflation }),
    [initial, monthly, rate, years, stepUp, inflation]
  );

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Compounding projection with inflation adjustment">
          Wealth Growth Calculator
        </SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Starting amount" value={initial} onChange={setInitial} min={0} max={10000000} step={10000} />
          <NumberField label="Monthly investment" value={monthly} onChange={setMonthly} min={500} max={500000} step={500} />
          <NumberField label="Assumed return" value={rate} onChange={setRate} min={1} max={25} step={0.5} prefix="%" />
          <NumberField label="Years" value={years} onChange={setYears} min={1} max={40} step={1} prefix=" years" />
          <NumberField label="Annual SIP step-up" value={stepUp} onChange={setStepUp} min={0} max={25} step={1} prefix="%" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Total Invested" value={inrShort(proj.totalInvested)} hint={inr(proj.totalInvested)} />
          <Stat label="Growth Earned" value={inrShort(proj.returns)} tone={C.model} />
          <Stat label="Final Corpus" value={inrShort(proj.finalCorpus)} tone={C.model} hint={inr(proj.finalCorpus)} />
          <Stat label="Real Value (Inflation Adj)" value={inrShort(proj.real)} tone={C.sure} hint={`in today's money`} />
        </div>
      </Card>
    </div>
  );
}

function SimulateTab({ data, profile }) {
  const C = useTheme();
  const [levers, setLevers] = useState({
    salaryChangePct: 0,
    expenseChangePct: 0,
    extraInvestment: 0,
    extraDebtPayment: 0,
    horizonYears: 10,
  });

  const set = (key) => (v) => setLevers((prev) => ({ ...prev, [key]: v }));

  const sim = useMemo(() => simulate(data, profile, levers), [data, profile, levers]);

  // Build year-by-year chart data: baseline vs scenario
  const chartData = useMemo(() => {
    const rows = [];
    const inflation = data.assumptions?.inflationPct || 6;
    const investReturn = profile.expectedReturn || 12;
    const i = mRate(investReturn);
    const r = loanRate(profile.weightedDebtRate || 0);
    const savRate = (data.assumptions?.savingsAccountReturnPct || 3.5) / 100;

    // Baseline (no change)
    let baseCorpus = profile.totalInvestments;
    let baseDebt = profile.totalDebt;
    let baseCorpusS = profile.totalInvestments;
    let baseDebtS = profile.totalDebt;
    const baseEmi = profile.emi;
    const simEmi = profile.emi + levers.extraDebtPayment;
    const baseSip = profile.sip;
    const simSip = profile.sip + levers.extraInvestment;

    for (let yr = 1; yr <= levers.horizonYears; yr++) {
      // Baseline: 12 months
      for (let m = 0; m < 12; m++) {
        baseCorpus = baseCorpus * (1 + i) + baseSip;
        if (baseDebt > 0) {
          const int = baseDebt * r;
          baseDebt = Math.max(0, baseDebt + int - Math.min(baseEmi, baseDebt + int));
        }
      }
      // Scenario: 12 months
      for (let m = 0; m < 12; m++) {
        baseCorpusS = baseCorpusS * (1 + i) + simSip;
        if (baseDebtS > 0) {
          const int = baseDebtS * r;
          baseDebtS = Math.max(0, baseDebtS + int - Math.min(simEmi, baseDebtS + int));
        }
      }
      const liq = (profile.liquidSavings || 0) * Math.pow(1 + savRate, yr);
      const baseNW = baseCorpus + liq - baseDebt;
      const scenNW = baseCorpusS + liq - baseDebtS;
      rows.push({
        year: `Yr ${yr}`,
        Baseline: Math.round(baseNW),
        Scenario: Math.round(scenNW),
        diff: Math.round(scenNW - baseNW),
      });
    }
    return rows;
  }, [data, profile, levers]);

  const lastRow = chartData[chartData.length - 1] || { Baseline: 0, Scenario: 0, diff: 0 };
  const isPositive = lastRow.diff >= 0;

  return (
    <div className="space-y-6">
      {/* Levers card */}
      <Card>
        <SectionTitle sub="Adjust levers to see how each decision changes your projected net worth">
          🎛️ Scenario Simulator — What If?
        </SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Salary change" value={levers.salaryChangePct} onChange={set("salaryChangePct")} min={-50} max={100} step={5} prefix="%" />
          <NumberField label="Expense change" value={levers.expenseChangePct} onChange={set("expenseChangePct")} min={-50} max={100} step={5} prefix="%" />
          <NumberField label="Extra monthly debt payment" value={levers.extraDebtPayment} onChange={set("extraDebtPayment")} min={0} max={100000} step={1000} />
          <NumberField label="Extra monthly investment" value={levers.extraInvestment} onChange={set("extraInvestment")} min={0} max={100000} step={1000} />
          <NumberField label="Time horizon" value={levers.horizonYears} onChange={set("horizonYears")} min={1} max={30} step={1} prefix=" years" />
        </div>
      </Card>

      {/* Comparison cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl p-4 border" style={{ background: C.card, borderColor: C.rule }}>
          <div className="text-xs font-medium" style={{ color: C.muted }}>Baseline Net Worth</div>
          <div className="text-xl font-bold mt-1" style={{ ...NUM, color: C.ink }}>{inrShort(lastRow.Baseline)}</div>
          <div className="text-xs mt-0.5" style={{ color: C.faint }}>without any changes</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: isPositive ? C.sureBg : C.dangerBg, borderColor: isPositive ? C.sure : C.danger }}>
          <div className="text-xs font-medium" style={{ color: C.muted }}>Scenario Net Worth</div>
          <div className="text-xl font-bold mt-1" style={{ ...NUM, color: isPositive ? C.sure : C.danger }}>{inrShort(lastRow.Scenario)}</div>
          <div className="text-xs mt-0.5 font-semibold" style={{ color: isPositive ? C.sure : C.danger }}>
            {isPositive ? "+" : ""}{inrShort(lastRow.diff)} vs baseline
          </div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: C.card, borderColor: C.rule }}>
          <div className="text-xs font-medium" style={{ color: C.muted }}>Real Value (Inflation Adj)</div>
          <div className="text-xl font-bold mt-1" style={{ ...NUM, color: C.model }}>{inrShort(sim.netWorthReal)}</div>
          <div className="text-xs mt-0.5" style={{ color: C.faint }}>in today's purchasing power</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: C.card, borderColor: C.rule }}>
          <div className="text-xs font-medium" style={{ color: C.muted }}>Debt Remaining</div>
          <div className="text-xl font-bold mt-1" style={{ ...NUM, color: sim.debtRemaining > 0 ? C.danger : C.sure }}>
            {sim.debtRemaining > 0 ? inrShort(sim.debtRemaining) : "Debt Free! 🎉"}
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.faint }}>after {levers.horizonYears} years</div>
        </div>
      </div>

      {/* Monthly cash flow comparison */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "New Monthly Income", value: inr(sim.newIncome), hint: `was ${inr(profile.income)}`, tone: C.sure },
          { label: "New Monthly Expenses", value: inr(sim.newLiving), hint: `was ${inr(profile.living)}`, tone: C.ink },
          { label: "New Monthly Surplus", value: inr(sim.newSurplus), hint: `was ${inr(profile.surplus)}`, tone: sim.newSurplus >= 0 ? C.model : C.danger },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4 border" style={{ background: C.card, borderColor: C.rule }}>
            <div className="text-xs font-medium" style={{ color: C.muted }}>{s.label}</div>
            <div className="text-xl font-bold mt-1" style={{ ...NUM, color: s.tone }}>{s.value}</div>
            <div className="text-xs mt-0.5" style={{ color: C.faint }}>{s.hint}</div>
          </div>
        ))}
      </div>

      {/* Net worth trajectory chart */}
      <Card>
        <SectionTitle sub={`Baseline vs your scenario over ${levers.horizonYears} years`}>
          📈 Net Worth Trajectory
        </SectionTitle>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} tickFormatter={inrShort} width={56} />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine y={0} stroke={C.faint} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="Baseline" stroke={C.faint} strokeWidth={2} strokeDasharray="5 3" dot={false} name="Baseline" />
              <Line type="monotone" dataKey="Scenario" stroke={isPositive ? C.sure : C.danger} strokeWidth={2.5} dot={false} name="Scenario" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex gap-4 text-xs" style={{ color: C.muted }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5" style={{ background: C.faint, borderTop: `2px dashed ${C.faint}` }} />
            Baseline (no changes)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5" style={{ background: isPositive ? C.sure : C.danger }} />
            Your scenario
          </span>
        </div>
      </Card>
    </div>
  );
}


function AffordTab({ data, profile }) {
  const C = useTheme();
  const [itemName, setItemName] = useState("New iPhone / Gadget");
  const [price, setPrice] = useState(80000);
  const [method, setMethod] = useState("cash");
  const [downPayment, setDownPayment] = useState(10000);
  const [emiMonths, setEmiMonths] = useState(12);

  const financed = Math.max(0, price - downPayment);
  const emiRatePct = 16;
  const emi = method === "emi" && emiMonths > 0 ? calcEmi(financed, emiRatePct, emiMonths) : null;
  const cashOut = method === "cash" ? price : downPayment;
  const efAfter = Math.max(0, profile.efCover - cashOut);
  const coverAfter = profile.living > 0 ? efAfter / profile.living : 0;
  const emiRatio = profile.income > 0 ? ((profile.emi + (emi || 0)) / profile.income) * 100 : 0;

  const score = (cashOut <= profile.liquidSavings ? 40 : 0) + (coverAfter >= 3 ? 30 : 0) + (emiRatio <= 35 ? 30 : 0);
  const verdict = score >= 80 ? "affordable" : score >= 50 ? "stretch" : "avoid";

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Test if a purchase fits your budget without damaging your emergency buffer">
          Can I Afford This Purchase?
        </SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="Item name" value={itemName} onChange={setItemName} />
          <NumberField label="Price tag" value={price} onChange={setPrice} min={1000} max={2000000} step={1000} />
          <div>
            <div className="mb-1.5 text-xs font-medium" style={{ color: C.muted }}>Payment Method</div>
            <Toggle
              value={method}
              onChange={setMethod}
              options={[
                { value: "cash", label: "Full Cash" },
                { value: "emi", label: "EMI Financing" },
              ]}
            />
          </div>
          {method === "emi" && (
            <>
              <NumberField label="Down payment" value={downPayment} onChange={setDownPayment} min={0} max={price} step={1000} />
              <NumberField label="EMI tenure" value={emiMonths} onChange={setEmiMonths} min={3} max={36} step={3} prefix=" months" />
            </>
          )}
        </div>

        <div className="mt-6 rounded-lg p-4 border" style={{ background: verdict === "affordable" ? C.sureBg : verdict === "stretch" ? C.warnBg : C.dangerBg, borderColor: C.rule }}>
          <div className="font-semibold text-base" style={{ color: verdict === "affordable" ? C.sure : verdict === "stretch" ? C.warn : C.danger }}>
            {verdict === "affordable" ? `Yes — ${itemName} fits comfortably!`
              : verdict === "stretch" ? `Stretch purchase — proceed with caution.`
              : `Avoid — ${itemName} compromises your emergency fund or cash flow.`}
          </div>
          {emi && <div className="mt-1 text-sm font-medium" style={{ color: C.ink }}>Monthly EMI: {inr(Math.round(emi))} for {emiMonths} months</div>}
          <div className="mt-2 text-xs" style={{ color: C.ink2 }}>
            Post-purchase Emergency Cover: <strong>{coverAfter.toFixed(1)} months</strong> (Target: {profile.efMonthsTarget}m)
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* INPUTS PANEL — USER PROFILE & DYNAMIC NUMBERS (CRUD)              */
/* ================================================================== */

function InputsPanel({ data, setData, onClose }) {
  const C = useTheme();

  const set = (path, value) =>
    setData((d) => {
      const next = structuredClone(d);
      let node = next;
      for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
      node[path[path.length - 1]] = value;
      return next;
    });

  /* Debt CRUD */
  const addDebt = () => {
    const newDebt = {
      id: "d_" + Date.now(),
      name: "Credit Card / New Loan",
      kind: "credit_card",
      originalPrincipal: 50000,
      outstanding: 50000,
      annualInterestRatePct: 36,
      emi: 2500,
      remainingTenureMonths: 12,
      prepaymentPenaltyPct: 0,
      taxDeductible: false,
    };
    setData((d) => ({ ...d, debts: [...(d.debts || []), newDebt] }));
  };

  const updateDebt = (id, key, value) => {
    setData((d) => ({
      ...d,
      debts: (d.debts || []).map((x) => (x.id === id ? { ...x, [key]: value } : x)),
    }));
  };

  const removeDebt = (id) => {
    setData((d) => ({
      ...d,
      debts: (d.debts || []).filter((x) => x.id !== id),
    }));
  };

  /* Investment CRUD */
  const addInvestment = () => {
    const newInv = {
      id: "i_" + Date.now(),
      name: "Equity Index Fund",
      kind: "equity_mutual_fund",
      currentValue: 25000,
      monthlyContribution: 2500,
      expectedAnnualReturnPct: 12,
      lockInMonths: 0,
    };
    setData((d) => ({ ...d, investments: [...(d.investments || []), newInv] }));
  };

  const updateInvestment = (id, key, value) => {
    setData((d) => ({
      ...d,
      investments: (d.investments || []).map((x) => (x.id === id ? { ...x, [key]: value } : x)),
    }));
  };

  const removeInvestment = (id) => {
    setData((d) => ({
      ...d,
      investments: (d.investments || []).filter((x) => x.id !== id),
    }));
  };

  /* Goal CRUD */
  const addGoal = () => {
    const newGoal = {
      id: "g_" + Date.now(),
      name: "Emergency Fund",
      kind: "emergency_fund",
      targetAmount: 200000,
      currentAmount: 50000,
      targetDate: monthsFromNow(12),
      monthlyContribution: 5000,
      expectedAnnualReturnPct: 6,
      priority: "must_have",
    };
    setData((d) => ({ ...d, goals: [...(d.goals || []), newGoal] }));
  };

  const updateGoal = (id, key, value) => {
    setData((d) => ({
      ...d,
      goals: (d.goals || []).map((x) => (x.id === id ? { ...x, [key]: value } : x)),
    }));
  };

  const removeGoal = (id) => {
    setData((d) => ({
      ...d,
      goals: (d.goals || []).filter((x) => x.id !== id),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Bar Actions */}
      <Card pad="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base" style={{ color: C.ink }}>Your Profile & Numbers</h3>
            <p className="text-xs" style={{ color: C.muted }}>
              All recommendations recalculate in real time according to your entered data.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setData(BLANK_TEMPLATE)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors"
              style={{ borderColor: C.rule, color: C.ink2, background: C.card }}
            >
              🔄 Start Fresh / Reset
            </button>
            <button
              onClick={() => setData(DEMO)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors"
              style={{ borderColor: C.rule, color: C.ink2, background: C.card }}
            >
              📋 Load Sample Demo Data
            </button>
          </div>
        </div>
      </Card>

      {/* 1. User Profile Section */}
      <Card>
        <SectionTitle sub="Personal details drive your emergency fund target, benchmark net worth, and insurance needs.">
          👤 User Profile
        </SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="Full Name"
            value={data.personal?.name}
            onChange={(v) => set(["personal", "name"], v)}
            placeholder="e.g. Apurva Donde"
          />
          <TextField
            label="Email Address"
            type="email"
            value={data.personal?.email}
            onChange={(v) => set(["personal", "email"], v)}
            placeholder="e.g. user@example.com"
          />
          <TextField
            label="City"
            value={data.personal?.city}
            onChange={(v) => set(["personal", "city"], v)}
            placeholder="e.g. Mumbai"
          />
          <SelectField
            label="City Tier"
            value={data.personal?.cityTier}
            onChange={(v) => set(["personal", "cityTier"], Number(v))}
            options={[
              { value: 1, label: "Tier 1 Metro (Mumbai, Delhi, Blr, etc.)" },
              { value: 2, label: "Tier 2 City" },
              { value: 3, label: "Tier 3 City / Town" },
            ]}
          />
          <NumberField label="Age" value={data.personal?.age} onChange={(v) => set(["personal", "age"], v)} min={18} max={75} step={1} prefix=" yrs" />
          <NumberField label="Target Retirement Age" value={data.personal?.retirementAge} onChange={(v) => set(["personal", "retirementAge"], v)} min={40} max={75} step={1} prefix=" yrs" />
          <NumberField label="Dependents" value={data.personal?.dependents} onChange={(v) => set(["personal", "dependents"], v)} min={0} max={10} step={1} prefix="" />
          <NumberField label="Health Cover (Mediclaim)" value={data.personal?.healthInsuranceCover} onChange={(v) => set(["personal", "healthInsuranceCover"], v)} min={0} max={5000000} step={100000} />
          <NumberField label="Term Life Cover" value={data.personal?.lifeInsuranceCover} onChange={(v) => set(["personal", "lifeInsuranceCover"], v)} min={0} max={30000000} step={500000} />
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-medium" style={{ color: C.muted }}>Employment Type</div>
            <Toggle
              value={data.personal?.employmentType}
              onChange={(v) => set(["personal", "employmentType"], v)}
              options={[
                { value: "salaried_government", label: "Government" },
                { value: "salaried_private", label: "Salaried Private" },
                { value: "business_owner", label: "Business" },
                { value: "freelancer", label: "Freelancer" },
              ]}
            />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium" style={{ color: C.muted }}>Risk Appetite</div>
            <Toggle
              value={data.personal?.riskTolerance}
              onChange={(v) => set(["personal", "riskTolerance"], v)}
              options={[
                { value: "conservative", label: "Conservative" },
                { value: "moderate", label: "Moderate" },
                { value: "aggressive", label: "Aggressive" },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* 2. Cash Flow */}
      <Card>
        <SectionTitle sub="Monthly earnings and expected increments">
          💰 Monthly Income
        </SectionTitle>
        <div className="grid gap-5 sm:grid-cols-3">
          <NumberField label="Monthly Net Salary / Business Income" value={data.cashFlow?.monthlySalary} onChange={(v) => set(["cashFlow", "monthlySalary"], v)} min={0} max={2000000} step={2000} />
          <NumberField label="Other Monthly Income (Rent, Freelance, Dividends)" value={data.cashFlow?.otherMonthlyIncome} onChange={(v) => set(["cashFlow", "otherMonthlyIncome"], v)} min={0} max={1000000} step={2000} />
          <NumberField label="Expected Annual Salary Hike" value={data.personal?.expectedAnnualSalaryGrowthPct} onChange={(v) => set(["personal", "expectedAnnualSalaryGrowthPct"], v)} min={0} max={30} step={1} prefix="%" />
        </div>
      </Card>

      {/* 3. Monthly Expenses */}
      <Card>
        <SectionTitle sub="Essential living expenses excluding loan EMIs and investments">
          🏠 Monthly Expenses
        </SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(data.cashFlow?.expenses || {}).map(([k, v]) => (
            <NumberField
              key={k}
              label={k === "insurancePremiums" ? "Insurance Premiums" : k.charAt(0).toUpperCase() + k.slice(1)}
              value={v}
              onChange={(nv) => set(["cashFlow", "expenses", k], nv)}
              min={0}
              max={300000}
              step={500}
            />
          ))}
        </div>
      </Card>

      {/* 4. Cash & Savings */}
      <Card>
        <SectionTitle sub="Liquid reserves available for emergency cover">
          🏦 Liquid Savings & Fixed Deposits
        </SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Bank Account Balance" value={data.savings?.bankBalance} onChange={(v) => set(["savings", "bankBalance"], v)} min={0} max={10000000} step={5000} />
          <NumberField label="Emergency Fund Liquid Corpus" value={data.savings?.emergencyFund} onChange={(v) => set(["savings", "emergencyFund"], v)} min={0} max={10000000} step={5000} />
          <NumberField label="Fixed & Recurring Deposits" value={data.savings?.fixedDeposits} onChange={(v) => set(["savings", "fixedDeposits"], v)} min={0} max={10000000} step={5000} />
          <NumberField label="Physical Cash" value={data.savings?.cash} onChange={(v) => set(["savings", "cash"], v)} min={0} max={500000} step={1000} />
        </div>
      </Card>

      {/* 5. Multiple Debts & Credit Cards (CRUD) */}
      <Card>
        <SectionTitle
          sub="Add all active loans and credit card balances. High APR debt (>= 15%) is automatically flagged as toxic."
          action={
            <button
              onClick={addDebt}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
              style={{ background: C.sure }}
            >
              + Add Loan / Credit Card
            </button>
          }
        >
          💳 Debts & Credit Cards ({(data.debts || []).length})
        </SectionTitle>

        {(data.debts || []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center" style={{ borderColor: C.rule }}>
            <p className="text-sm font-medium" style={{ color: C.ink }}>No loans or credit cards added yet.</p>
            <p className="mt-1 text-xs" style={{ color: C.muted }}>Click "+ Add Loan / Credit Card" above to add your first debt.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {data.debts.map((x, idx) => {
              const isToxic = x.annualInterestRatePct >= TOXIC_RATE;
              return (
                <div
                  key={x.id}
                  className="rounded-xl border p-4 transition-all"
                  style={{
                    borderColor: isToxic ? C.danger : C.rule,
                    background: isToxic ? C.dangerBg + "33" : C.paper,
                  }}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: C.ink }}>#{idx + 1}</span>
                      {isToxic && (
                        <span className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ background: C.dangerBg, color: C.danger }}>
                          HIGH COST ({x.annualInterestRatePct}% APR)
                        </span>
                      )}
                      {x.taxDeductible && (
                        <span className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ background: C.sureBg, color: C.sure }}>
                          Tax Deductible Sec 24(b)/80E
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeDebt(x.id)}
                      className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-900/20"
                    >
                      🗑️ Delete Debt
                    </button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <TextField
                      label="Debt Name"
                      value={x.name}
                      onChange={(v) => updateDebt(x.id, "name", v)}
                      placeholder="e.g. HDFC Credit Card, SBI Home Loan"
                    />
                    <SelectField
                      label="Debt Category"
                      value={x.kind}
                      onChange={(v) => updateDebt(x.id, "kind", v)}
                      options={DEBT_KINDS}
                    />
                    <NumberField
                      label="Outstanding Balance"
                      value={x.outstanding}
                      onChange={(v) => updateDebt(x.id, "outstanding", v)}
                      min={0}
                      max={50000000}
                      step={5000}
                    />
                    <NumberField
                      label="Annual Interest Rate (% APR)"
                      value={x.annualInterestRatePct}
                      onChange={(v) => updateDebt(x.id, "annualInterestRatePct", v)}
                      min={0}
                      max={50}
                      step={0.5}
                      prefix="%"
                    />
                    <NumberField
                      label="Monthly EMI / Min Payment"
                      value={x.emi}
                      onChange={(v) => updateDebt(x.id, "emi", v)}
                      min={0}
                      max={500000}
                      step={500}
                    />
                    <NumberField
                      label="Remaining Tenure"
                      value={x.remainingTenureMonths}
                      onChange={(v) => updateDebt(x.id, "remainingTenureMonths", v)}
                      min={0}
                      max={360}
                      step={1}
                      prefix=" months"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 6. Multiple Investments (CRUD) */}
      <Card>
        <SectionTitle
          sub="Add your active SIPs, Mutual Funds, EPF, PPF, Stocks, or Gold."
          action={
            <button
              onClick={addInvestment}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
              style={{ background: C.model }}
            >
              + Add Investment
            </button>
          }
        >
          📈 Investments & Assets ({(data.investments || []).length})
        </SectionTitle>

        {(data.investments || []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center" style={{ borderColor: C.rule }}>
            <p className="text-sm font-medium" style={{ color: C.ink }}>No investments recorded.</p>
            <p className="mt-1 text-xs" style={{ color: C.muted }}>Click "+ Add Investment" above to start tracking your portfolio.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.investments.map((x, idx) => (
              <div key={x.id} className="rounded-xl border p-4" style={{ borderColor: C.rule, background: C.paper }}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold text-sm" style={{ color: C.ink }}>#{idx + 1} {x.name}</span>
                  <button
                    onClick={() => removeInvestment(x.id)}
                    className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-900/20"
                  >
                    🗑️ Remove
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <TextField label="Investment Name" value={x.name} onChange={(v) => updateInvestment(x.id, "name", v)} />
                  <SelectField label="Asset Class" value={x.kind} onChange={(v) => updateInvestment(x.id, "kind", v)} options={INVESTMENT_KINDS} />
                  <NumberField label="Current Value" value={x.currentValue} onChange={(v) => updateInvestment(x.id, "currentValue", v)} min={0} max={20000000} step={5000} />
                  <NumberField label="Monthly SIP / Contribution" value={x.monthlyContribution} onChange={(v) => updateInvestment(x.id, "monthlyContribution", v)} min={0} max={500000} step={500} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 7. Multiple Goals (CRUD) */}
      <Card>
        <SectionTitle
          sub="Add goals like Emergency Fund, Vehicle, Education, or Retirement."
          action={
            <button
              onClick={addGoal}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
              style={{ background: C.ink }}
            >
              + Add Goal
            </button>
          }
        >
          🎯 Financial Goals ({(data.goals || []).length})
        </SectionTitle>

        {(data.goals || []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center" style={{ borderColor: C.rule }}>
            <p className="text-sm font-medium" style={{ color: C.ink }}>No goals added yet.</p>
            <p className="mt-1 text-xs" style={{ color: C.muted }}>Click "+ Add Goal" above to create a financial target.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.goals.map((x, idx) => (
              <div key={x.id} className="rounded-xl border p-4" style={{ borderColor: C.rule, background: C.paper }}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold text-sm" style={{ color: C.ink }}>#{idx + 1} {x.name}</span>
                  <button
                    onClick={() => removeGoal(x.id)}
                    className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-900/20"
                  >
                    🗑️ Remove Goal
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <TextField label="Goal Name" value={x.name} onChange={(v) => updateGoal(x.id, "name", v)} />
                  <SelectField label="Goal Category" value={x.kind} onChange={(v) => updateGoal(x.id, "kind", v)} options={GOAL_KINDS} />
                  <NumberField label="Target Amount" value={x.targetAmount} onChange={(v) => updateGoal(x.id, "targetAmount", v)} min={10000} max={50000000} step={10000} />
                  <NumberField label="Currently Saved" value={x.currentAmount} onChange={(v) => updateGoal(x.id, "currentAmount", v)} min={0} max={x.targetAmount} step={5000} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <button
        onClick={onClose}
        className="w-full rounded-xl px-4 py-3.5 text-base font-semibold shadow-md transition-opacity hover:opacity-90"
        style={{ background: C.ink, color: C.paper }}
      >
        Save & See What Changed
      </button>
    </div>
  );
}

/* ================================================================== */
/* ERROR BOUNDARY                                                     */
/* ================================================================== */

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("FinCompass Uncaught Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: FONT, background: "#0B1320", minHeight: "100vh", color: "#F1F5F9" }}>
          <div style={{ maxWidth: "500px", margin: "0 auto", background: "#162234", padding: "32px", borderRadius: "16px", border: "1px solid #26354A", boxShadow: "0 10px 25px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
            <h2 style={{ color: "#F87171", fontSize: "20px", fontWeight: "600" }}>FinCompass Recovered From An Error</h2>
            <p style={{ color: "#94A3B8", fontSize: "14px", marginTop: "10px", lineHeight: "1.5" }}>
              {this.state.error?.toString() || "An unexpected error occurred."}
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "24px" }}>
              <button
                onClick={() => window.location.reload()}
                style={{ background: "#26354A", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "8px", fontWeight: "500", cursor: "pointer", fontSize: "13px" }}
              >
                Reload Page
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("fincompass_user_data_v2");
                  window.location.reload();
                }}
                style={{ background: "#F87171", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "8px", fontWeight: "500", cursor: "pointer", fontSize: "13px" }}
              >
                Reset App Data
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ================================================================== */
/* APP SHELL                                                          */
/* ================================================================== */

const TABS = [
  { id: "decide", label: "Decide" },
  { id: "daily", label: "Transactions" },
  { id: "analysis", label: "Analysis" },
  { id: "report", label: "📋 Report" },
  { id: "banks", label: "Banks & Cash" },
  { id: "health", label: "Health" },
  { id: "networth", label: "Net worth" },
  { id: "goals", label: "Goals" },
  { id: "debt", label: "Debt vs invest" },
  { id: "grow", label: "Grow" },
  { id: "simulate", label: "What if" },
  { id: "afford", label: "Can I afford it" },
  { id: "inputs", label: "Your numbers & Profile" },
];

function FinCompassApp() {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem("fincompass_dark_mode") === "true";
    } catch (e) {
      return false;
    }
  });

  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem("fincompass_user_data_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEMO,
          ...parsed,
          personal: { ...DEMO.personal, ...parsed.personal },
          cashFlow: { ...DEMO.cashFlow, ...parsed.cashFlow },
          savings: { ...DEMO.savings, ...parsed.savings },
        };
      }
    } catch (e) {
      console.error("Failed to load saved state:", e);
    }
    return DEMO;
  });

  // ── Banks & Cash state ──────────────────────────────────────────
  const [banks, setBanksRaw] = useState(() => {
    try {
      const saved = localStorage.getItem("fincompass_banks_v1");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [cash, setCashRaw] = useState(() => {
    try {
      const saved = localStorage.getItem("fincompass_cash_v1");
      return saved ? Number(saved) : 0;
    } catch { return 0; }
  });

  // ── Categories state ─────────────────────────────────────────
  const [categories, setCategoriesRaw] = useState(() => {
    try {
      const saved = localStorage.getItem("fincompass_categories_v1");
      return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
    } catch { return DEFAULT_CATEGORIES; }
  });

  const saveCategories = useCallback((cats) => {
    try { localStorage.setItem("fincompass_categories_v1", JSON.stringify(cats)); } catch {}
    // Optionally save to Firebase here
  }, []);

  const handleEditBudget = useCallback((catId, budget) => {
    setCategoriesRaw((prev) => {
      const next = prev.map((c) => c.id === catId ? { ...c, budget } : c);
      saveCategories(next);
      return next;
    });
  }, [saveCategories]);

  const handleAddCategory = useCallback((cat) => {
    setCategoriesRaw((prev) => {
      const next = [...prev, cat];
      saveCategories(next);
      return next;
    });
  }, [saveCategories]);

  const handleDeleteCategory = useCallback((catId) => {
    setCategoriesRaw((prev) => {
      const next = prev.filter((c) => c.id !== catId);
      saveCategories(next);
      return next;
    });
  }, [saveCategories]);

  // ── Daily logs state ────────────────────────────────────────────
  const [dailyLogs, setDailyLogsRaw] = useState(() => {
    try {
      const saved = localStorage.getItem("fincompass_daily_logs_v1");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | synced | offline
  const [tab, setTab] = useState("decide");
  const saveTimerRef = useRef(null);

  // ── Load from Firestore on mount ────────────────────────────────
  useEffect(() => {
    if (!FIREBASE_CONFIGURED) { setSyncStatus("offline"); return; }
    setSyncStatus("syncing");
    Promise.all([loadUserData(), loadBanks(), loadDailyLogs()])
      .then(([userData, banksData, logsData]) => {
        if (userData) {
          setData((prev) => ({
            ...DEMO,
            ...userData,
            personal: { ...DEMO.personal, ...userData.personal },
            cashFlow: { ...DEMO.cashFlow, ...userData.cashFlow },
            savings: { ...DEMO.savings, ...userData.savings },
          }));
        }
        if (banksData) {
          setBanksRaw(banksData.banks || []);
          setCashRaw(banksData.cash || 0);
        }
        if (logsData) {
          setDailyLogsRaw(logsData);
        }
        setSyncStatus("synced");
      })
      .catch((e) => {
        console.warn("Firestore load error:", e);
        setSyncStatus("offline");
      });
  }, []);



  const setBanks = useCallback((updater) => {
    setBanksRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { localStorage.setItem("fincompass_banks_v1", JSON.stringify(next)); } catch {}
      saveBanks(next, cash).catch(() => {});
      return next;
    });
  }, [cash]);

  const setCash = useCallback((val) => {
    setCashRaw(val);
    try { localStorage.setItem("fincompass_cash_v1", String(val)); } catch {}
    saveBanks(banks, val).catch(() => {});
  }, [banks]);

  // ── Auto-sync bank balances → savings.bankBalance and savings.cash ─
  useEffect(() => {
    const totalBank = banks.reduce((s, b) => s + (b.balance || 0), 0);
    setData((prev) => ({
      ...prev,
      savings: {
        ...(prev.savings || {}),
        bankBalance: totalBank,
        cash: cash,
      },
    }));
  }, [banks, cash]);

  // ── Daily log helpers ───────────────────────────────────────────
  const handleAddEntry = useCallback((dateStr, entry) => {
    setDailyLogsRaw((prev) => {
      const dayLog = prev[dateStr] || { entries: [], totalSpent: 0 };
      const newEntries = [...dayLog.entries, entry];
      const newLog = { entries: newEntries, totalSpent: newEntries.reduce((s, e) => s + e.amount, 0) };
      const next = { ...prev, [dateStr]: newLog };
      try { localStorage.setItem("fincompass_daily_logs_v1", JSON.stringify(next)); } catch {}
      saveDailyLog(dateStr, newLog).catch(() => {});
      return next;
    });
  }, []);

  const handleDeleteEntry = useCallback((dateStr, entryId) => {
    setDailyLogsRaw((prev) => {
      const dayLog = prev[dateStr] || { entries: [] };
      const newEntries = dayLog.entries.filter((e) => e.id !== entryId);
      const newLog = { entries: newEntries, totalSpent: newEntries.reduce((s, e) => s + e.amount, 0) };
      const next = { ...prev, [dateStr]: newLog };
      if (newEntries.length === 0) {
        const { [dateStr]: _, ...rest } = next;
        try { localStorage.setItem("fincompass_daily_logs_v1", JSON.stringify(rest)); } catch {}
        deleteDailyEntry(dateStr, null).catch(() => {});
        return rest;
      }
      try { localStorage.setItem("fincompass_daily_logs_v1", JSON.stringify(next)); } catch {}
      deleteDailyEntry(dateStr, newLog).catch(() => {});
      return next;
    });
  }, []);


  useEffect(() => {
    try {
      localStorage.setItem("fincompass_dark_mode", isDark ? "true" : "false");
    } catch (e) {}
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem("fincompass_user_data_v2", JSON.stringify(data));
    } catch (e) {
      console.error("Failed to save state:", e);
    }
    // Debounced Firestore save
    if (FIREBASE_CONFIGURED) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setSyncStatus("syncing");
        saveUserData(data).then(() => setSyncStatus("synced")).catch(() => setSyncStatus("offline"));
      }, 800);
    }
  }, [data]);

  const C = useMemo(() => (isDark ? DARK_THEME : LIGHT_THEME), [isDark]);
  const profile = useMemo(() => deriveProfile(data), [data]);
  const health = useMemo(() => healthScore(data, profile), [data, profile]);
  const recs = useMemo(() => recommend(data, profile, health), [data, profile, health]);
  const alerts = useMemo(() => generateAlerts(data, profile), [data, profile]);
  const allocation = useMemo(
    () => allocate(data, profile, Math.max(0, profile.surplus), "monthly"),
    [data, profile]
  );
  const portfolio = useMemo(() => analysePortfolio(data, profile), [data, profile]);

  const bandColor =
    health.total >= 70 ? C.sure : health.total >= 55 ? C.ink2 : health.total >= 35 ? C.warn : C.danger;

  // Sync indicator label
  const syncLabel = !FIREBASE_CONFIGURED
    ? { text: "💾 Local only", color: C.faint }
    : syncStatus === "syncing"
    ? { text: "☁️ Saving…", color: C.warn }
    : syncStatus === "synced"
    ? { text: "☁️ Synced", color: C.sure }
    : { text: "📵 Offline", color: C.faint };

  return (
    <ThemeContext.Provider value={C}>
      <div style={{ background: C.paper, minHeight: "100vh", fontFamily: FONT, color: C.ink }}>
        <header
          className="sticky top-0 z-10 transition-colors"
          style={{ background: isDark ? "rgba(11,19,32,0.92)" : "rgba(238,242,247,0.92)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.rule}` }}
        >
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full font-bold text-white shadow-sm"
                style={{ background: C.sure }}
              >
                {(data.personal?.name || "U")[0].toUpperCase()}
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-semibold" style={{ letterSpacing: "-0.02em", color: C.ink }}>
                    FinCompass
                  </span>
                  <span className="text-xs font-medium rounded px-1.5 py-0.5" style={{ background: C.card, color: C.ink2, border: `1px solid ${C.rule}` }}>
                    {data.personal?.name || "User"}
                  </span>
                </div>
                <div className="text-xs" style={{ color: C.muted }}>
                  {data.personal?.city || "India"} · age {data.personal?.age} · {data.personal?.email || "No email"}
                </div>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              {/* Sync status badge */}
              <span className="hidden sm:inline text-xs font-medium" style={{ color: syncLabel.color }}>
                {syncLabel.text}
              </span>
              <button
                onClick={() => setIsDark((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors"
                style={{ borderColor: C.rule, color: C.ink, background: C.card }}
                title="Toggle Light/Dark Theme"
              >
                {isDark ? "☀️ Light" : "🌙 Dark"}
              </button>
              <button
                onClick={() => setTab("inputs")}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors"
                style={{ borderColor: C.rule, color: C.ink2, background: C.card }}
              >
                ✏️ Profile & Numbers
              </button>
              <div className="text-right">
                <div className="text-xs" style={{ color: C.faint }}>Financial health</div>
                <div className="text-sm font-semibold" style={{ ...NUM, color: bandColor }}>
                  {health.total}/100
                </div>
              </div>
            </div>
          </div>

          <nav className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6">
            <div className="flex gap-1 pb-2">
              {TABS.map((t) => {
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                    style={{
                      background: active ? C.ink : "transparent",
                      color: active ? C.paper : C.muted,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {tab === "decide" && (
            <DecideTab
              data={data} profile={profile} health={health}
              recs={recs} alerts={alerts} allocation={allocation}
            />
          )}
          {tab === "plan" && (
            <PlanTab data={data} profile={profile} allocation={allocation} alerts={alerts} />
          )}
          {tab === "daily" && (
            <DailyTrackerTab
              logs={dailyLogs}
              onAddEntry={handleAddEntry}
              onDeleteEntry={handleDeleteEntry}
              categories={categories}
            />
          )}
          {tab === "analysis" && (
            <SpendingAnalysisTab
              logs={dailyLogs}
              categories={categories}
              onEditBudget={handleEditBudget}
              onAddCategory={handleAddCategory}
              onDeleteCategory={handleDeleteCategory}
            />
          )}
          {tab === "report" && (
            <BalanceSheetTab
              data={data}
              profile={profile}
              dailyLogs={dailyLogs}
              categories={categories}
            />
          )}
          {tab === "banks" && (
            <BanksTab
              banks={banks}
              cash={cash}
              setBanks={setBanks}
              setCash={setCash}
            />
          )}
          {tab === "health" && <HealthTab health={health} profile={profile} />}
          {tab === "networth" && <NetWorthTab data={data} profile={profile} portfolio={portfolio} />}
          {tab === "goals" && <GoalsTab data={data} profile={profile} />}
          {tab === "debt" && <DebtVsInvestTab data={data} profile={profile} />}
          {tab === "grow" && <GrowTab data={data} profile={profile} />}
          {tab === "simulate" && <SimulateTab data={data} profile={profile} />}
          {tab === "afford" && <AffordTab data={data} profile={profile} />}
          {tab === "inputs" && (
            <InputsPanel data={data} setData={setData} onClose={() => setTab("decide")} />
          )}

          <footer className="mt-10 border-t pt-6" style={{ borderColor: C.rule }}>
            <p className="text-xs leading-relaxed" style={{ color: C.faint }}>
              FinCompass is a planning and decision-support tool, not a registered investment adviser.
              Projections use the assumptions shown alongside each figure and are illustrative only —
              investment returns are uncertain and can be negative, while debt interest is contractual.
            </p>
            <p className="mt-3 text-xs" style={{ color: C.faint }}>
              Showing profile for <strong>{data.personal?.name}</strong> ({data.personal?.city}). Open “Your numbers & Profile” to edit any input or add multiple loans/credit cards.
            </p>
          </footer>
        </main>
      </div>
    </ThemeContext.Provider>
  );
}

export default function FinCompass() {
  return (
    <ErrorBoundary>
      <FinCompassApp />
    </ErrorBoundary>
  );
}
