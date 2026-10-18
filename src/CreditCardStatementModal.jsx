import React, { useState, useMemo } from "react";

const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };

export default function CreditCardStatementModal({
  card,
  dailyLogs,
  userProfile,
  onClose,
  C,
}) {
  const [selectedCycle, setSelectedCycle] = useState("current"); // "current" | "previous"

  // Derive statement dates based on card.billDay (1-31)
  const statementMeta = useMemo(() => {
    const today = new Date();
    const billDay = Number(card.billDay) || 15;
    const dueDays = Number(card.dueDays) || 20;

    let billDate, prevBillDate;

    if (selectedCycle === "current") {
      // Bill generated this month (or previous month if today < billDay)
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth(); // 0-indexed

      if (today.getDate() >= billDay) {
        billDate = new Date(currentYear, currentMonth, billDay);
        prevBillDate = new Date(currentYear, currentMonth - 1, billDay);
      } else {
        billDate = new Date(currentYear, currentMonth - 1, billDay);
        prevBillDate = new Date(currentYear, currentMonth - 2, billDay);
      }
    } else {
      // Previous cycle
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();

      if (today.getDate() >= billDay) {
        billDate = new Date(currentYear, currentMonth - 1, billDay);
        prevBillDate = new Date(currentYear, currentMonth - 2, billDay);
      } else {
        billDate = new Date(currentYear, currentMonth - 2, billDay);
        prevBillDate = new Date(currentYear, currentMonth - 3, billDay);
      }
    }

    const dueDate = new Date(billDate);
    dueDate.setDate(dueDate.getDate() + dueDays);

    const periodStartStr = prevBillDate.toISOString().slice(0, 10);
    const periodEndStr = billDate.toISOString().slice(0, 10);
    const billDateStr = billDate.toISOString().slice(0, 10);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    return {
      billDate: billDateStr,
      dueDate: dueDateStr,
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      formattedBillDate: billDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      formattedDueDate: dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      formattedPeriod: `${prevBillDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${billDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
    };
  }, [card.billDay, card.dueDays, selectedCycle]);

  // Extract all transactions for this card within the billing period
  const statementTransactions = useMemo(() => {
    const txs = [];
    if (!dailyLogs) return txs;

    Object.keys(dailyLogs).forEach((dateStr) => {
      // Check if date falls in statement period (periodStart <= date <= periodEnd)
      if (dateStr >= statementMeta.periodStart && dateStr <= statementMeta.periodEnd) {
        const entries = dailyLogs[dateStr]?.entries || [];
        entries.forEach((entry) => {
          if (
            entry.accountId === card.id ||
            entry.creditCardId === card.id ||
            (entry.method === "card" && entry.accountId === card.id)
          ) {
            txs.push({
              ...entry,
              dateStr,
            });
          }
        });
      }
    });

    // Sort chronologically
    return txs.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || (a.time || "").localeCompare(b.time || ""));
  }, [dailyLogs, card.id, statementMeta]);

  // Calculations for statement
  const totalDebits = statementTransactions
    .filter((t) => t.type !== "credit")
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const totalCredits = statementTransactions
    .filter((t) => t.type === "credit")
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  // If there are recorded transactions, total due is debits - credits; fallback to currentOutstanding
  const totalAmountDue = statementTransactions.length > 0 ? Math.max(0, totalDebits - totalCredits) : (card.currentOutstanding || 0);
  const minAmountDue = Math.max(500, Math.round(totalAmountDue * 0.05));
  const availableCredit = Math.max(0, (card.totalLimit || 0) - totalAmountDue);
  const availableCashLimit = Math.round((card.totalLimit || 0) * 0.2);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadCSV = () => {
    const headers = ["Date", "Description", "Category", "Type", "Amount (INR)"];
    const rows = statementTransactions.map((t) => [
      t.dateStr,
      `"${(t.note || t.catId || "Transaction").replace(/"/g, '""')}"`,
      t.catId || "Other",
      t.type === "credit" ? "Credit / Payment" : "Debit / Purchase",
      t.amount,
    ]);

    const csvContent = [
      `Credit Card Statement - ${card.name} (${card.bank || "FinCompass Bank"})`,
      `Statement Date: ${statementMeta.formattedBillDate}, Due Date: ${statementMeta.formattedDueDate}`,
      `Total Due: INR ${totalAmountDue}, Min Due: INR ${minAmountDue}`,
      "",
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Statement_${card.name.replace(/\s+/g, "_")}_${statementMeta.billDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div
        className="relative w-full max-w-3xl my-auto rounded-2xl shadow-2xl overflow-hidden border print:border-none print:shadow-none print:max-w-none print:m-0"
        style={{ background: C.card, borderColor: C.rule }}
      >
        {/* Top Control Bar (Hidden when printing) */}
        <div
          className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b print:hidden"
          style={{ background: C.paper, borderColor: C.rule }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">💳</span>
            <div>
              <h3 className="text-base font-bold" style={{ color: C.ink }}>
                Credit Card Statement Generator
              </h3>
              <p className="text-xs" style={{ color: C.muted }}>
                {card.name} · {card.bank || "FinCompass Card Services"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Cycle Selector */}
            <select
              value={selectedCycle}
              onChange={(e) => setSelectedCycle(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none"
              style={{ background: C.card, borderColor: C.rule, color: C.ink }}
            >
              <option value="current">Current Cycle ({statementMeta.formattedBillDate})</option>
              <option value="previous">Previous Cycle</option>
            </select>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ background: "#2563EB" }}
              title="Print or Save as PDF"
            >
              <span>🖨️</span>
              <span>Print / PDF</span>
            </button>

            <button
              onClick={handleDownloadCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-opacity hover:opacity-90"
              style={{ background: C.card, borderColor: C.rule, color: C.ink }}
              title="Export Statement as CSV"
            >
              <span>📥 CSV</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border transition-colors hover:bg-red-500/10"
              style={{ borderColor: C.rule, color: C.muted }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PRINTABLE STATEMENT DOCUMENT */}
        {/* ========================================================================= */}
        <div className="p-6 sm:p-8 space-y-6 print:p-0 print:space-y-4 print:text-black print:bg-white" id="fincompass-statement-printable">
          {/* Statement Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b" style={{ borderColor: C.rule }}>
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white" style={{ background: "linear-gradient(135deg, #14B8A6, #0284C7)" }}>
                  FC
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight" style={{ color: C.ink }}>
                    FinCompass <span className="font-normal text-xs uppercase tracking-widest opacity-60">Credit Services</span>
                  </h1>
                  <p className="text-[11px]" style={{ color: C.faint }}>
                    Monthly Statement of Account & Billing Advice
                  </p>
                </div>
              </div>

              <div className="mt-4 text-xs space-y-0.5" style={{ color: C.muted }}>
                <div>Cardholder: <strong style={{ color: C.ink }}>{userProfile?.name || "Cardholder"}</strong></div>
                <div>City: {userProfile?.city || "India"}</div>
                <div>Card Account: <span className="font-mono" style={{ color: C.ink }}>•••• •••• •••• {card.last4 || "8492"}</span></div>
              </div>
            </div>

            <div className="text-right text-xs space-y-1">
              <div className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40">
                Official Statement
              </div>
              <div className="mt-2 text-xs" style={{ color: C.muted }}>Statement Date:</div>
              <div className="font-bold text-sm" style={{ color: C.ink }}>{statementMeta.formattedBillDate}</div>
              <div className="text-xs" style={{ color: C.muted }}>Billing Period:</div>
              <div className="text-xs font-medium" style={{ color: C.ink2 }}>{statementMeta.formattedPeriod}</div>
            </div>
          </div>

          {/* Key Statement Summary Box */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              className="rounded-xl p-4 border"
              style={{ background: "#EF444412", borderColor: "#EF444433" }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-red-500">Total Amount Due</div>
              <div className="text-xl sm:text-2xl font-black mt-1 text-red-500" style={NUM}>
                {inr(totalAmountDue)}
              </div>
              <div className="text-[11px] mt-1 text-red-600/80 font-medium">Pay by {statementMeta.formattedDueDate}</div>
            </div>

            <div
              className="rounded-xl p-4 border"
              style={{ background: "#F59E0B12", borderColor: "#F59E0B33" }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-500">Min Amount Due</div>
              <div className="text-xl sm:text-2xl font-black mt-1 text-amber-500" style={NUM}>
                {inr(minAmountDue)}
              </div>
              <div className="text-[11px] mt-1 text-amber-600/80 font-medium">5% of total balance</div>
            </div>

            <div
              className="rounded-xl p-4 border"
              style={{ background: "#10B98112", borderColor: "#10B98133" }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-500">Payment Due Date</div>
              <div className="text-lg sm:text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                {statementMeta.formattedDueDate}
              </div>
              <div className="text-[11px] mt-1 text-emerald-600/80 font-medium">{card.dueDays || 20} days grace period</div>
            </div>

            <div
              className="rounded-xl p-4 border"
              style={{ background: C.paper, borderColor: C.rule }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>Available Limit</div>
              <div className="text-xl sm:text-2xl font-black mt-1 text-blue-600 dark:text-blue-400" style={NUM}>
                {inr(availableCredit)}
              </div>
              <div className="text-[11px] mt-1" style={{ color: C.faint }}>Limit: {inr(card.totalLimit || 0)}</div>
            </div>
          </div>

          {/* Account & Limit Summary Strip */}
          <div
            className="rounded-xl p-4 text-xs grid grid-cols-2 sm:grid-cols-4 gap-4 border"
            style={{ background: C.paper, borderColor: C.rule }}
          >
            <div>
              <span className="block" style={{ color: C.faint }}>Credit Limit:</span>
              <span className="font-bold text-sm" style={{ ...NUM, color: C.ink }}>{inr(card.totalLimit || 0)}</span>
            </div>
            <div>
              <span className="block" style={{ color: C.faint }}>Available Cash Limit:</span>
              <span className="font-bold text-sm" style={{ ...NUM, color: C.ink }}>{inr(availableCashLimit)}</span>
            </div>
            <div>
              <span className="block" style={{ color: C.faint }}>Total Purchases (Debits):</span>
              <span className="font-bold text-sm text-red-500" style={NUM}>+{inr(totalDebits)}</span>
            </div>
            <div>
              <span className="block" style={{ color: C.faint }}>Payments / Credits:</span>
              <span className="font-bold text-sm text-emerald-500" style={NUM}>-{inr(totalCredits)}</span>
            </div>
          </div>

          {/* Transaction Ledger Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: C.ink }}>
                Itemized Transactions ({statementTransactions.length})
              </h4>
              <span className="text-[11px]" style={{ color: C.faint }}>
                Cycle: {statementMeta.formattedPeriod}
              </span>
            </div>

            <div
              className="rounded-xl overflow-hidden border"
              style={{ borderColor: C.rule }}
            >
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr style={{ background: C.paper, borderBottom: `1px solid ${C.rule}` }}>
                    <th className="py-2.5 px-3 font-semibold" style={{ color: C.muted }}>Date</th>
                    <th className="py-2.5 px-3 font-semibold" style={{ color: C.muted }}>Transaction Details</th>
                    <th className="py-2.5 px-3 font-semibold" style={{ color: C.muted }}>Category</th>
                    <th className="py-2.5 px-3 text-right font-semibold" style={{ color: C.muted }}>Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: C.rule }}>
                  {statementTransactions.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-8 text-center" style={{ color: C.muted }}>
                        No transactions recorded for this card in this billing cycle.
                        <div className="text-[11px] mt-1" style={{ color: C.faint }}>
                          Current outstanding on file: {inr(card.currentOutstanding || 0)}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    statementTransactions.map((tx) => {
                      const isCredit = tx.type === "credit";
                      return (
                        <tr key={tx.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-[11px]" style={{ color: C.muted }}>
                            {tx.dateStr}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium" style={{ color: C.ink }}>
                              {tx.note || (isCredit ? "Payment Received" : "Card Purchase")}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono">Ref: {tx.id.slice(0, 14)}</div>
                          </td>
                          <td className="py-2.5 px-3 capitalize" style={{ color: C.muted }}>
                            {tx.catId || "General"}
                          </td>
                          <td
                            className="py-2.5 px-3 text-right font-bold text-sm"
                            style={{
                              ...NUM,
                              color: isCredit ? "#10B981" : "#EF4444",
                            }}
                          >
                            {isCredit ? "-" : "+"}{inr(tx.amount)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Important Advice / Fine Print */}
          <div
            className="rounded-xl p-4 text-[11px] leading-relaxed border space-y-1.5"
            style={{ background: C.paper, borderColor: C.rule, color: C.muted }}
          >
            <div className="font-bold uppercase tracking-wider text-xs" style={{ color: C.ink }}>
              ⚠️ Statement Advisory & Payment Notice
            </div>
            <p>
              Please make the payment of at least the Minimum Amount Due ({inr(minAmountDue)}) on or before{" "}
              <strong>{statementMeta.formattedDueDate}</strong> to avoid late payment charges and adverse credit reporting.
            </p>
            <p>
              Paying only the Minimum Due will result in finance charges accrued at <strong>{card.interestRatePct || 42}% APR</strong> on the outstanding balance.
              We recommend paying the Total Amount Due ({inr(totalAmountDue)}) in full to maintain interest-free benefits.
            </p>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ borderColor: C.rule, color: C.faint }}>
            <div>FinCompass Self-Generated Credit Card Statement · Document ID: FC-STMT-{card.id.toUpperCase()}-{statementMeta.billDate.replace(/-/g, "")}</div>
            <div>Generated on {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        </div>

        {/* Modal Bottom Actions (Hidden when printing) */}
        <div
          className="px-6 py-4 flex items-center justify-end gap-3 border-t print:hidden"
          style={{ background: C.paper, borderColor: C.rule }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold border transition-colors"
            style={{ borderColor: C.rule, color: C.ink, background: C.card }}
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ background: "#2563EB" }}
          >
            🖨️ Print Statement / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
