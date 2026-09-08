import React, { useMemo, useState } from "react";
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
 *
 * The design carries one idea: money you are CERTAIN about and money you
 * only EXPECT are different things, and confusing them is the root of most
 * bad financial decisions. Guaranteed outcomes (clearing a 42% card, an EMI
 * you contractually owe) are teal. Modelled outcomes (a 12% equity
 * assumption, a projected corpus) are indigo and always hedged in words.
 * Nothing on this screen mixes the two without saying so.
 * ==================================================================== */

const C = {
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

const URGENCY_COLOR = {
  critical: C.danger,
  high: C.warn,
  medium: C.ink2,
  low: C.faint,
};

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

// Investments compound on an effective basis...
const mRate = (annualPct) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;
// ...but Indian lenders quote nominal/12. Mixing these is the classic bug.
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
  // A payment that does not cover the interest never clears the balance —
  // exactly what a credit-card minimum does.
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

// A home loan at 9% for a 30% taxpayer claiming 24(b) does not really cost 9%.
const effectiveDebtRate = (rate, deductible, taxRate) =>
  deductible ? rate * (1 - taxRate / 100) : rate;

/* ---------------------------------------------------------------- */
/* Domain constants                                                  */
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

/* ---------------------------------------------------------------- */
/* Derived profile                                                   */
/* ---------------------------------------------------------------- */

const sumExpenses = (e) =>
  e.rent + e.utilities + e.food + e.transport + e.insurancePremiums +
  e.subscriptions + e.entertainment + e.other;

function recommendedEmergencyMonths(d) {
  const stability = INCOME_STABILITY[d.personal.employmentType] ?? 0.75;
  let m = 6;
  m += (0.75 - stability) * 8;
  m += Math.min(d.personal.dependents, 4) * 0.75;
  if (d.debts.some((x) => x.emi > 0 && x.outstanding > 0)) m += 0.5;
  if (d.personal.healthInsuranceCover <= 0) m += 1;
  return Math.round(Math.min(12, Math.max(3, m)) * 2) / 2;
}

function deriveProfile(d) {
  const income = d.cashFlow.monthlySalary + d.cashFlow.otherMonthlyIncome;
  const living = sumExpenses(d.cashFlow.expenses);
  const emi = d.debts.reduce((s, x) => s + (x.outstanding > 0 ? x.emi : 0), 0);
  const sip = d.investments.reduce((s, x) => s + x.monthlyContribution, 0);
  const surplus = income - living - emi - sip;

  const s = d.savings;
  const cashLike = s.bankBalance + s.emergencyFund + s.fixedDeposits +
    s.recurringDeposits + s.cash + s.otherLiquid;
  const totalInvestments = d.investments.reduce((a, x) => a + x.currentValue, 0);
  const totalDebt = d.debts.reduce((a, x) => a + Math.max(0, x.outstanding), 0);
  const otherAssets = (d.assets || []).reduce((a, x) => a + x.currentValue, 0);
  const totalAssets = cashLike + totalInvestments + otherAssets;

  const efMonthsTarget = recommendedEmergencyMonths(d);
  // Only genuinely reachable money counts as emergency cover. A ₹4L PPF
  // balance does not help when the boiler bursts.
  const efCover = s.emergencyFund + s.bankBalance + s.cash;
  const efMonths = living > 0 ? efCover / living : 0;
  const efTarget = Math.round(living * efMonthsTarget);

  const saved = income - living - emi;
  const expectedReturn = totalInvestments > 0
    ? d.investments.reduce((a, x) => a + x.expectedAnnualReturnPct * x.currentValue, 0) / totalInvestments
    : d.assumptions.equityReturnPct;
  const weightedDebtRate = totalDebt > 0
    ? d.debts.reduce((a, x) => a + x.annualInterestRatePct * Math.max(0, x.outstanding), 0) / totalDebt
    : 0;
  const equityValue = d.investments.reduce(
    (a, x) => a + x.currentValue * (EQUITY_WEIGHT[x.kind] ?? 0.5), 0);
  const equityShare = totalInvestments > 0 ? equityValue / totalInvestments : 0;

  // The bar an extra rupee must clear to justify market risk over the
  // guaranteed return of clearing a debt: expected return, less tax drag,
  // less a risk premium sized by how much volatility this person can stomach.
  const taxDrag = expectedReturn * equityShare * (d.assumptions.ltcgRatePct / 100);
  const hurdle = expectedReturn - taxDrag - RISK_PREMIUM[d.personal.riskTolerance];

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

  add("emergencyFund", "Emergency fund", clamp01(p.efMonths / p.efMonthsTarget),
    `${p.efMonths.toFixed(1)} of ${p.efMonthsTarget} months of expenses covered.`,
    p.efGap > 0 ? `Add ${inr(p.efGap)} to reach ${p.efMonthsTarget} months.` : null);

  const live = d.debts.filter((x) => x.outstanding > 0);
  const toxic = live.some((x) => x.annualInterestRatePct >= TOXIC_RATE);
  let debtRatio = p.totalDebt === 0 ? 1 : clamp01(
    1 - (clamp01(p.emiToIncomePct / 40) * 0.45 +
         clamp01(p.weightedDebtRate / 18) * 0.35 +
         clamp01(p.debtToIncomePct / 300) * 0.2));
  // One toxic-rate debt caps this component regardless of the averages —
  // a blended rate can look fine while a 42% card quietly compounds.
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
    p.investmentRatePct < 20 ? `Raise monthly investing by ${inr(0.2 * p.income - p.sip)} to reach 20% of income.` : null);

  add("cashFlow", "Cash flow", clamp01((p.surplus / Math.max(1, p.income) + 0.05) / 0.25),
    p.surplus >= 0
      ? `${inr(p.surplus)}/month uncommitted after expenses, EMIs and existing investments.`
      : `You are ${inr(Math.abs(p.surplus))}/month short — outflows exceed income.`,
    p.surplus < p.income * 0.2 ? "Cut variable spending or raise income to widen monthly breathing room." : null);

  const annual = p.income * 12;
  const needsLife = d.personal.dependents > 0;
  const lifeTarget = needsLife ? annual * 10 : 0;
  const healthTarget = d.personal.cityTier === 1 ? 1000000 : 500000;
  const healthRatio = clamp01(d.personal.healthInsuranceCover / healthTarget);
  const lifeRatio = needsLife ? clamp01(d.personal.lifeInsuranceCover / Math.max(1, lifeTarget)) : 1;
  add("insurance", "Insurance", clamp01(healthRatio * 0.6 + lifeRatio * 0.4),
    d.personal.healthInsuranceCover > 0
      ? `Health cover ${inr(d.personal.healthInsuranceCover)}${needsLife ? `, life cover ${inr(d.personal.lifeInsuranceCover)}` : ""}.`
      : "No health cover recorded. One hospital stay can undo years of saving.",
    healthRatio < 1 ? `Take health cover of at least ${inr(healthTarget)}.`
      : lifeRatio < 1 ? `Increase term life cover toward ${inr(lifeTarget)} (about 10× annual income).` : null);

  const mult = benchmarkMultiple(d.personal.age);
  const nwTarget = annual * mult;
  add("netWorth", "Net worth for age", nwTarget <= 0 ? (p.netWorth >= 0 ? 1 : 0) : clamp01(p.netWorth / nwTarget),
    nwTarget > 0
      ? `${inr(p.netWorth)} against a ${inr(nwTarget)} benchmark for age ${d.personal.age} (${mult.toFixed(1)}× annual income).`
      : `${inr(p.netWorth)} net worth.`,
    p.netWorth < nwTarget ? `Close a ${inr(nwTarget - p.netWorth)} gap through consistent investing and debt reduction.` : null);

  const gp = d.goals.length === 0 ? 0.5
    : clamp01(d.goals.reduce((s, g) => s + clamp01(g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0), 0) / d.goals.length);
  add("goalProgress", "Goal progress", gp,
    d.goals.length === 0 ? "No goals set. Money without a destination tends to leak."
      : `${d.goals.length} goal${d.goals.length > 1 ? "s" : ""}, ${(gp * 100).toFixed(0)}% funded on average.`,
    d.goals.length === 0 ? "Add at least one dated, costed goal." : null);

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
/* Allocation engine — where does the next rupee go?                 */
/*                                                                   */
/* Two phases, not one waterfall. A pure waterfall ("fill the        */
/* emergency fund, then invest") is technically defensible and       */
/* behaviourally awful — it tells a 24-year-old to stop investing    */
/* for eleven months. So: a hard waterfall for genuine emergencies,  */
/* then a weighted split across everything else.                     */
/* ---------------------------------------------------------------- */

function allocate(d, p, amount, mode = "monthly") {
  const notes = [];
  if (amount <= 0) {
    return {
      amount: 0, mode, buckets: [], unallocated: 0,
      headline: p.surplus < 0
        ? "There is nothing to allocate — your outflows exceed your income."
        : "There is nothing left to allocate this month.",
      constraint: p.surplus < 0 ? "Negative monthly cash flow" : "No surplus",
      notes: ["Every rupee is already committed. The highest-impact move is reducing a fixed cost or raising income, not reallocating."],
    };
  }

  const taxRate = d.assumptions.marginalTaxRatePct;
  const live = d.debts.filter((x) => x.outstanding > 0);
  const survivalTarget = p.living;
  const survivalGap = Math.max(0, survivalTarget - p.efCover);
  const cands = [];

  /* Phase 1 — genuine emergencies, filled in full before anything else */

  if (survivalGap > 0) {
    cands.push({
      id: "survival_buffer", label: "Survival buffer", target: "Instant-access savings",
      capacity: survivalGap, weight: 100, rate: d.assumptions.savingsAccountReturnPct,
      certainty: "guaranteed", urgency: "critical", phase: "critical",
      reason: `You hold less than one month of expenses in cash. Until that is fixed, any unexpected bill becomes credit-card debt at ${TOXIC_RATE}%+, which is more expensive than anything else this money could do.`,
      impact: () => `Covers ${inr(survivalTarget)} of essential spending for one month`,
    });
  }

  const toxic = live.filter((x) => x.annualInterestRatePct >= TOXIC_RATE);
  toxic.forEach((x) => {
    const rate = effectiveDebtRate(x.annualInterestRatePct, x.taxDeductible, taxRate);
    cands.push({
      id: "toxic_debt", label: "Clear high-cost debt", target: `${x.name} @ ${x.annualInterestRatePct}%`,
      capacity: mode === "windfall" ? x.outstanding : Math.max(x.emi, x.outstanding / 12),
      weight: 100, rate, certainty: "guaranteed", urgency: "critical", phase: "critical",
      reason: `At ${x.annualInterestRatePct}% this costs more than any investment can reliably earn. Paying it down is a guaranteed, tax-free ${pct(rate)} return.`,
      impact: (a) => `Saves roughly ${inr((a * rate) / 100)} of interest in the first year alone`,
    });
  });

  /* Phase 2 — weighted balance across everything that is merely important */

  if (p.efGap > 0) {
    const thin = p.efMonths < 3;
    cands.push({
      id: "emergency_fund", label: "Emergency fund", target: "Liquid fund or sweep-in FD",
      capacity: p.efGap, weight: thin ? 3.2 : 1.5, rate: d.assumptions.savingsAccountReturnPct,
      certainty: "guaranteed", urgency: thin ? "high" : "medium", phase: "balanced",
      reason: thin
        ? `You have ${p.efMonths.toFixed(1)} months of cover. Below three months, a job gap or medical bill forces you to sell investments at the worst possible time.`
        : `Past three months, so no longer urgent — but ${inr(p.efGap)} still separates you from a full ${p.efMonthsTarget}-month cushion sized for your income type.`,
      impact: (a) => `Adds ${(a / Math.max(1, p.living)).toFixed(1)} months of cover`,
    });
  }

  live.forEach((x) => {
    if (x.annualInterestRatePct >= TOXIC_RATE) return;
    const rate = effectiveDebtRate(x.annualInterestRatePct, x.taxDeductible, taxRate);
    const spread = rate - p.hurdle;
    const capacity = mode === "windfall" ? x.outstanding : Math.max(2000, x.emi * 0.75);
    if (spread > 0) {
      cands.push({
        id: "high_interest_debt", label: "Prepay debt", target: `${x.name} @ ${x.annualInterestRatePct}%`,
        capacity, weight: 1.6 + Math.min(2.5, spread * 0.45), rate,
        certainty: "guaranteed", urgency: spread > 3 ? "high" : "medium", phase: "balanced",
        reason: `${x.name} costs ${pct(rate)}${x.taxDeductible ? " after tax relief" : ""}, which is ${spread.toFixed(1)} points above your ${pct(p.hurdle)} investment hurdle. Repaying is the better risk-adjusted deal.`,
        impact: (a) => `Saves about ${inr((a * rate) / 100)} of interest per year, guaranteed`,
      });
    } else {
      cands.push({
        id: "moderate_debt", label: "Optional prepayment", target: `${x.name} @ ${x.annualInterestRatePct}%`,
        capacity, weight: 0.5, rate, certainty: "guaranteed", urgency: "low", phase: "balanced",
        reason: `At ${pct(rate)}${x.taxDeductible ? " after tax relief" : ""} this loan is cheaper than your ${pct(p.hurdle)} hurdle, so prepaying is a comfort decision rather than a maths one.`,
        impact: (a) => `Saves about ${inr((a * rate) / 100)} of interest per year`,
      });
    }
  });

  const efHealthy = p.efMonths >= 3;
  cands.push({
    id: "long_term_investing", label: "Long-term investing", target: "Diversified equity SIP",
    capacity: Math.max(amount, 1), weight: efHealthy ? 2.6 : 1.1, rate: p.expectedReturn,
    certainty: "expected", urgency: efHealthy ? "high" : "medium", phase: "balanced",
    reason: efHealthy
      ? `With ${p.efMonths.toFixed(1)} months of cover behind you, long-horizon money belongs in the market. At age ${d.personal.age} the decades of compounding ahead are the asset, not the amount.`
      : "Keeping the investing habit alive matters even while you build cash, so a smaller share still goes here rather than pausing entirely.",
    impact: (a) =>
      `About ${inrShort(fvSip(a, p.expectedReturn, 240))} in 20 years at an assumed ${pct(p.expectedReturn)} — roughly ${inrShort(fvSip(a, realReturn(p.expectedReturn, d.assumptions.inflationPct), 240))} in today's money`,
  });

  if (mode === "monthly" && taxRate >= 20) {
    const used = d.investments.filter((x) => ["ppf", "epf", "nps"].includes(x.kind))
      .reduce((s, x) => s + x.monthlyContribution * 12, 0);
    const gap = Math.max(0, 150000 - used);
    if (gap > 12000) {
      cands.push({
        id: "tax_saving", label: "Tax-advantaged saving", target: "PPF / ELSS / NPS (80C headroom)",
        capacity: gap / 12, weight: 1.0, rate: p.expectedReturn * 0.7 + taxRate * 0.15,
        certainty: "expected", urgency: "medium", phase: "balanced",
        reason: `You have ${inr(gap)} of unused Section 80C room this year. At a ${taxRate}% marginal rate that is up to ${inr((gap * taxRate) / 100)} of tax you are choosing to pay.`,
        impact: (a) => `Reduces tax by roughly ${inr((a * 12 * taxRate) / 100)} a year`,
      });
    }
  }

  const now = new Date();
  d.goals.forEach((g) => {
    if (g.kind === "emergency_fund" || g.kind === "retirement") return;
    const m = Math.max(0, Math.round((new Date(g.targetDate) - now) / (1000 * 60 * 60 * 24 * 30.44)));
    if (m === 0 || m > 60) return;
    const remaining = Math.max(0, g.targetAmount - g.currentAmount);
    if (remaining <= 0) return;
    const shortfall = Math.max(0, remaining / m - g.monthlyContribution);
    if (shortfall <= 0) return;
    cands.push({
      id: "short_term_goal", label: "Goal funding", target: g.name,
      capacity: mode === "windfall" ? remaining : shortfall,
      weight: g.priority === "must_have" ? 1.8 : g.priority === "should_have" ? 1.1 : 0.5,
      rate: g.expectedAnnualReturnPct, certainty: "expected",
      urgency: m <= 12 ? "high" : "medium", phase: "balanced",
      reason: `${g.name} is ${m} months away and short by ${inr(remaining)}. At the current ${inr(g.monthlyContribution)}/month you will miss it — the gap is ${inr(shortfall)}/month.`,
      impact: (a) => `Closes ${Math.min(100, (a / Math.max(1, shortfall)) * 100).toFixed(0)}% of the monthly shortfall`,
    });
  });

  const noExpensiveDebt = !live.some(
    (x) => effectiveDebtRate(x.annualInterestRatePct, x.taxDeductible, taxRate) > p.hurdle);
  if (efHealthy && noExpensiveDebt && mode === "monthly") {
    cands.push({
      id: "discretionary", label: "Guilt-free spending", target: "Whatever you like",
      capacity: amount * 0.12, weight: 0.45, rate: 0,
      certainty: "guaranteed", urgency: "low", phase: "balanced",
      reason: "Your emergency fund is funded and nothing you owe costs more than you can expect to earn. A plan you resent is a plan you abandon, so a slice is deliberately yours to spend.",
      impact: () => "Keeps the plan sustainable",
    });
  }

  /* Distribution */

  let remaining = amount;
  const alloc = new Map();
  const critical = cands.filter((c) => c.phase === "critical").sort((a, b) => b.rate - a.rate);
  critical.forEach((c) => {
    if (remaining <= 0) return;
    const give = Math.min(remaining, c.capacity);
    alloc.set(c, give);
    remaining -= give;
  });
  if (critical.length > 0 && remaining <= 0) {
    notes.push("All of this money goes to one place because you have an obligation that outranks every alternative. Normal balancing resumes once it is cleared.");
  }

  const open = new Set(cands.filter((c) => c.phase === "balanced" && c.capacity > 0));
  let pool = remaining, guard = 0;
  while (pool >= 100 && open.size > 0 && guard++ < 12) {
    const totalWeight = [...open].reduce((s, c) => s + c.weight, 0);
    if (totalWeight <= 0) break;
    let spent = 0;
    [...open].forEach((c) => {
      const already = alloc.get(c) ?? 0;
      const give = Math.min((pool * c.weight) / totalWeight, Math.max(0, c.capacity - already));
      if (give > 0) { alloc.set(c, already + give); spent += give; }
      if (already + give >= c.capacity - 0.5) open.delete(c);
    });
    if (spent <= 0) break;
    pool -= spent;
  }
  remaining = pool;

  // Round to ₹100 without silently losing money: round every bucket DOWN,
  // then hand the remainder back largest-fraction first, respecting caps.
  // You must never round up to paying more than a card balance.
  const rows = [...alloc.entries()]
    .map(([c, raw]) => ({ c, raw, amt: Math.floor(raw / 100) * 100 }))
    .filter((r) => r.raw > 0);
  let leftover = Math.round(amount - rows.reduce((s, r) => s + r.amt, 0));
  const byFrac = [...rows].sort((a, b) => (b.raw - b.amt) - (a.raw - a.amt));
  let pass = 0;
  while (leftover >= 100 && pass++ < 3) {
    let moved = false;
    for (const r of byFrac) {
      if (leftover < 100) break;
      if (r.amt + 100 <= Math.floor(r.c.capacity / 100) * 100 + 0.5) {
        r.amt += 100; leftover -= 100; moved = true;
      }
    }
    if (!moved) break;
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  const buckets = rows.filter((r) => r.amt > 0)
    .sort((a, b) => order[a.c.urgency] - order[b.c.urgency] || b.c.rate - a.c.rate || b.amt - a.amt)
    .map(({ c, amt }) => ({
      id: c.id, label: c.label, target: c.target, amount: amt,
      sharePct: Number(((amt / amount) * 100).toFixed(1)),
      rate: Number(c.rate.toFixed(2)), certainty: c.certainty, urgency: c.urgency,
      reason: c.reason, impact: c.impact(amt), capacity: Math.round(c.capacity),
    }));

  const allocated = buckets.reduce((s, b) => s + b.amount, 0);
  const unallocated = Math.max(0, Math.round(amount - allocated));
  const top = buckets[0];

  const constraint = survivalGap > 0 ? "Less than one month of cash cover"
    : toxic.length > 0 ? `${toxic[0].name} at ${toxic[0].annualInterestRatePct}%`
    : p.efGap > 0 && p.efMonths < 3 ? "Emergency fund below three months"
    : live.some((x) => effectiveDebtRate(x.annualInterestRatePct, x.taxDeductible, taxRate) > p.hurdle)
      ? "Debt priced above your investment hurdle"
      : "Long-horizon compounding — nothing urgent is competing";

  if (unallocated >= 100) {
    notes.push(`${inr(unallocated)} is left over because every destination hit its sensible cap. Park it in a liquid fund or add a goal to give it a job.`);
  }
  notes.push(`Investment figures assume ${pct(p.expectedReturn)} a year and ${d.assumptions.inflationPct}% inflation. Debt savings are contractual; investment returns are not.`);

  return {
    amount, mode, buckets, unallocated, constraint, notes,
    headline: top
      ? `Put ${inr(top.amount)} of your ${inr(amount)} into ${top.target}${buckets.length > 1 ? `, then split the rest across ${buckets.length - 1} other place${buckets.length > 2 ? "s" : ""}.` : "."}`
      : `No destination currently outranks holding ${inr(amount)} in cash.`,
  };
}

/* ---------------------------------------------------------------- */
/* Goals, FIRE, debt-vs-invest, affordability, simulation            */
/* ---------------------------------------------------------------- */

function analyseGoal(g) {
  const m = Math.max(0, Math.round((new Date(g.targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30.44)));
  const r = g.expectedAnnualReturnPct;
  const required = requiredMonthly(g.targetAmount, g.currentAmount, r, m);
  const projected = g.currentAmount * Math.pow(1 + mRate(r), m) + fvSip(g.monthlyContribution, r, m);
  const feasibility = g.targetAmount <= g.currentAmount ? 100
    : Math.max(0, Math.min(100, (projected / g.targetAmount) * 100));
  const status = g.currentAmount >= g.targetAmount ? "achieved"
    : feasibility >= 98 ? "on_track" : feasibility >= 75 ? "behind" : "at_risk";
  const shortfall = Math.max(0, g.targetAmount - projected);
  const monthlyShortfall = Math.max(0, required - g.monthlyContribution);
  const yrs = yearsToTarget(g.targetAmount, g.currentAmount, g.monthlyContribution, r);

  return {
    ...g, monthsRemaining: m,
    progressPct: g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0,
    requiredMonthly: Math.round(required), projected: Math.round(projected),
    shortfall: Math.round(shortfall), monthlyShortfall: Math.round(monthlyShortfall),
    feasibility, status, yearsAtCurrentPace: yrs,
    verdict: status === "achieved" ? "Funded. Move the money somewhere it can keep working."
      : status === "on_track" ? `On track — ${inr(g.monthlyContribution)}/month gets you there.`
      : status === "behind" ? `Close, but short by ${inr(shortfall)} at the current pace.`
      : `Not reachable on this trajectory. You would land at ${inr(projected)} of ${inr(g.targetAmount)}.`,
    fix: monthlyShortfall > 0
      ? `Raise it to ${inr(required)}/month (+${inr(monthlyShortfall)}), push the date out${yrs ? ` to about ${yrs.toFixed(1)} years` : ""}, or cut the target to ${inr(projected)}.`
      : null,
  };
}

const FIRE_SCENARIOS = {
  conservative: { ret: -2.5, inf: 1, swr: -0.5 },
  moderate: { ret: 0, inf: 0, swr: 0 },
  aggressive: { ret: 1.5, inf: -0.5, swr: 0.5 },
};

function calcFire(d, p, scenario = "moderate", o = {}) {
  const s = FIRE_SCENARIOS[scenario];
  const ret = p.expectedReturn + s.ret;
  const inf = d.assumptions.inflationPct + s.inf;
  const swr = d.assumptions.safeWithdrawalRatePct + s.swr;
  const age = d.personal.age;
  const retireAge = o.retirementAge ?? d.assumptions.retirementAge;
  const years = Math.max(1, retireAge - age);
  const monthlyExp = o.monthlyExpenses ?? p.living;
  const monthlyInv = o.monthlyInvestment ?? p.sip;

  const fireNumber = ((monthlyExp * 12) / (swr / 100)) * Math.pow(1 + inf / 100, years);
  const projected = fvLump(p.totalInvestments, ret, years) + fvSip(monthlyInv, ret, years * 12);

  let fiAge = null;
  const i = mRate(ret);
  let bal = p.totalInvestments;
  for (let m = 1; m <= (95 - age) * 12; m++) {
    bal = bal * (1 + i) + monthlyInv;
    const yr = m / 12;
    if (bal >= ((monthlyExp * 12) / (swr / 100)) * Math.pow(1 + inf / 100, yr)) {
      fiAge = Number((age + yr).toFixed(1));
      break;
    }
  }

  return {
    scenario, ret, inf, swr, years, retireAge,
    fireNumber: Math.round(fireNumber),
    fireNumberToday: Math.round((monthlyExp * 12) / (swr / 100)),
    projected: Math.round(projected),
    shortfall: Math.round(Math.max(0, fireNumber - projected)),
    requiredMonthly: Math.round(requiredMonthly(fireNumber, p.totalInvestments, ret, years * 12)),
    currentMonthly: Math.round(monthlyInv),
    fiAge,
  };
}

// Compares over a COMMON horizon, which is the only honest way. Comparing
// "debt-free in 3 years" against "₹9L corpus in 5 years" is a category error.
function compareDebtVsInvest({ outstanding, ratePct, emi, extra, returnPct, splitPct = 60, taxDeductible = false, taxRate = 0 }) {
  const effRate = taxDeductible ? ratePct * (1 - taxRate / 100) : ratePct;
  const baseline = amortize(outstanding, ratePct, emi);
  const horizon = Math.min(600, Math.max(Number.isFinite(baseline.months) ? baseline.months : 120, 24));

  const run = (toDebt, toInvest, label, key) => {
    const dr = loanRate(ratePct), ir = mRate(returnPct);
    let debt = outstanding, corpus = 0, interest = 0, freeMonth = horizon, freed = 0;
    const timeline = [];
    for (let m = 1; m <= horizon; m++) {
      if (debt > 0.5) {
        const int = debt * dr;
        interest += int;
        const pay = Math.min(emi + toDebt, debt + int);
        debt = debt + int - pay;
        if (debt <= 0.5) { debt = 0; freeMonth = m; freed = emi + toDebt; }
      }
      corpus = corpus * (1 + ir) + (debt > 0 ? toInvest : toInvest + freed);
      if (m % 3 === 0 || m === horizon) {
        timeline.push({ month: m, year: Number((m / 12).toFixed(2)), debt: Math.round(debt), investments: Math.round(corpus), net: Math.round(corpus - debt) });
      }
    }
    return {
      key, label, toDebt, toInvest, debtFreeMonths: freeMonth,
      totalInterest: Math.round(interest),
      interestSaved: Math.round(baseline.totalInterest - interest),
      corpus: Math.round(corpus), netWorth: Math.round(corpus - debt), timeline,
    };
  };

  const splitDebt = Math.round((extra * splitPct) / 100);
  const options = [
    run(extra, 0, `All ${inr(extra)} to the loan`, "repay"),
    run(0, extra, `All ${inr(extra)} invested`, "invest"),
    run(splitDebt, extra - splitDebt, `${inr(splitDebt)} loan / ${inr(extra - splitDebt)} invested`, "split"),
  ];
  const best = options.reduce((a, b) => (b.netWorth > a.netWorth ? b : a));
  const gap = Math.abs(options[1].netWorth - options[0].netWorth);

  return {
    horizon, options, best, effRate, opportunityCost: gap,
    verdict: best.key === "repay"
      ? `Repaying wins. The loan's ${pct(effRate)} is a certain cost, and beating it after tax and risk is not a reasonable expectation at ${pct(returnPct)}.`
      : best.key === "invest"
      ? `Investing wins on the maths — by ${inr(gap)} over ${months(horizon)} — because ${pct(returnPct)} expected comfortably exceeds the loan's ${pct(effRate)}.`
      : `Splitting wins: it keeps money compounding while still clearing the loan ${best.debtFreeMonths - options[0].debtFreeMonths} months after full repayment would.`,
    caveat: `The loan costs ${pct(effRate)} with contractual certainty. The ${pct(returnPct)} return is an assumption that will not hold in any single year and could be negative for several. Ranking by expected value alone ignores that difference.`,
  };
}

function assessAffordability(d, p, { itemName, price, method = "cash", emiMonths = 0, emiRatePct = 0, downPayment = 0 }) {
  const reasons = [];
  const financed = Math.max(0, price - downPayment);
  const r = emiRatePct / 100 / 12;
  const emi = method === "emi" && emiMonths > 0
    ? (r === 0 ? financed / emiMonths : (financed * r * Math.pow(1 + r, emiMonths)) / (Math.pow(1 + r, emiMonths) - 1))
    : null;

  const cashOut = method === "cash" ? price : downPayment;
  const efAfter = Math.max(0, p.efCover - cashOut);
  const coverAfter = p.living > 0 ? efAfter / p.living : 0;
  const emiRatio = p.income > 0 ? ((p.emi + (emi ?? 0)) / p.income) * 100 : 0;
  const surplusAfter = p.surplus - (emi ?? 0);
  let score = 100;

  if (cashOut > p.liquidSavings) {
    score -= 60;
    reasons.push(`You do not have ${inr(cashOut)} available — liquid savings are ${inr(p.liquidSavings)}.`);
  }
  if (cashOut > 0 && coverAfter < 3) {
    score -= 35;
    reasons.push(`Paying cash drops your emergency cover to ${coverAfter.toFixed(1)} months, below the three-month floor. That is the cost people miss.`);
  } else if (cashOut > 0 && coverAfter < p.efMonthsTarget) {
    score -= 12;
    reasons.push(`Cover falls to ${coverAfter.toFixed(1)} months — still safe, but below your ${p.efMonthsTarget}-month target.`);
  }
  if (emi && emiRatio > 40) {
    score -= 40;
    reasons.push(`EMIs would reach ${pct(emiRatio, 0)} of income — lenders treat 40% as the ceiling for good reason.`);
  } else if (emi && emiRatio > 30) {
    score -= 18;
    reasons.push(`EMIs would reach ${pct(emiRatio, 0)} of income, leaving little room to absorb a shock.`);
  }
  if (surplusAfter < 0) {
    score -= 45;
    reasons.push(`Monthly cash flow turns negative by ${inr(Math.abs(surplusAfter))}.`);
  }
  const toxic = d.debts.filter((x) => x.outstanding > 0 && x.annualInterestRatePct >= TOXIC_RATE);
  if (toxic.length > 0) {
    score -= 30;
    reasons.push(`You still owe ${inr(toxic.reduce((s, x) => s + x.outstanding, 0))} at ${toxic[0].annualInterestRatePct}%. Buying before clearing it is borrowing at that rate in all but name.`);
  }
  if (price > p.income * 6) {
    score -= 10;
    reasons.push(`At ${(price / Math.max(1, p.income)).toFixed(1)}× your monthly income this is a major commitment, not a purchase.`);
  }
  if (reasons.length === 0) {
    reasons.push(`It costs ${(price / Math.max(1, p.income)).toFixed(1)} months of income, your emergency fund stays intact at ${coverAfter.toFixed(1)} months, and cash flow stays positive at ${inr(surplusAfter)}.`);
  }

  const verdict = score >= 75 ? "affordable" : score >= 45 ? "stretch" : "avoid";
  const monthsToSave = p.surplus > 0 ? Math.ceil(price / p.surplus) : null;

  return {
    itemName, price, method, emi: emi ? Math.round(emi) : null, emiMonths,
    verdict, reasons, monthsToSave, emiRatio,
    efAfter: Math.round(efAfter), coverAfter,
    opportunityCost20y: Math.round(fvLump(price, p.expectedReturn, 20)),
    headline: verdict === "affordable" ? `Yes — ${itemName} fits your finances.`
      : verdict === "stretch" ? "You can, but it costs more than the price tag."
      : `Not yet. ${itemName} would break something more important.`,
    betterPlan: verdict === "affordable"
      ? `Pay cash and keep ${inr(p.liquidSavings - cashOut)} liquid. Skip the EMI even if it is "no cost" — the upfront discount usually beats the financing benefit.`
      : monthsToSave
      ? `Save ${inr(p.surplus)}/month for ${monthsToSave} months and buy it outright. Want it in six? That is ${inr(Math.ceil(price / 6))}/month.`
      : "Your surplus does not currently support saving for this. Free up monthly cash flow first.",
  };
}

function simulate(d, p, levers = {}) {
  const L = {
    salaryChangePct: 0, expenseChangePct: 0, extraInvestment: 0, extraDebtPayment: 0,
    returnPct: null, inflationPct: null, jobLossMonths: 0, investmentPauseMonths: 0,
    horizonYears: 10, ...levers,
  };
  const n = Math.round(L.horizonYears * 12);
  const ret = L.returnPct ?? p.expectedReturn;
  const inf = L.inflationPct ?? d.assumptions.inflationPct;
  const ir = mRate(ret);

  let income = p.income * (1 + L.salaryChangePct / 100);
  let expenses = p.living * (1 + L.expenseChangePct / 100);
  let corpus = p.totalInvestments;
  let cash = p.efCover;
  const debts = d.debts.filter((x) => x.outstanding > 0).map((x) => ({ ...x, balance: x.outstanding }));
  let debtFree = debts.length === 0 ? 0 : null;
  let lowestCash = cash, runsOut = false;
  const series = [];

  for (let m = 1; m <= n; m++) {
    if (m > 1 && m % 12 === 1) {
      income *= 1 + d.personal.expectedAnnualSalaryGrowthPct / 100;
      expenses *= 1 + inf / 100;
    }
    const earning = m > L.jobLossMonths;
    let emiOut = 0;
    debts.forEach((x) => {
      if (x.balance <= 0.5) return;
      const int = x.balance * loanRate(x.annualInterestRatePct);
      const pay = Math.min(x.emi, x.balance + int);
      x.balance = x.balance + int - pay;
      emiOut += pay;
    });
    if (earning && L.extraDebtPayment > 0) {
      const t = debts.filter((x) => x.balance > 0.5).sort((a, b) => b.annualInterestRatePct - a.annualInterestRatePct)[0];
      if (t) { const a = Math.min(L.extraDebtPayment, t.balance); t.balance -= a; emiOut += a; }
    }
    if (debtFree === null && debts.every((x) => x.balance <= 0.5)) debtFree = m;

    const investing = m > L.investmentPauseMonths && earning;
    const sip = investing ? p.sip + L.extraInvestment : 0;
    corpus = corpus * (1 + ir) + sip;
    cash += (earning ? income : 0) - expenses - emiOut - sip;
    if (cash < 0) {
      // A shortfall gets covered by liquidating investments — the real outcome.
      corpus = Math.max(0, corpus + cash);
      cash = 0;
      runsOut = true;
    }
    lowestCash = Math.min(lowestCash, cash);
    const debtTotal = debts.reduce((s, x) => s + Math.max(0, x.balance), 0);
    if (m % 3 === 0 || m === n) {
      series.push({
        month: m, year: Number((m / 12).toFixed(2)),
        netWorth: Math.round(corpus + cash - debtTotal),
        investments: Math.round(corpus), debt: Math.round(debtTotal), cash: Math.round(cash),
      });
    }
  }

  const debtRemaining = debts.reduce((s, x) => s + Math.max(0, x.balance), 0);
  const netWorth = corpus + cash - debtRemaining;
  return {
    netWorth: Math.round(netWorth),
    netWorthReal: Math.round(netWorth / Math.pow(1 + inf / 100, L.horizonYears)),
    corpus: Math.round(corpus), debtRemaining: Math.round(debtRemaining),
    debtFree, cash: Math.round(cash), runsOut, lowestCash: Math.round(lowestCash), series,
  };
}

function analysePortfolio(d, p) {
  const total = p.totalInvestments;
  const share = (fn) => total > 0 ? (d.investments.filter((x) => fn(x.kind)).reduce((s, x) => s + x.currentValue, 0) / total) * 100 : 0;
  const equityPct = p.equitySharePct;
  const goldPct = share((k) => k === "gold" || k === "digital_gold");
  const illiquidPct = share((k) => ILLIQUID.includes(k));
  const suggested = Math.max(20, Math.min(90, 100 - d.personal.age + { conservative: -15, moderate: 0, aggressive: 10 }[d.personal.riskTolerance]));
  const holdings = d.investments.map((x) => ({
    ...x, sharePct: total > 0 ? (x.currentValue / total) * 100 : 0,
  })).sort((a, b) => b.currentValue - a.currentValue);
  const largest = holdings.length ? holdings[0].sharePct : 0;

  const notes = [];
  if (total === 0) notes.push("No investments recorded yet, so there is nothing to analyse.");
  else {
    const drift = equityPct - suggested;
    if (drift < -12) notes.push(`Equity is ${pct(equityPct, 0)} against a ${suggested}% guide for age ${d.personal.age}. At your horizon, being too defensive costs more than volatility does.`);
    else if (drift > 12) notes.push(`Equity is ${pct(equityPct, 0)} against a ${suggested}% guide. Fine if you can hold through a 40% drawdown without selling — that is the real test.`);
    else notes.push(`Equity at ${pct(equityPct, 0)} sits close to the ${suggested}% guide for your age and risk appetite.`);
    if (largest > 50) notes.push(`${pct(largest, 0)} in a single holding is concentration risk you are not paid to take.`);
    if (illiquidPct > 40) notes.push(`${pct(illiquidPct, 0)} is locked in PPF, EPF or NPS — good for retirement, useless before it.`);
    if (goldPct > 20) notes.push(`Gold at ${pct(goldPct, 0)} is above the 5–10% most allocations use as a hedge.`);
  }
  return { total, equityPct, goldPct, illiquidPct, debtPct: Math.max(0, 100 - equityPct - goldPct), suggested, holdings, largest, notes };
}

/* ---------------------------------------------------------------- */
/* Recommendation engine                                             */
/*                                                                   */
/* Rules produce candidates; ranking is severity × log(impact) ×     */
/* confidence, so a small-rupee action on a burning problem outranks */
/* a large-rupee action on a comfortable one. Every rule answers     */
/* three questions or it does not ship: what do I do, why does it    */
/* beat the alternative, and what is it worth in rupees.             */
/* ---------------------------------------------------------------- */

const SEVERITY = { critical: 1000, high: 100, medium: 10, low: 1 };
const CONFIDENCE_W = { high: 1, medium: 0.85, modelled: 0.7 };

function recommend(d, p, health) {
  const out = [];
  const live = d.debts.filter((x) => x.outstanding > 0);
  const taxRate = d.assumptions.marginalTaxRatePct;
  const surplus = Math.max(0, p.surplus);
  const comp = (k) => health.components.find((c) => c.key === k);

  if (p.surplus < 0) {
    out.push({
      id: "cashflow_negative", title: "Close the monthly gap before anything else",
      priority: "critical", category: "protect", confidence: "high",
      action: `Find ${inr(Math.abs(p.surplus))}/month by cutting variable spending or pausing a SIP.`,
      reason: `You spend ${inr(Math.abs(p.surplus))} more than you earn each month. Every other recommendation assumes money is available to direct; right now it is being borrowed or drawn from savings.`,
      impact: `Stops an annual drain of ${inr(Math.abs(p.surplus) * 12)}`,
      impactValue: Math.abs(p.surplus) * 12, monthlyAmount: Math.abs(p.surplus),
      scoreGain: comp("cashFlow")?.headroom ?? 5,
    });
  }

  if (p.efMonths < 1) {
    out.push({
      id: "survival_buffer", title: "Build one month of cash cover immediately",
      priority: "critical", category: "protect", confidence: "high",
      action: `Move ${inr(Math.max(0, p.living - p.efCover))} into an instant-access account before investing another rupee.`,
      reason: `You hold ${p.efMonths.toFixed(1)} months of expenses in cash. Without a buffer a routine surprise becomes credit-card debt at ${TOXIC_RATE}%+, which undoes years of investment gains.`,
      impact: `Avoids borrowing at ${TOXIC_RATE}%+ for ordinary shocks`,
      impactValue: p.living * 0.18 * 12, monthlyAmount: null,
      scoreGain: Math.min(8, comp("emergencyFund")?.headroom ?? 0),
    });
  }

  live.filter((x) => x.annualInterestRatePct >= TOXIC_RATE).forEach((x) => {
    const extra = Math.max(2000, Math.round(surplus * 0.5));
    const im = prepaymentImpact(x.outstanding, x.annualInterestRatePct, x.emi, extra, x.prepaymentPenaltyPct);
    out.push({
      id: `toxic_debt_${x.id}`, title: `Attack ${x.name} at ${x.annualInterestRatePct}%`,
      priority: "critical", category: "reduce_debt", confidence: "high",
      action: `Add ${inr(extra)}/month on top of the ${inr(x.emi)} EMI.`,
      reason: `At ${x.annualInterestRatePct}% this is the most expensive money you hold. Clearing it is a guaranteed, tax-free ${x.annualInterestRatePct}% return — no investment offers that with certainty.`,
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
      action: `Automate ${inr(monthly)}/month into a liquid fund — funded in about ${Math.ceil(p.efGap / monthly)} months.`,
      reason: `You have ${p.efMonths.toFixed(1)} months of cover against a ${p.efMonthsTarget}-month target sized for your ${d.personal.employmentType.replace(/_/g, " ")} income and ${d.personal.dependents} dependents.`,
      impact: `Protects ${inr(p.totalInvestments)} of investments from being sold in a downturn`,
      impactValue: p.efGap * 0.5, monthlyAmount: monthly,
      scoreGain: comp("emergencyFund")?.headroom ?? 0,
    });
  }

  live.filter((x) => x.annualInterestRatePct < TOXIC_RATE).forEach((x) => {
    const eff = effectiveDebtRate(x.annualInterestRatePct, x.taxDeductible, taxRate);
    const spread = eff - p.hurdle;
    if (spread <= 0) return;
    const extra = Math.max(1000, Math.round(surplus * 0.25));
    const im = prepaymentImpact(x.outstanding, x.annualInterestRatePct, x.emi, extra, x.prepaymentPenaltyPct);
    out.push({
      id: `prepay_${x.id}`, title: `Prepay ${x.name} ahead of investing more`,
      priority: spread > 3 ? "high" : "medium", category: "reduce_debt", confidence: "high",
      action: `Direct ${inr(extra)}/month extra to this loan.`,
      reason: `It costs ${pct(eff)}${x.taxDeductible ? " after tax relief" : ""} with certainty, against an investment hurdle of ${pct(p.hurdle)} after tax and risk. That ${spread.toFixed(1)}-point gap is real money.`,
      impact: `Saves ${inr(im.net)} of interest, ${im.monthsSaved} months earlier`,
      impactValue: im.net, monthlyAmount: extra,
      scoreGain: (comp("debt")?.headroom ?? 0) * 0.6,
    });
  });

  if (p.emiToIncomePct > 40) {
    out.push({
      id: "emi_burden", title: "Your EMI load is above what lenders consider safe",
      priority: "high", category: "reduce_debt", confidence: "medium",
      action: "Consolidate or refinance the highest-rate loan, or extend tenure on the cheapest one to free monthly cash.",
      reason: `EMIs take ${pct(p.emiToIncomePct, 0)} of income against a 40% ceiling. This leaves no capacity to absorb a shock and will block future borrowing.`,
      impact: `Frees up to ${inr(p.emi - (p.income * 40) / 100)}/month of committed cash flow`,
      impactValue: Math.max(0, p.emi * 12 * 0.1), monthlyAmount: null,
      scoreGain: (comp("debt")?.headroom ?? 0) * 0.4,
    });
  }

  if (p.efMonths >= 3 && surplus > 1000) {
    const bump = Math.round(Math.max(1000, surplus * 0.5) / 500) * 500;
    const yrs = Math.min(25, Math.max(10, d.assumptions.retirementAge - d.personal.age));
    const gain = fvSip(bump, p.expectedReturn, yrs * 12);
    out.push({
      id: "increase_sip", title: `Increase your monthly investing by ${inr(bump)}`,
      priority: p.investmentRatePct < 15 ? "high" : "medium", category: "grow", confidence: "modelled",
      action: `Raise your SIP from ${inr(p.sip)} to ${inr(p.sip + bump)}/month.`,
      reason: `You invest ${pct(p.investmentRatePct)} of income and have ${inr(surplus)} uncommitted each month. With your emergency fund at ${p.efMonths.toFixed(1)} months, this money has no better job than compounding.`,
      impact: `About ${inrShort(gain)} extra over ${yrs} years at an assumed ${pct(p.expectedReturn)}`,
      impactValue: gain * 0.25, monthlyAmount: bump,
      scoreGain: comp("investmentRate")?.headroom ?? 0,
    });
  }

  if (p.sip > 0 && d.personal.expectedAnnualSalaryGrowthPct >= 5) {
    const flat = fvSip(p.sip, p.expectedReturn, 240);
    let stepped = 0, c = p.sip;
    const i = mRate(p.expectedReturn);
    for (let y = 0; y < 20; y++) { for (let m = 0; m < 12; m++) stepped = stepped * (1 + i) + c; c *= 1.1; }
    out.push({
      id: "step_up_sip", title: "Set your SIP to rise 10% every year",
      priority: "medium", category: "grow", confidence: "modelled",
      action: "Enable an annual step-up so your SIP grows with your salary automatically.",
      reason: `Your income is expected to grow ${d.personal.expectedAnnualSalaryGrowthPct}% a year but your ${inr(p.sip)} SIP is flat. A step-up captures raises before lifestyle absorbs them, and needs one decision rather than twenty.`,
      impact: `About ${inrShort(stepped - flat)} more over 20 years than keeping the SIP flat`,
      impactValue: (stepped - flat) * 0.15, monthlyAmount: null, scoreGain: 2,
    });
  }

  const ins = comp("insurance");
  if (ins && ins.improvement) {
    out.push({
      id: "insurance_gap",
      title: d.personal.healthInsuranceCover <= 0 ? "You have no health cover" : "Close your insurance gap",
      priority: d.personal.healthInsuranceCover <= 0 ? "high" : "medium",
      category: "protect", confidence: "high", action: ins.improvement,
      reason: `A single hospitalisation can cost more than your entire ${inr(p.liquidSavings)} in liquid savings. Insurance is the cheapest way to stop one bad month resetting a decade of progress.`,
      impact: `Protects ${inr(p.netWorth)} of net worth for a few thousand rupees a year`,
      impactValue: Math.min(p.netWorth * 0.3, 500000), monthlyAmount: null, scoreGain: ins.headroom,
    });
  }

  d.goals.forEach((g) => {
    const a = analyseGoal(g);
    if (a.status === "on_track" || a.status === "achieved") return;
    out.push({
      id: `goal_${g.id}`,
      title: `${g.name} is ${a.status === "at_risk" ? "not reachable" : "behind"} on the current plan`,
      priority: g.priority === "must_have" ? "high" : "low", category: "plan", confidence: "modelled",
      action: a.fix ?? `Increase contributions toward ${g.name}.`,
      reason: `${a.verdict} You are ${a.monthsRemaining} months from the target date with ${pct(a.progressPct, 0)} funded.`,
      impact: `Closes a ${inr(a.shortfall)} gap`,
      impactValue: a.shortfall * 0.3, monthlyAmount: a.monthlyShortfall || null,
      scoreGain: (comp("goalProgress")?.headroom ?? 0) / Math.max(1, d.goals.length),
    });
  });

  const idle = p.efCover - p.efTarget;
  if (idle > p.living && p.efMonths > 3) {
    const drag = (idle * (p.expectedReturn - d.assumptions.savingsAccountReturnPct)) / 100;
    out.push({
      id: "idle_cash", title: `${inr(idle)} is sitting idle above your emergency target`,
      priority: "medium", category: "optimise", confidence: "medium",
      action: `Deploy ${inr(idle)} — long-horizon money into equity, anything needed within three years into a short-duration debt fund.`,
      reason: `Cash beyond your ${p.efMonthsTarget}-month target earns about ${d.assumptions.savingsAccountReturnPct}% while inflation runs at ${d.assumptions.inflationPct}%. It loses purchasing power every month it stays there.`,
      impact: `Roughly ${inr(drag)} a year of foregone return`,
      impactValue: drag, monthlyAmount: null, scoreGain: 1.5,
    });
  }

  if (p.totalInvestments > 100000) {
    const big = [...d.investments].sort((a, b) => b.currentValue - a.currentValue)[0];
    if (big && big.currentValue / p.totalInvestments > 0.6) {
      const share = (big.currentValue / p.totalInvestments) * 100;
      out.push({
        id: "concentration", title: `${pct(share, 0)} of your portfolio sits in one holding`,
        priority: "medium", category: "optimise", confidence: "medium",
        action: `Direct new investments elsewhere until ${big.name} falls below 40% of the portfolio.`,
        reason: `${big.name} is ${inr(big.currentValue)} of a ${inr(p.totalInvestments)} portfolio. Concentration widens the range of outcomes without raising expected return — the one risk you are not paid to take.`,
        impact: "Reduces the chance of a single holding derailing your plan",
        impactValue: big.currentValue * 0.05, monthlyAmount: null, scoreGain: 1,
      });
    }
  }

  const ranked = out
    .map((r) => ({ ...r, _r: SEVERITY[r.priority] * Math.log10(Math.max(10, r.impactValue)) * CONFIDENCE_W[r.confidence] }))
    .sort((a, b) => b._r - a._r);

  // Rules generate independently, so their monthly asks can add up to more
  // money than the user actually has. Advice you cannot all follow is worse
  // than less advice — it makes the whole list feel invented. So walk the
  // ranked list spending a real budget, and mark the rest as sequenced.
  let budget = surplus;
  return ranked.map((r, i) => {
    const base = { ...r, rank: i + 1, deferred: false };
    if (!r.monthlyAmount || r.monthlyAmount <= 0) return base;
    if (budget <= 0) {
      return {
        ...base, deferred: true,
        priority: r.priority === "critical" ? r.priority : "medium",
        action: `${r.action} Start this once the actions above are funded — your ${inr(surplus)} monthly surplus is committed until then.`,
      };
    }
    if (r.monthlyAmount > budget) {
      const trimmed = Math.max(500, Math.floor(budget / 500) * 500);
      budget = 0;
      return {
        ...base, monthlyAmount: trimmed,
        action: `${r.action} Cap it at ${inr(trimmed)} this month — that is all your budget currently frees up.`,
      };
    }
    budget -= r.monthlyAmount;
    return base;
  });
}

function generateAlerts(d, p) {
  const a = [];
  const hist = d.history ?? [];
  const last = hist[hist.length - 1], prev = hist[hist.length - 2];

  if (p.efMonths < 3) {
    a.push({
      id: "ef", severity: p.efMonths < 1 ? "danger" : "warning",
      title: `Emergency fund covers ${p.efMonths.toFixed(1)} months`,
      detail: `Below the three-month floor. Add ${inr(p.efGap)} to reach your target.`,
    });
  }

  d.debts.filter((x) => x.outstanding > 0 && x.annualInterestRatePct >= TOXIC_RATE).forEach((x) =>
    a.push({
      id: `rate_${x.id}`, severity: "danger",
      title: `${x.name} charges ${x.annualInterestRatePct}%`,
      detail: `Costing about ${inr((x.outstanding * x.annualInterestRatePct) / 100 / 12)} in interest this month alone.`,
    }));

  if (p.emiToIncomePct > 40) {
    a.push({
      id: "emi", severity: "warning",
      title: `EMIs take ${pct(p.emiToIncomePct, 0)} of your income`,
      detail: "Above the 40% level lenders treat as the safe ceiling.",
    });
  }

  if (prev && last) {
    const change = ((last.expenses - prev.expenses) / Math.max(1, prev.expenses)) * 100;
    if (change > 10) {
      a.push({
        id: "exp", severity: "warning",
        title: `Spending rose ${pct(change, 0)} last month`,
        detail: `If it holds, annual savings fall by about ${inr((last.expenses - prev.expenses) * 12)}.`,
      });
    }
  }

  if (p.efCover > p.efTarget + p.living * 2) {
    a.push({
      id: "cash", severity: "info",
      title: "Unusually high cash balance",
      detail: `${inr(p.efCover - p.efTarget)} above your emergency target earns ${d.assumptions.savingsAccountReturnPct}% while inflation runs at ${d.assumptions.inflationPct}%.`,
    });
  }

  const subs = d.cashFlow.expenses.subscriptions + d.cashFlow.expenses.entertainment;
  if (subs > p.income * 0.1) {
    a.push({
      id: "subs", severity: "info",
      title: "Subscriptions and entertainment are above 10% of income",
      detail: `${inr(subs)}/month. Redirecting half would add about ${inrShort(fvSip(subs / 2, p.expectedReturn, 120))} over ten years.`,
    });
  }

  d.goals.forEach((g) => {
    const an = analyseGoal(g);
    if (an.status === "at_risk") {
      a.push({
        id: `g_${g.id}`, severity: "warning",
        title: `${g.name} is off track`,
        detail: `Projected to land ${inr(an.shortfall)} short. Needs ${inr(an.requiredMonthly)}/month, currently getting ${inr(g.monthlyContribution)}.`,
      });
    }
  });

  const order = { danger: 0, warning: 1, info: 2 };
  return a.sort((x, y) => order[x.severity] - order[y.severity]);
}

/* ---------------------------------------------------------------- */
/* Demo user — Ananya Rao, 24, Bengaluru                             */
/*                                                                   */
/* Deliberately typical: not broke, not wealthy, doing several       */
/* things roughly right and one thing clearly wrong. If the engine   */
/* cannot produce a non-obvious, correct recommendation for her, it  */
/* is not worth shipping.                                            */
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
    age: 24, city: "Bengaluru", cityTier: 1, dependents: 0,
    employmentType: "salaried_private", expectedAnnualSalaryGrowthPct: 10,
    riskTolerance: "moderate", lifeInsuranceCover: 0, healthInsuranceCover: 300000,
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
    { id: "i1", name: "Nifty 50 index fund", kind: "equity_mutual_fund", currentValue: 62000, monthlyContribution: 5000, expectedAnnualReturnPct: 12, lockInMonths: 0 },
    { id: "i2", name: "EPF", kind: "epf", currentValue: 31000, monthlyContribution: 1800, expectedAnnualReturnPct: 8.25, lockInMonths: 420 },
    { id: "i3", name: "Digital gold", kind: "digital_gold", currentValue: 7000, monthlyContribution: 0, expectedAnnualReturnPct: 8, lockInMonths: 0 },
  ],
  debts: [
    { id: "d1", name: "Personal loan", kind: "personal_loan", originalPrincipal: 250000, outstanding: 178000, annualInterestRatePct: 12, emi: 8000, remainingTenureMonths: 25, prepaymentPenaltyPct: 2, taxDeductible: false },
    { id: "d2", name: "Credit card balance", kind: "credit_card", originalPrincipal: 22000, outstanding: 22000, annualInterestRatePct: 42, emi: 2500, remainingTenureMonths: 10, prepaymentPenaltyPct: 0, taxDeductible: false },
  ],
  assets: [],
  goals: [
    { id: "g1", name: "Emergency fund", kind: "emergency_fund", targetAmount: 180000, currentAmount: 110000, targetDate: monthsFromNow(12), monthlyContribution: 3000, expectedAnnualReturnPct: 6, priority: "must_have" },
    { id: "g2", name: "Bike upgrade", kind: "car", targetAmount: 180000, currentAmount: 25000, targetDate: monthsFromNow(24), monthlyContribution: 2000, expectedAnnualReturnPct: 7, priority: "nice_to_have" },
    { id: "g3", name: "Higher studies fund", kind: "education", targetAmount: 1500000, currentAmount: 40000, targetDate: monthsFromNow(60), monthlyContribution: 4000, expectedAnnualReturnPct: 11, priority: "should_have" },
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
  return (
    <div
      className={`rounded-xl ${pad} ${className}`}
      style={{ background: C.card, border: `1px solid ${C.rule}`, ...style }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold" style={{ color: C.ink, letterSpacing: "-0.01em" }}>
        {children}
      </h2>
      {sub && <p className="mt-1 text-sm leading-relaxed" style={{ color: C.muted }}>{sub}</p>}
    </div>
  );
}

/** The product's core distinction, made visible everywhere it matters. */
function Certainty({ kind }) {
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

function Meter({ value, max, color = C.sure, height = 6, track = C.rule }) {
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height, background: track }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, (value / max) * 100))}%`, background: color }}
      />
    </div>
  );
}

function NumberField({ label, value, onChange, min = 0, max, step = 500, prefix = "₹", hint }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs" style={{ color: C.muted }}>{label}</span>
        <span className="text-sm font-medium" style={{ ...NUM, color: C.ink }}>
          {prefix === "₹" ? inr(value) : `${value}${prefix}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full cursor-pointer"
        style={{ accentColor: C.ink }}
      />
      {hint && <div className="text-xs" style={{ color: C.faint }}>{hint}</div>}
    </label>
  );
}

function Toggle({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg p-0.5" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              background: active ? C.card : "transparent",
              color: active ? C.ink : C.muted,
              boxShadow: active ? "0 1px 2px rgba(22,32,46,0.08)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Assumptions({ items }) {
  return (
    <p className="mt-4 text-xs leading-relaxed" style={{ color: C.faint }}>
      {items.join(" · ")}
    </p>
  );
}

const chartAxis = { fontSize: 11, fill: C.faint };

function ChartTip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: C.ink, color: "#fff", ...NUM }}
    >
      <div style={{ color: "#9FB1C6" }}>{label}</div>
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
/* DECIDE — the heart of the product                                  */
/* ================================================================== */

function AllocationWaterfall({ allocation }) {
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
              borderRight: i < allocation.buckets.length - 1 ? "2px solid #fff" : "none",
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
  const [windfall, setWindfall] = useState(100000);
  const windfallPlan = useMemo(
    () => allocate(data, profile, windfall, "windfall"),
    [data, profile, windfall]
  );
  const top = recs[0];

  return (
    <div className="space-y-6">
      {/* Hero: the single most valuable thing we can say right now. */}
      <div className="rounded-xl p-6 sm:p-7" style={{ background: C.ink, color: "#fff" }}>
        <p className="text-sm" style={{ color: "#9FB1C6" }}>
          The thing currently shaping your money
        </p>
        <p className="mt-1 text-lg font-medium" style={{ color: "#fff" }}>
          {allocation.constraint}
        </p>

        {top && (
          <div className="mt-6 border-t pt-5" style={{ borderColor: "#2C3D53" }}>
            <div className="flex items-baseline gap-3">
              <span
                className="rounded px-2 py-0.5 text-xs font-semibold"
                style={{ background: URGENCY_COLOR[top.priority], color: "#fff" }}
              >
                Do this first
              </span>
              {top.monthlyAmount && (
                <span className="text-sm" style={{ ...NUM, color: "#9FB1C6" }}>
                  {inr(top.monthlyAmount)}/month
                </span>
              )}
            </div>
            <h1
              className="mt-3 text-2xl font-semibold sm:text-3xl"
              style={{ letterSpacing: "-0.025em", lineHeight: 1.15 }}
            >
              {top.action}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "#C3D0DE" }}>
              {top.reason}
            </p>
            <p className="mt-3 text-sm font-medium" style={{ color: "#5FD9C0" }}>
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
              <div key={a.id} className="rounded-lg p-3" style={{ background: tone.bg }}>
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
          <p className="text-sm" style={{ color: C.muted }}>{allocation.notes[0]}</p>
        )}
        <Assumptions items={allocation.notes} />
      </Card>

      <Card>
        <SectionTitle sub="Every action, ranked by what it is worth to you rather than by category.">
          What should I do?
        </SectionTitle>
        <ol className="space-y-0">
          {recs.map((r, i) => (
            <li
              key={r.id}
              className="flex gap-4 py-4"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}
            >
              <span
                className="mt-0.5 text-sm font-semibold tabular-nums"
                style={{ color: C.faint, minWidth: "1.25rem" }}
              >
                {r.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium" style={{ color: C.ink }}>{r.title}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{ color: URGENCY_COLOR[r.priority], background: C.paper }}
                  >
                    {r.priority}
                  </span>
                  {r.deferred && (
                    <span className="text-xs" style={{ color: C.faint }}>queued</span>
                  )}
                </div>
                <p className="mt-1.5 text-sm font-medium leading-relaxed" style={{ color: C.ink2 }}>
                  {r.action}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: C.muted }}>
                  {r.reason}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span style={{ color: r.confidence === "high" ? C.sure : C.model }}>{r.impact}</span>
                  {r.scoreGain >= 0.5 && (
                    <span className="text-xs" style={{ color: C.faint }}>
                      +{r.scoreGain.toFixed(1)} score points
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <SectionTitle sub="Money that arrives outside your salary is where the biggest mistakes happen — it usually gets spent before it gets decided on.">
          What should I do with a windfall?
        </SectionTitle>
        <div className="mb-5 max-w-md">
          <NumberField
            label="Amount received"
            value={windfall}
            onChange={setWindfall}
            min={5000}
            max={2000000}
            step={5000}
          />
        </div>
        <AllocationWaterfall allocation={windfallPlan} />
      </Card>
    </div>
  );
}

/* ================================================================== */
/* HEALTH                                                             */
/* ================================================================== */

const STATUS_COLOR = { strong: C.sure, fair: C.ink2, weak: C.warn, critical: C.danger };

function HealthTab({ health, profile }) {
  const next = health.total < 70 ? 70 : health.total < 80 ? 80 : health.total < 90 ? 90 : 100;
  const gap = next - health.total;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="shrink-0">
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-5xl font-semibold"
                style={{ ...NUM, color: C.ink, letterSpacing: "-0.04em" }}
              >
                {health.total}
              </span>
              <span className="text-lg" style={{ color: C.faint }}>/100</span>
            </div>
            <p className="mt-1 text-sm font-medium" style={{ color: C.ink2 }}>{health.label}</p>
          </div>
          <div className="flex-1">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: C.rule }}>
              {health.components.map((c) => (
                <div
                  key={c.key}
                  style={{
                    width: `${c.max}%`,
                    background: `linear-gradient(to right, ${STATUS_COLOR[c.status]} ${c.ratio * 100}%, transparent ${c.ratio * 100}%)`,
                    borderRight: "2px solid #fff",
                  }}
                  title={`${c.label}: ${c.score}/${c.max}`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs" style={{ color: C.faint }}>
              Each segment is one component, sized by its weight and filled by your score.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle sub="Weighted so that the things that can actually ruin you — no cash buffer, expensive debt, no insurance — count for more than the things that merely slow you down.">
          Where the points come from
        </SectionTitle>
        <div className="space-y-4">
          {health.components.map((c) => (
            <div key={c.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium" style={{ color: C.ink }}>{c.label}</span>
                <span className="text-sm" style={{ ...NUM, color: STATUS_COLOR[c.status] }}>
                  {c.score} / {c.max}
                </span>
              </div>
              <div className="mt-1.5">
                <Meter value={c.ratio} max={1} color={STATUS_COLOR[c.status]} />
              </div>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: C.muted }}>{c.detail}</p>
              {c.improvement && (
                <p className="mt-1 text-sm" style={{ color: C.ink2 }}>→ {c.improvement}</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {health.path.length > 0 && (
        <Card>
          <SectionTitle sub={`Cheapest points first. These four are worth ${health.path.reduce((s, c) => s + c.headroom, 0).toFixed(0)} points between them.`}>
            How to reach {next}
          </SectionTitle>
          <ol className="space-y-3">
            {health.path.map((c, i) => (
              <li key={c.key} className="flex gap-3">
                <span className="text-sm font-semibold tabular-nums" style={{ color: C.faint }}>{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium" style={{ color: C.ink }}>{c.label}</span>
                    <span className="text-sm" style={{ ...NUM, color: C.sure }}>+{c.headroom} pts</span>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed" style={{ color: C.muted }}>{c.improvement}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs" style={{ color: C.faint }}>
            You need {gap.toFixed(0)} more points to reach {next}.
          </p>
        </Card>
      )}
    </div>
  );
}

/* ================================================================== */
/* NET WORTH & PORTFOLIO                                              */
/* ================================================================== */

function NetWorthTab({ data, profile, portfolio }) {
  const history = data.history.map((h) => ({ ...h, name: h.label }));
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const monthly = last && prev ? last.netWorth - prev.netWorth : 0;
  const annual = history.length > 1 ? last.netWorth - history[0].netWorth : 0;

  const assetRows = [
    { label: "Cash and bank", value: data.savings.bankBalance + data.savings.cash },
    { label: "Emergency fund", value: data.savings.emergencyFund },
    { label: "Deposits", value: data.savings.fixedDeposits + data.savings.recurringDeposits + data.savings.otherLiquid },
    { label: "Investments", value: profile.totalInvestments },
  ].filter((r) => r.value > 0);

  const ASSET_COLORS = [C.sure, "#3FA08D", "#7FBFB0", C.model];

  const spend = Object.entries(data.cashFlow.expenses)
    .map(([k, v]) => ({
      name: k === "insurancePremiums" ? "Insurance" : k.charAt(0).toUpperCase() + k.slice(1),
      value: v,
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Net worth" value={inrShort(profile.netWorth)} hint={inr(profile.netWorth)} />
          <Stat label="Total assets" value={inrShort(profile.totalAssets)} tone={C.sure} />
          <Stat label="Total liabilities" value={inrShort(profile.totalLiabilities)} tone={C.danger} />
          <Stat
            label="Change last month"
            value={`${monthly >= 0 ? "+" : "−"}${inrShort(Math.abs(monthly))}`}
            tone={monthly >= 0 ? C.sure : C.danger}
            hint={`${annual >= 0 ? "+" : "−"}${inrShort(Math.abs(annual))} over 12 months`}
          />
        </div>
        <div className="mt-6 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.sure} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.sure} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="name" tick={chartAxis} axisLine={false} tickLine={false} />
              <YAxis tick={chartAxis} axisLine={false} tickLine={false} tickFormatter={inrShort} width={52} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="netWorth" name="Net worth" stroke={C.sure} strokeWidth={2} fill="url(#nw)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>What you own</SectionTitle>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={assetRows} dataKey="value" nameKey="label" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {assetRows.map((r, i) => (
                    <Cell key={r.label} fill={ASSET_COLORS[i % ASSET_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1.5">
            {assetRows.map((r, i) => (
              <li key={r.label} className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-sm" style={{ background: ASSET_COLORS[i % ASSET_COLORS.length] }} />
                <span style={{ color: C.muted }}>{r.label}</span>
                <span className="ml-auto" style={{ ...NUM, color: C.ink }}>{inr(r.value)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle>What you owe</SectionTitle>
          {data.debts.filter((x) => x.outstanding > 0).length === 0 ? (
            <p className="text-sm" style={{ color: C.muted }}>No outstanding debt.</p>
          ) : (
            <ul className="space-y-4">
              {[...data.debts]
                .filter((x) => x.outstanding > 0)
                .sort((a, b) => b.annualInterestRatePct - a.annualInterestRatePct)
                .map((x) => {
                  const payoff = monthsToPayoff(x.outstanding, x.annualInterestRatePct, x.emi);
                  const toxic = x.annualInterestRatePct >= TOXIC_RATE;
                  return (
                    <li key={x.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium" style={{ color: C.ink }}>{x.name}</span>
                        <span style={{ ...NUM, color: C.ink }}>{inr(x.outstanding)}</span>
                      </div>
                      <div className="mt-1.5">
                        <Meter
                          value={x.outstanding}
                          max={Math.max(...data.debts.map((y) => y.outstanding))}
                          color={toxic ? C.danger : C.warn}
                          height={5}
                        />
                      </div>
                      <p className="mt-1.5 text-xs" style={{ color: C.muted }}>
                        {x.annualInterestRatePct}% · {inr(x.emi)}/month · clear in{" "}
                        {Number.isFinite(payoff) ? months(payoff) : "never at this payment"}
                        {toxic && " · costs more than any investment reliably earns"}
                      </p>
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle sub={`Equity ${pct(portfolio.equityPct, 0)} against a ${portfolio.suggested}% guide for your age and risk appetite.`}>
            Portfolio
          </SectionTitle>
          <ul className="space-y-3">
            {portfolio.holdings.map((h) => (
              <li key={h.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span style={{ color: C.ink }}>{h.name}</span>
                  <span style={{ ...NUM, color: C.ink }}>{inr(h.currentValue)}</span>
                </div>
                <div className="mt-1">
                  <Meter value={h.sharePct} max={100} color={C.model} height={5} />
                </div>
                <div className="mt-1 text-xs" style={{ color: C.faint }}>
                  {pct(h.sharePct, 0)} of portfolio · {inr(h.monthlyContribution)}/month · assumed {pct(h.expectedAnnualReturnPct)}
                  {ILLIQUID.includes(h.kind) && " · locked"}
                </div>
              </li>
            ))}
          </ul>
          <ul className="mt-4 space-y-1.5">
            {portfolio.notes.map((n, i) => (
              <li key={i} className="text-sm leading-relaxed" style={{ color: C.muted }}>{n}</li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle sub={`${inr(profile.living)} of living costs plus ${inr(profile.emi)} of EMIs against ${inr(profile.income)} of income.`}>
            Where the money goes
          </SectionTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spend} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.rule} horizontal={false} />
                <XAxis type="number" tick={chartAxis} axisLine={false} tickLine={false} tickFormatter={inrShort} />
                <YAxis type="category" dataKey="name" tick={chartAxis} axisLine={false} tickLine={false} width={78} />
                <Tooltip content={<ChartTip />} cursor={{ fill: C.paper }} />
                <Bar dataKey="value" name="Monthly" fill={C.ink2} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================== */
/* GOALS                                                              */
/* ================================================================== */

const GOAL_STATUS = {
  achieved: { label: "Funded", color: C.sure },
  on_track: { label: "On track", color: C.sure },
  behind: { label: "Behind", color: C.warn },
  at_risk: { label: "Not reachable", color: C.danger },
};

function GoalsTab({ data, profile }) {
  const goals = data.goals.map(analyseGoal);

  return (
    <div className="space-y-6">
      {goals.map((g) => {
        const s = GOAL_STATUS[g.status];
        const chart = [
          { name: "Saved", value: g.currentAmount },
          { name: "Projected", value: Math.max(0, g.projected - g.currentAmount) },
          { name: "Shortfall", value: g.shortfall },
        ];
        return (
          <Card key={g.id}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold" style={{ color: C.ink }}>{g.name}</h3>
              <span
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ color: s.color, background: C.paper }}
              >
                {s.label}
              </span>
              <span className="ml-auto text-sm" style={{ ...NUM, color: C.muted }}>
                {inr(g.currentAmount)} of {inr(g.targetAmount)}
              </span>
            </div>

            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: C.rule }}>
              <div style={{ width: `${Math.min(100, g.progressPct)}%`, background: C.sure }} />
              <div
                style={{
                  width: `${Math.max(0, Math.min(100 - g.progressPct, (g.projected - g.currentAmount) / g.targetAmount * 100))}%`,
                  background: C.model,
                  opacity: 0.5,
                }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs" style={{ color: C.faint }}>
              <span>{pct(g.progressPct, 0)} saved</span>
              <span>{g.monthsRemaining} months left</span>
              <span>assumed {pct(g.expectedAnnualReturnPct)} return</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Contributing" value={inr(g.monthlyContribution)} hint="per month" />
              <Stat
                label="Required"
                value={inr(g.requiredMonthly)}
                hint="per month to hit the date"
                tone={g.monthlyShortfall > 0 ? C.warn : C.sure}
              />
              <Stat label="Projected" value={inrShort(g.projected)} tone={C.model} hint="at current pace" />
              <Stat
                label="Gap"
                value={g.shortfall > 0 ? inrShort(g.shortfall) : "—"}
                tone={g.shortfall > 0 ? C.danger : C.sure}
              />
            </div>

            <p className="mt-4 text-sm leading-relaxed" style={{ color: C.ink2 }}>{g.verdict}</p>
            {g.fix && (
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: C.muted }}>{g.fix}</p>
            )}
          </Card>
        );
      })}

      <Card>
        <SectionTitle sub="Goals compete with each other and with your debt. The Decide tab reconciles them into one plan rather than treating each in isolation.">
          A note on competing goals
        </SectionTitle>
        <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
          Your goals ask for{" "}
          <span style={{ ...NUM, color: C.ink }}>
            {inr(data.goals.reduce((s, g) => s + g.monthlyContribution, 0))}
          </span>{" "}
          a month in total, and reaching every one on time would need{" "}
          <span style={{ ...NUM, color: C.ink }}>
            {inr(goals.reduce((s, g) => s + g.requiredMonthly, 0))}
          </span>
          . Your income currently leaves {inr(Math.max(0, profile.surplus))} uncommitted, so the
          difference has to come from a later date, a smaller target, or a larger income — not from
          optimism.
        </p>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* DEBT vs INVEST                                                     */
/* ================================================================== */

function DebtVsInvestTab({ data, profile }) {
  const firstDebt = data.debts.find((x) => x.outstanding > 0);
  const [outstanding, setOutstanding] = useState(firstDebt ? firstDebt.outstanding : 500000);
  const [ratePct, setRatePct] = useState(firstDebt ? firstDebt.annualInterestRatePct : 12);
  const [emi, setEmi] = useState(firstDebt ? firstDebt.emi : 12000);
  const [extra, setExtra] = useState(15000);
  const [returnPct, setReturnPct] = useState(Math.round(profile.expectedReturn));
  const [splitPct, setSplitPct] = useState(60);

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
        <SectionTitle sub="Both options are run to the same month and scored on net worth. Comparing “debt-free in 3 years” against “₹9 lakh corpus in 5 years” is a category error.">
          Should I repay the loan or invest?
        </SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Outstanding balance" value={outstanding} onChange={setOutstanding} min={10000} max={5000000} step={10000} />
          <NumberField label="Interest rate" value={ratePct} onChange={setRatePct} min={1} max={45} step={0.5} prefix="%" />
          <NumberField label="Current EMI" value={emi} onChange={setEmi} min={1000} max={200000} step={500} />
          <NumberField label="Spare money each month" value={extra} onChange={setExtra} min={1000} max={200000} step={1000} />
          <NumberField label="Assumed investment return" value={returnPct} onChange={setReturnPct} min={1} max={20} step={0.5} prefix="%" />
          <NumberField label="Split: share to the loan" value={splitPct} onChange={setSplitPct} min={0} max={100} step={5} prefix="%" />
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
                {winner && (
                  <span className="text-xs font-medium" style={{ color: OPT_COLOR[o.key] }}>best</span>
                )}
              </div>
              <div className="mt-4 space-y-3">
                <Stat label={`Net worth after ${months(result.horizon)}`} value={inrShort(o.netWorth)} tone={OPT_COLOR[o.key]} />
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Debt-free in" value={months(o.debtFreeMonths)} />
                  <Stat label="Interest paid" value={inrShort(o.totalInterest)} tone={C.danger} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Investment corpus" value={inrShort(o.corpus)} tone={C.model} />
                  <Stat label="Interest saved" value={o.interestSaved > 0 ? inrShort(o.interestSaved) : "—"} tone={C.sure} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <SectionTitle sub="Net worth over time: investments minus remaining debt, on the same horizon for all three.">
          Comparing the three paths
        </SectionTitle>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="year" tick={chartAxis} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v)}y`} />
              <YAxis tick={chartAxis} axisLine={false} tickLine={false} tickFormatter={inrShort} width={54} />
              <Tooltip content={<ChartTip />} labelFormatter={(v) => `Year ${Number(v).toFixed(1)}`} />
              <ReferenceLine y={0} stroke={C.faint} />
              <Line type="monotone" dataKey="Repay" stroke={C.sure} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Invest" stroke={C.model} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Split" stroke={C.warn} strokeWidth={2} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-5 rounded-lg p-4" style={{ background: C.paper }}>
          <p className="text-sm font-medium leading-relaxed" style={{ color: C.ink }}>{result.verdict}</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: C.muted }}>{result.caveat}</p>
          <p className="mt-2 text-sm" style={{ color: C.ink2 }}>
            Break-even: investing only wins if it returns more than{" "}
            <span style={{ ...NUM }}>{pct(result.effRate)}</span> a year, every year, after tax.
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* GROW — compounding + FIRE                                          */
/* ================================================================== */

function GrowTab({ data, profile }) {
  const [initial, setInitial] = useState(profile.totalInvestments);
  const [monthly, setMonthly] = useState(Math.max(1000, profile.sip));
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(20);
  const [stepUp, setStepUp] = useState(0);
  const inflation = data.assumptions.inflationPct;

  const proj = useMemo(
    () => projectGrowth({ initial, monthly, annualPct: rate, years, stepUpPct: stepUp, inflationPct: inflation }),
    [initial, monthly, rate, years, stepUp, inflation]
  );

  const [scenario, setScenario] = useState("moderate");
  const fire = useMemo(() => calcFire(data, profile, scenario), [data, profile, scenario]);
  const fireAll = useMemo(
    () => ["conservative", "moderate", "aggressive"].map((s) => calcFire(data, profile, s)),
    [data, profile]
  );

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="The grey line is what your money is actually worth once inflation is taken out. That gap is the number most calculators hide.">
          What compounding does
        </SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Starting amount" value={initial} onChange={setInitial} min={0} max={10000000} step={10000} />
          <NumberField label="Monthly investment" value={monthly} onChange={setMonthly} min={500} max={500000} step={500} />
          <NumberField label="Assumed annual return" value={rate} onChange={setRate} min={1} max={20} step={0.5} prefix="%" />
          <NumberField label="Years" value={years} onChange={setYears} min={1} max={40} step={1} prefix=" years" />
          <NumberField label="Annual SIP increase" value={stepUp} onChange={setStepUp} min={0} max={25} step={1} prefix="%" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="You put in" value={inrShort(proj.totalInvested)} hint={inr(proj.totalInvested)} />
          <Stat label="Growth" value={inrShort(proj.returns)} tone={C.model} />
          <Stat label="Final corpus" value={inrShort(proj.finalCorpus)} tone={C.model} hint={inr(proj.finalCorpus)} />
          <Stat
            label="In today's money"
            value={inrShort(proj.real)}
            hint={`after ${inflation}% inflation`}
          />
        </div>

        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={proj.schedule} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="year" tick={chartAxis} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}y`} />
              <YAxis tick={chartAxis} axisLine={false} tickLine={false} tickFormatter={inrShort} width={54} />
              <Tooltip content={<ChartTip />} labelFormatter={(v) => `Year ${v}`} />
              <Area type="monotone" dataKey="invested" name="Your contributions" stackId="1" stroke={C.ink2} fill={C.ink2} fillOpacity={0.85} />
              <Area type="monotone" dataKey="growth" name="Growth" stackId="1" stroke={C.model} fill={C.model} fillOpacity={0.55} />
              <Line type="monotone" dataKey="real" name="Value in today's money" stroke={C.faint} strokeWidth={2} strokeDasharray="4 3" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <Assumptions items={[
          `Assumed return ${pct(rate)} a year`,
          `Assumed inflation ${inflation}%`,
          "Returns are modelled, not promised — real markets do not deliver an average every year",
        ]} />
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle sub="The amount that, withdrawn at a safe rate, covers your living costs forever.">
            Financial independence
          </SectionTitle>
          <Toggle
            value={scenario}
            onChange={setScenario}
            options={[
              { value: "conservative", label: "Conservative" },
              { value: "moderate", label: "Moderate" },
              { value: "aggressive", label: "Aggressive" },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat
            label="Your number"
            value={inrShort(fire.fireNumber)}
            hint={`${inrShort(fire.fireNumberToday)} in today's money`}
            tone={C.ink}
          />
          <Stat label="Projected at 60" value={inrShort(fire.projected)} tone={C.model} />
          <Stat
            label="Shortfall"
            value={fire.shortfall > 0 ? inrShort(fire.shortfall) : "None"}
            tone={fire.shortfall > 0 ? C.danger : C.sure}
          />
          <Stat
            label="Independent at"
            value={fire.fiAge && fire.fiAge < 90 ? `age ${Math.round(fire.fiAge)}` : "not on this path"}
            tone={fire.fiAge && fire.fiAge <= fire.retireAge ? C.sure : C.danger}
          />
        </div>

        {fire.shortfall > 0 && (
          <div className="mt-5 rounded-lg p-4" style={{ background: C.warnBg }}>
            <p className="text-sm leading-relaxed" style={{ color: C.ink }}>
              At {inr(fire.currentMonthly)} a month you reach{" "}
              {inrShort(fire.projected)} of a {inrShort(fire.fireNumber)} target. Closing that gap
              takes <span style={{ ...NUM, fontWeight: 600 }}>{inr(fire.requiredMonthly)}</span> a
              month — about {(fire.requiredMonthly / Math.max(1, fire.currentMonthly)).toFixed(1)}×
              what you invest now. That is not a reason to despair at 24; it is the argument for
              raising the SIP with every salary increase rather than after.
            </p>
          </div>
        )}

        <div className="mt-6 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={fireAll.map((f) => ({
                name: f.scenario.charAt(0).toUpperCase() + f.scenario.slice(1),
                Target: f.fireNumber,
                Projected: f.projected,
              }))}
              margin={{ top: 5, right: 8, left: 0, bottom: 5 }}
            >
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="name" tick={chartAxis} axisLine={false} tickLine={false} />
              <YAxis tick={chartAxis} axisLine={false} tickLine={false} tickFormatter={inrShort} width={54} />
              <Tooltip content={<ChartTip />} cursor={{ fill: C.paper }} />
              <Bar dataKey="Target" fill={C.ink2} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Projected" fill={C.model} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Assumptions items={[
          `Return ${pct(fire.ret)}`,
          `Inflation ${pct(fire.inf)}`,
          `Safe withdrawal ${pct(fire.swr)}`,
          `Retirement age ${fire.retireAge}`,
        ]} />
      </Card>
    </div>
  );
}

/* ================================================================== */
/* WHAT-IF SIMULATOR                                                  */
/* ================================================================== */

const PRESETS = [
  { label: "My salary rises 15%", levers: { salaryChangePct: 15 } },
  { label: "I invest ₹5,000 more", levers: { extraInvestment: 5000 } },
  { label: "I lose my job for 6 months", levers: { jobLossMonths: 6 } },
  { label: "I stop investing for a year", levers: { investmentPauseMonths: 12 } },
  { label: "Inflation hits 9%", levers: { inflationPct: 9 } },
  { label: "I pay ₹6,000 more to debt", levers: { extraDebtPayment: 6000 } },
];

function SimulateTab({ data, profile }) {
  const [levers, setLevers] = useState({
    salaryChangePct: 0, expenseChangePct: 0, extraInvestment: 0, extraDebtPayment: 0,
    inflationPct: data.assumptions.inflationPct, jobLossMonths: 0,
    investmentPauseMonths: 0, horizonYears: 10,
  });
  const set = (k) => (v) => setLevers((s) => ({ ...s, [k]: v }));

  const base = useMemo(
    () => simulate(data, profile, { horizonYears: levers.horizonYears }),
    [data, profile, levers.horizonYears]
  );
  const scenario = useMemo(() => simulate(data, profile, levers), [data, profile, levers]);

  const merged = base.series.map((row, i) => ({
    year: row.year,
    "As things stand": row.netWorth,
    "This scenario": scenario.series[i]?.netWorth ?? 0,
  }));

  const delta = scenario.netWorth - base.netWorth;
  const changed = JSON.stringify(levers) !== JSON.stringify({
    salaryChangePct: 0, expenseChangePct: 0, extraInvestment: 0, extraDebtPayment: 0,
    inflationPct: data.assumptions.inflationPct, jobLossMonths: 0,
    investmentPauseMonths: 0, horizonYears: levers.horizonYears,
  });

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Change one thing and watch it propagate through debt, investments, cash and net worth together.">
          What if…
        </SectionTitle>
        <div className="mb-5 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setLevers((s) => ({ ...s, ...p.levers }))}
              className="rounded-full px-3 py-1.5 text-sm transition-colors"
              style={{ background: C.paper, color: C.ink2, border: `1px solid ${C.rule}` }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() =>
              setLevers({
                salaryChangePct: 0, expenseChangePct: 0, extraInvestment: 0, extraDebtPayment: 0,
                inflationPct: data.assumptions.inflationPct, jobLossMonths: 0,
                investmentPauseMonths: 0, horizonYears: levers.horizonYears,
              })
            }
            className="rounded-full px-3 py-1.5 text-sm"
            style={{ color: C.muted }}
          >
            Reset
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Salary change" value={levers.salaryChangePct} onChange={set("salaryChangePct")} min={-50} max={100} step={5} prefix="%" />
          <NumberField label="Expense change" value={levers.expenseChangePct} onChange={set("expenseChangePct")} min={-50} max={100} step={5} prefix="%" />
          <NumberField label="Extra monthly investing" value={levers.extraInvestment} onChange={set("extraInvestment")} min={0} max={100000} step={1000} />
          <NumberField label="Extra monthly to debt" value={levers.extraDebtPayment} onChange={set("extraDebtPayment")} min={0} max={100000} step={1000} />
          <NumberField label="Inflation" value={levers.inflationPct} onChange={set("inflationPct")} min={2} max={12} step={0.5} prefix="%" />
          <NumberField label="Months without income" value={levers.jobLossMonths} onChange={set("jobLossMonths")} min={0} max={24} step={1} prefix=" months" />
          <NumberField label="Months not investing" value={levers.investmentPauseMonths} onChange={set("investmentPauseMonths")} min={0} max={36} step={1} prefix=" months" />
          <NumberField label="Horizon" value={levers.horizonYears} onChange={set("horizonYears")} min={1} max={35} step={1} prefix=" years" />
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat
            label={`Net worth in ${levers.horizonYears} years`}
            value={inrShort(scenario.netWorth)}
            hint={`${inrShort(scenario.netWorthReal)} in today's money`}
            tone={C.ink}
          />
          <Stat
            label="Versus doing nothing"
            value={`${delta >= 0 ? "+" : "−"}${inrShort(Math.abs(delta))}`}
            tone={delta >= 0 ? C.sure : C.danger}
            hint={changed ? "difference this scenario makes" : "no changes applied yet"}
          />
          <Stat
            label="Debt-free in"
            value={scenario.debtFree ? months(scenario.debtFree) : "not within horizon"}
            tone={scenario.debtFree && base.debtFree && scenario.debtFree < base.debtFree ? C.sure : C.ink}
            hint={base.debtFree ? `${months(base.debtFree)} as things stand` : undefined}
          />
          <Stat
            label="Cash runs out?"
            value={scenario.runsOut ? "Yes" : "No"}
            tone={scenario.runsOut ? C.danger : C.sure}
            hint={scenario.runsOut ? "investments would be sold to cover the gap" : "buffer holds throughout"}
          />
        </div>

        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
              <CartesianGrid stroke={C.rule} vertical={false} />
              <XAxis dataKey="year" tick={chartAxis} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v)}y`} />
              <YAxis tick={chartAxis} axisLine={false} tickLine={false} tickFormatter={inrShort} width={54} />
              <Tooltip content={<ChartTip />} labelFormatter={(v) => `Year ${Number(v).toFixed(1)}`} />
              <Line type="monotone" dataKey="As things stand" stroke={C.faint} strokeWidth={2} strokeDasharray="4 3" dot={false} />
              <Line type="monotone" dataKey="This scenario" stroke={C.model} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {scenario.runsOut && (
          <div className="mt-4 rounded-lg p-4" style={{ background: C.dangerBg }}>
            <p className="text-sm leading-relaxed" style={{ color: C.ink }}>
              In this scenario your cash buffer hits zero and the shortfall gets covered by selling
              investments. That is the mechanism through which a temporary income problem becomes a
              permanent wealth problem — you sell when prices are low because you have no choice.
              It is the entire argument for the emergency fund.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================================================================== */
/* CAN I AFFORD IT?                                                   */
/* ================================================================== */

const AFFORD_PRESETS = [
  { name: "Phone", price: 80000 }, { name: "Laptop", price: 100000 },
  { name: "Holiday", price: 150000 }, { name: "Car", price: 900000 },
];

const VERDICT_STYLE = {
  affordable: { label: "Affordable", color: C.sure, bg: C.sureBg },
  stretch: { label: "Affordable, but not ideal", color: C.warn, bg: C.warnBg },
  avoid: { label: "Avoid for now", color: C.danger, bg: C.dangerBg },
};

function AffordTab({ data, profile }) {
  const [itemName, setItemName] = useState("Laptop");
  const [price, setPrice] = useState(100000);
  const [method, setMethod] = useState("cash");
  const [emiMonths, setEmiMonths] = useState(24);
  const [emiRatePct, setEmiRatePct] = useState(14);
  const [downPayment, setDownPayment] = useState(0);

  const result = useMemo(
    () => assessAffordability(data, profile, { itemName, price, method, emiMonths, emiRatePct, downPayment }),
    [data, profile, itemName, price, method, emiMonths, emiRatePct, downPayment]
  );
  const v = VERDICT_STYLE[result.verdict];

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="The price is never the whole cost. What matters is what the purchase does to your buffer, your cash flow and your goals.">
          Can I afford it?
        </SectionTitle>

        <div className="mb-5 flex flex-wrap gap-2">
          {AFFORD_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => { setItemName(p.name); setPrice(p.price); }}
              className="rounded-full px-3 py-1.5 text-sm"
              style={{
                background: itemName === p.name ? C.ink : C.paper,
                color: itemName === p.name ? "#fff" : C.ink2,
                border: `1px solid ${itemName === p.name ? C.ink : C.rule}`,
              }}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs" style={{ color: C.muted }}>What are you buying?</span>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ border: `1px solid ${C.rule}`, color: C.ink, background: C.card }}
            />
          </label>
          <NumberField label="Price" value={price} onChange={setPrice} min={1000} max={10000000} step={5000} />
        </div>

        <div className="mt-5">
          <Toggle
            value={method}
            onChange={setMethod}
            options={[{ value: "cash", label: "Pay in full" }, { value: "emi", label: "On EMI" }]}
          />
        </div>

        {method === "emi" && (
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <NumberField label="Down payment" value={downPayment} onChange={setDownPayment} min={0} max={price} step={5000} />
            <NumberField label="Tenure" value={emiMonths} onChange={setEmiMonths} min={3} max={84} step={3} prefix=" months" />
            <NumberField label="Interest rate" value={emiRatePct} onChange={setEmiRatePct} min={0} max={30} step={0.5} prefix="%" />
          </div>
        )}
      </Card>

      <Card style={{ borderColor: v.color, borderWidth: 2 }}>
        <div className="flex flex-wrap items-baseline gap-3">
          <span
            className="rounded-full px-3 py-1 text-sm font-semibold"
            style={{ background: v.bg, color: v.color }}
          >
            {v.label}
          </span>
          <h3 className="text-lg font-semibold" style={{ color: C.ink }}>{result.headline}</h3>
        </div>

        <ul className="mt-5 space-y-2">
          {result.reasons.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed" style={{ color: C.muted }}>
              <span style={{ color: v.color }}>·</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
          {result.emi && <Stat label="Monthly EMI" value={inr(result.emi)} hint={`for ${emiMonths} months`} />}
          <Stat
            label="Emergency cover after"
            value={`${result.coverAfter.toFixed(1)} mo`}
            tone={result.coverAfter < 3 ? C.danger : C.sure}
            hint={`${profile.efMonths.toFixed(1)} months today`}
          />
          <Stat
            label="EMI share of income"
            value={pct(result.emiRatio, 0)}
            tone={result.emiRatio > 40 ? C.danger : result.emiRatio > 30 ? C.warn : C.sure}
          />
          <Stat
            label="Save up instead"
            value={result.monthsToSave ? `${result.monthsToSave} months` : "—"}
            hint={result.monthsToSave ? `at ${inr(profile.surplus)}/month` : "no surplus available"}
          />
          <Stat
            label="If invested for 20 years"
            value={inrShort(result.opportunityCost20y)}
            tone={C.model}
            hint="what this money could become instead"
          />
        </div>

        <div className="mt-6 rounded-lg p-4" style={{ background: C.paper }}>
          <p className="text-sm leading-relaxed" style={{ color: C.ink }}>{result.betterPlan}</p>
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* MONTHLY PLAN                                                       */
/* ================================================================== */

function PlanTab({ data, profile, allocation, alerts }) {
  const [done, setDone] = useState({});
  const toggle = (id) => setDone((s) => ({ ...s, [id]: !s[id] }));

  const items = [
    ...data.debts
      .filter((x) => x.outstanding > 0)
      .map((x) => ({
        id: `emi_${x.id}`,
        label: `Pay ${x.name} EMI`,
        amount: x.emi,
        when: "By the due date — a missed EMI costs more than any optimisation gains",
      })),
    ...data.investments
      .filter((x) => x.monthlyContribution > 0)
      .map((x) => ({
        id: `sip_${x.id}`,
        label: `${x.name} SIP`,
        amount: x.monthlyContribution,
        when: "Automated — verify the debit cleared",
      })),
    ...allocation.buckets.map((b, i) => ({
      id: `alloc_${i}`,
      label: `${b.label}: ${b.target}`,
      amount: b.amount,
      when: "Within 48 hours of salary credit, before it gets spent",
    })),
  ];

  const total = items.reduce((s, x) => s + x.amount, 0);
  const completed = items.filter((x) => done[x.id]).length;

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Income in, commitments out, and a job for every rupee that is left.">
          This month
        </SectionTitle>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Income" value={inr(profile.income)} tone={C.sure} />
          <Stat label="Living expenses" value={inr(profile.living)} />
          <Stat label="EMIs and SIPs" value={inr(profile.emi + profile.sip)} />
          <Stat
            label="Left to direct"
            value={inr(Math.max(0, profile.surplus))}
            tone={profile.surplus >= 0 ? C.sure : C.danger}
          />
        </div>

        <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full" style={{ background: C.rule }}>
          <div style={{ width: `${(profile.living / profile.income) * 100}%`, background: C.ink2 }} />
          <div style={{ width: `${(profile.emi / profile.income) * 100}%`, background: C.warn }} />
          <div style={{ width: `${(profile.sip / profile.income) * 100}%`, background: C.model }} />
          <div style={{ width: `${(Math.max(0, profile.surplus) / profile.income) * 100}%`, background: C.sure }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: C.muted }}>
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: C.ink2 }} />Living</span>
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: C.warn }} />Debt</span>
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: C.model }} />Investing</span>
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: C.sure }} />Free</span>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <SectionTitle sub={`${inr(total)} moves this month across ${items.length} actions.`}>
            Your checklist
          </SectionTitle>
          <span className="text-sm" style={{ ...NUM, color: C.muted }}>
            {completed}/{items.length}
          </span>
        </div>
        <ul className="space-y-0">
          {items.map((x, i) => (
            <li
              key={x.id}
              className="flex items-start gap-3 py-3"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${C.rule}` }}
            >
              <button
                onClick={() => toggle(x.id)}
                aria-pressed={!!done[x.id]}
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded"
                style={{
                  border: `1.5px solid ${done[x.id] ? C.sure : C.rule}`,
                  background: done[x.id] ? C.sure : "transparent",
                  color: "#fff",
                  fontSize: 12,
                }}
              >
                {done[x.id] ? "✓" : ""}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className="text-sm font-medium"
                    style={{
                      color: done[x.id] ? C.faint : C.ink,
                      textDecoration: done[x.id] ? "line-through" : "none",
                    }}
                  >
                    {x.label}
                  </span>
                  <span className="ml-auto text-sm" style={{ ...NUM, color: C.ink }}>{inr(x.amount)}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed" style={{ color: C.faint }}>{x.when}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {alerts.length > 0 && (
        <Card>
          <SectionTitle sub="Things worth knowing before they become things worth worrying about.">
            Alerts
          </SectionTitle>
          <ul className="space-y-3">
            {alerts.map((a) => {
              const color =
                a.severity === "danger" ? C.danger : a.severity === "warning" ? C.warn : C.ink2;
              return (
                <li key={a.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                  <div>
                    <div className="text-sm font-medium" style={{ color: C.ink }}>{a.title}</div>
                    <div className="mt-0.5 text-sm leading-relaxed" style={{ color: C.muted }}>{a.detail}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ================================================================== */
/* EDITABLE INPUTS                                                    */
/* ================================================================== */

function InputsPanel({ data, setData, onClose }) {
  const set = (path, value) =>
    setData((d) => {
      const next = structuredClone(d);
      let node = next;
      for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
      node[path[path.length - 1]] = value;
      return next;
    });

  const setDebt = (id, key, value) =>
    setData((d) => ({
      ...d,
      debts: d.debts.map((x) => (x.id === id ? { ...x, [key]: value } : x)),
    }));

  const setInv = (id, key, value) =>
    setData((d) => ({
      ...d,
      investments: d.investments.map((x) => (x.id === id ? { ...x, [key]: value } : x)),
    }));

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle sub="Change anything here and every recommendation, score and projection updates. This is the point — the advice is derived, not written.">
          Your numbers
        </SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Monthly salary" value={data.cashFlow.monthlySalary} onChange={(v) => set(["cashFlow", "monthlySalary"], v)} min={0} max={1000000} step={1000} />
          <NumberField label="Other monthly income" value={data.cashFlow.otherMonthlyIncome} onChange={(v) => set(["cashFlow", "otherMonthlyIncome"], v)} min={0} max={500000} step={1000} />
          <NumberField label="Age" value={data.personal.age} onChange={(v) => set(["personal", "age"], v)} min={16} max={70} step={1} prefix=" years" />
          <NumberField label="Dependents" value={data.personal.dependents} onChange={(v) => set(["personal", "dependents"], v)} min={0} max={8} step={1} prefix="" />
          <NumberField label="Health cover" value={data.personal.healthInsuranceCover} onChange={(v) => set(["personal", "healthInsuranceCover"], v)} min={0} max={5000000} step={100000} />
          <NumberField label="Expected salary growth" value={data.personal.expectedAnnualSalaryGrowthPct} onChange={(v) => set(["personal", "expectedAnnualSalaryGrowthPct"], v)} min={0} max={30} step={1} prefix="%" />
        </div>

        <div className="mt-5">
          <div className="mb-2 text-xs" style={{ color: C.muted }}>Risk appetite</div>
          <Toggle
            value={data.personal.riskTolerance}
            onChange={(v) => set(["personal", "riskTolerance"], v)}
            options={[
              { value: "conservative", label: "Conservative" },
              { value: "moderate", label: "Moderate" },
              { value: "aggressive", label: "Aggressive" },
            ]}
          />
          <p className="mt-2 text-xs leading-relaxed" style={{ color: C.faint }}>
            This sets the risk premium in your investment hurdle rate. A cautious investor demands
            more from the market before choosing it over guaranteed debt reduction.
          </p>
        </div>

        <div className="mt-5">
          <div className="mb-2 text-xs" style={{ color: C.muted }}>Employment</div>
          <Toggle
            value={data.personal.employmentType}
            onChange={(v) => set(["personal", "employmentType"], v)}
            options={[
              { value: "salaried_government", label: "Government" },
              { value: "salaried_private", label: "Salaried" },
              { value: "freelancer", label: "Freelance" },
            ]}
          />
          <p className="mt-2 text-xs leading-relaxed" style={{ color: C.faint }}>
            Drives how many months your emergency fund should cover. Switch to freelance and watch
            the target — and the advice — move.
          </p>
        </div>
      </Card>

      <Card>
        <SectionTitle>Monthly expenses</SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(data.cashFlow.expenses).map(([k, v]) => (
            <NumberField
              key={k}
              label={k === "insurancePremiums" ? "Insurance" : k.charAt(0).toUpperCase() + k.slice(1)}
              value={v}
              onChange={(nv) => set(["cashFlow", "expenses", k], nv)}
              min={0}
              max={200000}
              step={500}
            />
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Savings</SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Emergency fund" value={data.savings.emergencyFund} onChange={(v) => set(["savings", "emergencyFund"], v)} min={0} max={5000000} step={5000} />
          <NumberField label="Bank balance" value={data.savings.bankBalance} onChange={(v) => set(["savings", "bankBalance"], v)} min={0} max={5000000} step={5000} />
          <NumberField label="Fixed deposits" value={data.savings.fixedDeposits} onChange={(v) => set(["savings", "fixedDeposits"], v)} min={0} max={5000000} step={5000} />
        </div>
      </Card>

      <Card>
        <SectionTitle sub="Interest rate is the field that changes the advice most. Drop the credit card below 15% and watch it stop being an emergency.">
          Debts
        </SectionTitle>
        <div className="space-y-6">
          {data.debts.map((x) => (
            <div key={x.id}>
              <div className="mb-2 text-sm font-medium" style={{ color: C.ink }}>{x.name}</div>
              <div className="grid gap-5 sm:grid-cols-3">
                <NumberField label="Outstanding" value={x.outstanding} onChange={(v) => setDebt(x.id, "outstanding", v)} min={0} max={10000000} step={1000} />
                <NumberField label="Interest rate" value={x.annualInterestRatePct} onChange={(v) => setDebt(x.id, "annualInterestRatePct", v)} min={0} max={48} step={0.5} prefix="%" />
                <NumberField label="EMI" value={x.emi} onChange={(v) => setDebt(x.id, "emi", v)} min={0} max={200000} step={500} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Investments</SectionTitle>
        <div className="space-y-6">
          {data.investments.map((x) => (
            <div key={x.id}>
              <div className="mb-2 text-sm font-medium" style={{ color: C.ink }}>{x.name}</div>
              <div className="grid gap-5 sm:grid-cols-3">
                <NumberField label="Current value" value={x.currentValue} onChange={(v) => setInv(x.id, "currentValue", v)} min={0} max={20000000} step={1000} />
                <NumberField label="Monthly contribution" value={x.monthlyContribution} onChange={(v) => setInv(x.id, "monthlyContribution", v)} min={0} max={500000} step={500} />
                <NumberField label="Assumed return" value={x.expectedAnnualReturnPct} onChange={(v) => setInv(x.id, "expectedAnnualReturnPct", v)} min={0} max={25} step={0.25} prefix="%" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <button
        onClick={onClose}
        className="w-full rounded-lg px-4 py-3 text-sm font-medium"
        style={{ background: C.ink, color: "#fff" }}
      >
        See what changed
      </button>
    </div>
  );
}

/* ================================================================== */
/* APP SHELL                                                          */
/* ================================================================== */

const TABS = [
  { id: "decide", label: "Decide" },
  { id: "plan", label: "This month" },
  { id: "health", label: "Health" },
  { id: "networth", label: "Net worth" },
  { id: "goals", label: "Goals" },
  { id: "debt", label: "Debt vs invest" },
  { id: "grow", label: "Grow" },
  { id: "simulate", label: "What if" },
  { id: "afford", label: "Can I afford it" },
  { id: "inputs", label: "Your numbers" },
];

export default function FinCompass() {
  const [data, setData] = useState(DEMO);
  const [tab, setTab] = useState("decide");

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

  return (
    <div style={{ background: C.paper, minHeight: "100%", fontFamily: FONT, color: C.ink }}>
      <header
        className="sticky top-0 z-10"
        style={{ background: "rgba(238,242,247,0.92)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.rule}` }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold" style={{ letterSpacing: "-0.02em" }}>
              FinCompass
            </span>
            <span className="hidden text-xs sm:inline" style={{ color: C.faint }}>
              {data.personal.city} · age {data.personal.age}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
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
                    color: active ? "#fff" : C.muted,
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
            investment returns are uncertain and can be negative, while debt interest is
            contractual. Nothing here is a recommendation to buy or sell any specific security.
            Verify anything material with a SEBI-registered adviser before acting on it.
          </p>
          <p className="mt-3 text-xs" style={{ color: C.faint }}>
            Currently showing a demo profile. Open “Your numbers” to change any input and watch every
            recommendation on the site recalculate.
          </p>
        </footer>
      </main>
    </div>
  );
}
