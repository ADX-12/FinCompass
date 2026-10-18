import React, { useState, useMemo, useContext } from "react";
import { ThemeContext } from "./FinCompassContext";
import { DEFAULT_CATEGORIES } from "./DailyTracker";

const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const NUM = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum"' };

export default function InvoicesTab({
  invoices = [],
  dailyLogs = {},
  onAddInvoice,
  onAttachInvoiceToTx,
  onDetachInvoiceFromTx,
  onDeleteInvoice,
  categories = DEFAULT_CATEGORIES,
  banks = [],
  cash = 0,
  creditCards = [],
  onNavigateToTab,
}) {
  const C = useContext(ThemeContext);
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("all");
  const [sortBy, setSortBy] = useState("newest"); // "newest" | "oldest" | "highest" | "lowest"
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Upload Modal State
  const [uploadMode, setUploadMode] = useState("link_existing"); // "link_existing" | "new_tx"
  const [selectedTxId, setSelectedTxId] = useState("");
  const [txSearchQuery, setTxSearchQuery] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadAmount, setUploadAmount] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCat, setUploadCat] = useState(categories[0]?.id || "bills");
  const [uploadDate, setUploadDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [uploadAccount, setUploadAccount] = useState("");

  // Flatten all transactions from dailyLogs
  const allTransactions = useMemo(() => {
    const list = [];
    Object.keys(dailyLogs || {}).forEach((dateStr) => {
      const day = dailyLogs[dateStr];
      (day?.entries || []).forEach((e) => {
        list.push({
          ...e,
          date: dateStr,
        });
      });
    });
    return list.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.time || "").localeCompare(a.time || ""));
  }, [dailyLogs]);

  // Compute unified list of invoices linked directly to transactions
  const unifiedInvoices = useMemo(() => {
    const map = new Map();

    // 1. Transactions that have an attached invoice (Single source of truth)
    allTransactions.forEach((tx) => {
      if (tx.invoice && (tx.invoice.fileData || tx.invoice.fileName)) {
        map.set(tx.id, {
          id: `inv_${tx.id}`,
          txId: tx.id,
          date: tx.date,
          amount: tx.amount,
          description: tx.note || "Transaction Receipt",
          category: tx.catId || "bills",
          accountId: tx.accountId || "",
          method: tx.method,
          type: tx.type || "debit",
          fileName: tx.invoice.fileName || "receipt.pdf",
          fileType: tx.invoice.fileType || "application/pdf",
          fileSize: tx.invoice.fileSize || 0,
          fileData: tx.invoice.fileData,
          isDirectlyLinked: true,
          tx,
        });
      }
    });

    // 2. Incorporate any invoices in data.invoices archive
    (invoices || []).forEach((inv) => {
      const key = inv.txId || inv.id;
      if (!map.has(key)) {
        const matchingTx = inv.txId ? allTransactions.find((t) => t.id === inv.txId) : null;
        map.set(key, {
          ...inv,
          tx: matchingTx || null,
          isDirectlyLinked: !!inv.txId,
        });
      }
    });

    return Array.from(map.values());
  }, [allTransactions, invoices]);

  // Filtered transactions for the "Link to Existing" selector
  const eligibleTransactions = useMemo(() => {
    let list = [...allTransactions];
    if (txSearchQuery.trim()) {
      const q = txSearchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          (t.note || "").toLowerCase().includes(q) ||
          (t.date || "").includes(q) ||
          String(t.amount || "").includes(q)
      );
    }
    return list.slice(0, 30);
  }, [allTransactions, txSearchQuery]);

  const selectedTx = useMemo(() => {
    return allTransactions.find((t) => t.id === selectedTxId) || null;
  }, [allTransactions, selectedTxId]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const dataUrl = loadEvent.target.result;
      setUploadFile({
        name: file.name,
        type: file.type,
        size: file.size,
        data: dataUrl,
      });
      setUploadPreview(dataUrl);
      if (!uploadDesc && uploadMode === "new_tx") {
        setUploadDesc(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetUpload = () => {
    setUploadMode("link_existing");
    setSelectedTxId("");
    setTxSearchQuery("");
    setUploadFile(null);
    setUploadPreview(null);
    setUploadAmount("");
    setUploadDesc("");
    setUploadCat(categories[0]?.id || "bills");
    setUploadDate(new Date().toISOString().slice(0, 10));
    setUploadAccount("");
    setShowUploadModal(false);
  };

  const handleUploadSubmit = (e) => {
    e.preventDefault();
    if (!uploadFile) return;

    if (uploadMode === "link_existing") {
      if (!selectedTx) return;
      if (onAttachInvoiceToTx) {
        onAttachInvoiceToTx(selectedTx.date, selectedTx.id, {
          fileName: uploadFile.name,
          fileType: uploadFile.type,
          fileSize: uploadFile.size,
          fileData: uploadFile.data,
        });
      }
      handleResetUpload();
      return;
    }

    // New transaction mode (records once into Daily Tracker)
    const amt = parseFloat(uploadAmount);
    if (!amt || amt <= 0) return;

    onAddInvoice({
      fileName: uploadFile.name,
      fileType: uploadFile.type,
      fileSize: uploadFile.size,
      fileData: uploadFile.data,
      amount: amt,
      description: uploadDesc.trim() || uploadFile.name,
      category: uploadCat,
      date: uploadDate,
      accountId: uploadAccount,
    });

    handleResetUpload();
  };

  // Filter and Sort
  const filteredInvoices = useMemo(() => {
    let list = [...unifiedInvoices];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (inv) =>
          (inv.description || "").toLowerCase().includes(q) ||
          (inv.fileName || "").toLowerCase().includes(q) ||
          (inv.category || "").toLowerCase().includes(q)
      );
    }

    if (selectedCat !== "all") {
      list = list.filter((inv) => inv.category === selectedCat);
    }

    list.sort((a, b) => {
      if (sortBy === "newest") return (b.date || "").localeCompare(a.date || "");
      if (sortBy === "oldest") return (a.date || "").localeCompare(b.date || "");
      if (sortBy === "highest") return (b.amount || 0) - (a.amount || 0);
      if (sortBy === "lowest") return (a.amount || 0) - (b.amount || 0);
      return 0;
    });

    return list;
  }, [unifiedInvoices, search, selectedCat, sortBy]);

  // Aggregate Metrics
  const totalAmount = useMemo(() => {
    return unifiedInvoices.reduce((s, inv) => s + (Number(inv.amount) || 0), 0);
  }, [unifiedInvoices]);

  const currentMonthInvoices = useMemo(() => {
    const curYM = new Date().toISOString().slice(0, 7);
    return unifiedInvoices.filter((inv) => (inv.date || "").startsWith(curYM));
  }, [unifiedInvoices]);

  const currentMonthAmount = useMemo(() => {
    return currentMonthInvoices.reduce((s, inv) => s + (Number(inv.amount) || 0), 0);
  }, [currentMonthInvoices]);

  const handleDownload = (inv) => {
    const link = document.createElement("a");
    link.href = inv.fileData;
    link.download = inv.fileName || `invoice_${inv.id}.png`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* TOP KPI CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Invoices Count */}
        <div
          className="rounded-2xl p-4 sm:p-5 border shadow-sm transition-all hover:shadow"
          style={{ background: C.card, borderColor: C.rule }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
              Invoices & Receipts
            </span>
            <span className="text-xl">🧾</span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold mt-2" style={{ color: C.ink, ...NUM }}>
            {unifiedInvoices.length}
          </div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>
            Directly linked to daily transactions
          </div>
        </div>

        {/* Total Amount of Invoices */}
        <div
          className="rounded-2xl p-4 sm:p-5 border shadow-sm transition-all hover:shadow"
          style={{ background: C.card, borderColor: C.rule }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
              Total Documented
            </span>
            <span className="text-xl">💳</span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold mt-2 text-red-500" style={NUM}>
            {inr(totalAmount)}
          </div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>
            Total amount backed by uploaded receipts
          </div>
        </div>

        {/* Current Month Invoices */}
        <div
          className="rounded-2xl p-4 sm:p-5 border shadow-sm transition-all hover:shadow"
          style={{ background: C.card, borderColor: C.rule }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>
              This Month ({currentMonthInvoices.length})
            </span>
            <span className="text-xl">📅</span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold mt-2" style={{ color: C.ink, ...NUM }}>
            {inr(currentMonthAmount)}
          </div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>
            Receipts logged in {new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN GALLERY CONTAINER */}
      {/* ========================================================================= */}
      <div
        className="rounded-2xl border shadow-sm overflow-hidden"
        style={{ background: C.card, borderColor: C.rule }}
      >
        {/* Header toolbar */}
        <div
          className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border-b"
          style={{ background: C.paper, borderColor: C.rule }}
        >
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.ink }}>
              Receipt & Invoice Gallery
            </h2>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              All invoices directly linked to Daily Tracker transactions without duplicate records
            </p>
          </div>

          <button
            onClick={() => {
              setUploadMode("link_existing");
              setShowUploadModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ background: "#2563EB" }}
          >
            <span>📎</span>
            <span>+ Attach / Upload Invoice</span>
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div
          className="p-4 flex flex-wrap items-center justify-between gap-3 border-b text-xs"
          style={{ borderColor: C.rule, background: C.card }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
            <span style={{ color: C.faint }}>🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by merchant, description, or file..."
              className="w-full rounded-xl border px-3 py-1.5 text-xs focus:outline-none"
              style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Filter */}
            <select
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
              className="rounded-xl border px-3 py-1.5 focus:outline-none"
              style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>

            {/* Sort by */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-xl border px-3 py-1.5 focus:outline-none"
              style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
            >
              <option value="newest">📅 Newest First</option>
              <option value="oldest">📅 Oldest First</option>
              <option value="highest">💰 Highest Amount</option>
              <option value="lowest">💰 Lowest Amount</option>
            </select>
          </div>
        </div>

        {/* Invoice Grid / Cards */}
        <div className="p-5">
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🧾</div>
              <h3 className="text-base font-semibold" style={{ color: C.ink }}>
                {unifiedInvoices.length === 0 ? "No invoices attached yet" : "No invoices match your filter"}
              </h3>
              <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: C.muted }}>
                Attach receipts to your daily expenses or upload medical bills, utility statements, and purchase invoices.
              </p>
              <button
                onClick={() => {
                  setUploadMode("link_existing");
                  setShowUploadModal(true);
                }}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                style={{ background: "#2563EB" }}
              >
                + Attach Invoice to Transaction
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredInvoices.map((inv) => {
                const cat = categories.find((c) => c.id === inv.category) || {
                  icon: "📦",
                  label: "Other",
                  color: "#94A3B8",
                };

                const isPdf = inv.fileType === "application/pdf" || (inv.fileName || "").endsWith(".pdf");

                // Account label
                let accountLabel = null;
                if (inv.accountId === "cash") accountLabel = "💵 Cash";
                else if (inv.accountId) {
                  const b = banks.find((item) => item.id === inv.accountId);
                  const cc = creditCards.find((item) => item.id === inv.accountId);
                  if (b) accountLabel = `🏦 ${b.name}`;
                  else if (cc) accountLabel = `💳 ${cc.name}`;
                  else accountLabel = inv.accountId;
                }

                return (
                  <div
                    key={inv.id || inv.txId}
                    className="rounded-2xl border overflow-hidden flex flex-col justify-between transition-all hover:shadow-md"
                    style={{ background: C.paper, borderColor: C.rule }}
                  >
                    <div>
                      {/* Thumbnail or Document Preview Bar */}
                      <div
                        onClick={() => setPreviewInvoice(inv)}
                        className="h-36 w-full flex items-center justify-center cursor-pointer relative overflow-hidden group border-b"
                        style={{
                          background: isPdf ? "#1E293B" : "#0F172A",
                          borderColor: C.rule,
                        }}
                      >
                        {isPdf ? (
                          <div className="flex flex-col items-center gap-1.5 text-center p-3">
                            <span className="text-4xl text-red-500">📄</span>
                            <span className="text-xs font-mono text-gray-300 truncate max-w-[200px]">
                              {inv.fileName}
                            </span>
                            <span className="text-[10px] text-gray-400">Click to preview PDF</span>
                          </div>
                        ) : inv.fileData ? (
                          <img
                            src={inv.fileData}
                            alt={inv.description}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <span className="text-3xl">🧾</span>
                        )}

                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1">
                          <span>👁️ View Full Invoice</span>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="p-4 space-y-2">
                        {inv.isDirectlyLinked && (
                          <div className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: "#10B98118", color: "#10B981" }}>
                            <span>🔗</span>
                            <span>Directly Linked to Transaction</span>
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-sm leading-snug truncate" style={{ color: C.ink }} title={inv.description}>
                            {inv.description}
                          </h4>
                          <span className="font-bold text-sm text-red-500 whitespace-nowrap" style={NUM}>
                            {inr(inv.amount)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span
                            className="px-2 py-0.5 rounded-full font-medium text-[11px]"
                            style={{ background: `${cat.color}1A`, color: cat.color }}
                          >
                            {cat.icon} {cat.label}
                          </span>
                          <span className="text-[11px]" style={{ color: C.faint }}>
                            📅 {inv.date}
                          </span>
                          {accountLabel && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                              style={{ background: "#3B82F615", color: "#3B82F6" }}
                            >
                              {accountLabel}
                            </span>
                          )}
                        </div>

                        {inv.fileName && (
                          <div className="text-[10px] font-mono truncate" style={{ color: C.faint }}>
                            📎 {inv.fileName} {inv.fileSize ? `(${Math.round(inv.fileSize / 1024)} KB)` : ""}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div
                      className="px-4 py-3 border-t flex items-center justify-between text-xs"
                      style={{ borderColor: C.rule, background: C.card }}
                    >
                      <button
                        onClick={() => setPreviewInvoice(inv)}
                        className="font-semibold text-blue-500 hover:underline flex items-center gap-1"
                      >
                        <span>👁️</span>
                        <span>Preview</span>
                      </button>

                      <div className="flex items-center gap-2">
                        {onNavigateToTab && (
                          <button
                            onClick={() => onNavigateToTab("daily")}
                            className="px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors hover:opacity-80"
                            style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
                            title="View in Daily Tracker"
                          >
                            📅 Tx
                          </button>
                        )}

                        <button
                          onClick={() => handleDownload(inv)}
                          className="px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors hover:opacity-80"
                          style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
                          title="Download Invoice"
                        >
                          ⬇️
                        </button>

                        <button
                          onClick={() => {
                            if (window.confirm("Detach this receipt from the transaction? The financial transaction and account balance will remain intact.")) {
                              if (onDetachInvoiceFromTx && inv.txId && inv.date) {
                                onDetachInvoiceFromTx(inv.date, inv.txId);
                              } else {
                                onDeleteInvoice(inv.id);
                              }
                            }
                          }}
                          className="p-1 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Detach / Remove Receipt"
                        >
                          ✂️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ATTACH / UPLOAD INVOICE MODAL (NO DUPLICATE TRANSACTIONS) */}
      {/* ========================================================================= */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div
            className="relative w-full max-w-lg my-auto rounded-2xl shadow-2xl overflow-hidden border"
            style={{ background: C.card, borderColor: C.rule }}
          >
            <div
              className="px-6 py-4 flex items-center justify-between border-b"
              style={{ background: C.paper, borderColor: C.rule }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">🧾</span>
                <h3 className="font-bold text-base" style={{ color: C.ink }}>
                  Attach Invoice / Receipt
                </h3>
              </div>
              <button
                onClick={handleResetUpload}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold border transition-colors"
                style={{ borderColor: C.rule, color: C.muted }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
              {/* Tab Selector: Link Existing vs New Tx */}
              <div className="flex p-1 rounded-xl border text-xs" style={{ background: C.paper, borderColor: C.rule }}>
                <button
                  type="button"
                  onClick={() => setUploadMode("link_existing")}
                  className="flex-1 py-1.5 px-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5"
                  style={{
                    background: uploadMode === "link_existing" ? "#2563EB" : "transparent",
                    color: uploadMode === "link_existing" ? "#fff" : C.muted,
                  }}
                >
                  <span>🔗</span>
                  <span>Link to Existing Transaction</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode("new_tx")}
                  className="flex-1 py-1.5 px-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5"
                  style={{
                    background: uploadMode === "new_tx" ? "#2563EB" : "transparent",
                    color: uploadMode === "new_tx" ? "#fff" : C.muted,
                  }}
                >
                  <span>➕</span>
                  <span>New Transaction with Invoice</span>
                </button>
              </div>

              {/* MODE 1: LINK TO EXISTING TRANSACTION */}
              {uploadMode === "link_existing" && (
                <div className="space-y-3">
                  <div className="text-[11px] rounded-lg p-2.5" style={{ background: "#10B98115", color: "#10B981" }}>
                    💡 <strong>Direct Linking:</strong> Select a transaction from your Daily Tracker to attach this receipt without registering it twice.
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold" style={{ color: C.ink }}>
                        1. Select Transaction to Attach Receipt to
                      </label>
                      <span className="text-[10px]" style={{ color: C.muted }}>
                        {allTransactions.length} available
                      </span>
                    </div>

                    <input
                      type="text"
                      value={txSearchQuery}
                      onChange={(e) => setTxSearchQuery(e.target.value)}
                      placeholder="Filter transactions by note, date, amount..."
                      className="w-full rounded-xl border px-3 py-1.5 text-xs focus:outline-none mb-2"
                      style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
                    />

                    <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border p-1.5" style={{ borderColor: C.rule, background: C.paper }}>
                      {eligibleTransactions.length === 0 ? (
                        <div className="text-center py-6 text-xs" style={{ color: C.muted }}>
                          No matching transactions found. Switch to "New Transaction" to create one.
                        </div>
                      ) : (
                        eligibleTransactions.map((t) => {
                          const cat = categories.find((c) => c.id === t.catId) || { icon: "📦", label: "Other" };
                          const isSelected = selectedTxId === t.id;
                          return (
                            <div
                              key={t.id}
                              onClick={() => setSelectedTxId(t.id)}
                              className="p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between text-xs"
                              style={{
                                background: isSelected ? "#2563EB15" : C.card,
                                borderColor: isSelected ? "#2563EB" : C.rule,
                              }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-base">{cat.icon}</span>
                                <div className="min-w-0">
                                  <div className="font-semibold truncate" style={{ color: C.ink }}>
                                    {t.note || cat.label}
                                  </div>
                                  <div className="text-[10px]" style={{ color: C.faint }}>
                                    📅 {t.date} · {t.type === "credit" ? "Income" : "Expense"}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="font-bold text-red-500" style={NUM}>
                                  {inr(t.amount)}
                                </div>
                                {t.invoice ? (
                                  <span className="text-[9px] text-blue-500 font-medium">📎 Has receipt</span>
                                ) : (
                                  <span className="text-[9px] text-emerald-500 font-medium">✨ Ready to link</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {selectedTx && (
                    <div className="p-3 rounded-xl border flex items-center justify-between text-xs" style={{ background: "#2563EB10", borderColor: "#2563EB40" }}>
                      <div>
                        <div className="font-bold text-blue-600 dark:text-blue-400">
                          🎯 Selected: {selectedTx.note || "Transaction"}
                        </div>
                        <div className="text-[11px]" style={{ color: C.muted }}>
                          📅 {selectedTx.date} · Amount: {inr(selectedTx.amount)}
                        </div>
                      </div>
                      <span className="text-emerald-500 font-bold">✓ Ready</span>
                    </div>
                  )}
                </div>
              )}

              {/* MODE 2: NEW TRANSACTION WITH INVOICE */}
              {uploadMode === "new_tx" && (
                <div className="space-y-3">
                  <div className="text-[11px] rounded-lg p-2.5" style={{ background: "#2563EB15", color: "#2563EB" }}>
                    💡 This will log the expense once in your Daily Tracker with the invoice attached.
                  </div>

                  {/* Amount & Date */}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-medium" style={{ color: C.muted }}>Amount (₹)</span>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-red-500">₹</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          value={uploadAmount}
                          onChange={(e) => setUploadAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-xl border pl-7 pr-3 py-2 text-sm font-bold text-red-500 focus:outline-none"
                          style={{ borderColor: C.rule, background: C.paper }}
                        />
                      </div>
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium" style={{ color: C.muted }}>Date</span>
                      <input
                        type="date"
                        required
                        value={uploadDate}
                        onChange={(e) => setUploadDate(e.target.value)}
                        className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                        style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
                      />
                    </label>
                  </div>

                  {/* Description */}
                  <label className="block">
                    <span className="text-xs font-medium" style={{ color: C.muted }}>Merchant / Note</span>
                    <input
                      type="text"
                      required
                      value={uploadDesc}
                      onChange={(e) => setUploadDesc(e.target.value)}
                      placeholder="e.g. Electricity Bill, Dental Clinic, Server Hosting"
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                      style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
                    />
                  </label>

                  {/* Category & Account */}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-medium" style={{ color: C.muted }}>Category</span>
                      <select
                        value={uploadCat}
                        onChange={(e) => setUploadCat(e.target.value)}
                        className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                        style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.icon} {c.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium" style={{ color: C.muted }}>Payment Source</span>
                      <select
                        value={uploadAccount}
                        onChange={(e) => setUploadAccount(e.target.value)}
                        className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                        style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
                      >
                        <option value="">— Select Account —</option>
                        <option value="cash">💵 Cash ({inr(cash)})</option>
                        {banks.map((b) => (
                          <option key={b.id} value={b.id}>
                            🏦 {b.name} ({inr(b.balance)})
                          </option>
                        ))}
                        {creditCards.map((cc) => (
                          <option key={cc.id} value={cc.id}>
                            💳 {cc.name} ({inr(Math.max(0, (cc.totalLimit || 0) - (cc.currentOutstanding || 0)))} left)
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {/* FILE DROPZONE (COMMON TO BOTH MODES) */}
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: C.ink }}>
                  {uploadMode === "link_existing" ? "2. Upload Invoice File" : "Invoice File"}
                </label>
                <div
                  className="rounded-xl border-2 border-dashed p-4 text-center cursor-pointer hover:border-blue-500 transition-colors"
                  style={{ borderColor: uploadFile ? "#3B82F6" : C.rule, background: C.paper }}
                  onClick={() => document.getElementById("fincompass-invoice-file-input")?.click()}
                >
                  <input
                    id="fincompass-invoice-file-input"
                    type="file"
                    accept="image/*,application/pdf"
                    required
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {uploadPreview ? (
                    <div className="space-y-2">
                      {uploadFile?.type === "application/pdf" ? (
                        <div className="text-3xl text-red-500">📄</div>
                      ) : (
                        <img
                          src={uploadPreview}
                          alt="Invoice Preview"
                          className="max-h-28 mx-auto rounded-lg shadow-sm object-contain"
                        />
                      )}
                      <div className="text-xs font-semibold truncate max-w-xs mx-auto" style={{ color: C.ink }}>
                        {uploadFile?.name} ({Math.round((uploadFile?.size || 0) / 1024)} KB)
                      </div>
                      <span className="text-[11px] text-blue-500 underline block">Click to change file</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-3xl">📤</div>
                      <div className="text-xs font-semibold" style={{ color: C.ink }}>
                        Click to browse or drop invoice file
                      </div>
                      <div className="text-[10px]" style={{ color: C.faint }}>
                        Supports JPG, PNG, WebP, and PDF up to 10MB
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* MODAL ACTIONS */}
              <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: C.rule }}>
                <button
                  type="button"
                  onClick={handleResetUpload}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border transition-colors"
                  style={{ borderColor: C.rule, color: C.muted, background: C.paper }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!uploadFile || (uploadMode === "link_existing" ? !selectedTxId : !uploadAmount)}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: "#2563EB" }}
                >
                  {uploadMode === "link_existing" ? "🔗 Attach to Transaction" : "➕ Record Transaction & Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FULL INVOICE PREVIEW LIGHTBOX MODAL */}
      {/* ========================================================================= */}
      {previewInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div
            className="relative w-full max-w-4xl my-auto rounded-2xl shadow-2xl overflow-hidden border flex flex-col max-h-[90vh]"
            style={{ background: C.card, borderColor: C.rule }}
          >
            {/* Header */}
            <div
              className="px-6 py-4 flex items-center justify-between border-b flex-shrink-0"
              style={{ background: C.paper, borderColor: C.rule }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base" style={{ color: C.ink }}>
                    {previewInvoice.description}
                  </h3>
                  {previewInvoice.isDirectlyLinked && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                      🔗 Linked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs flex-wrap" style={{ color: C.muted }}>
                  <span>📅 {previewInvoice.date}</span>
                  <span>·</span>
                  <span className="font-bold text-red-500" style={NUM}>Amount: {inr(previewInvoice.amount)}</span>
                  <span>·</span>
                  <span className="truncate max-w-xs">{previewInvoice.fileName}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onNavigateToTab && (
                  <button
                    onClick={() => {
                      setPreviewInvoice(null);
                      onNavigateToTab("daily");
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:opacity-80"
                    style={{ borderColor: C.rule, color: C.ink, background: C.paper }}
                  >
                    📅 View in Tracker
                  </button>
                )}

                <button
                  onClick={() => handleDownload(previewInvoice)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
                  style={{ background: "#2563EB" }}
                >
                  ⬇️ Download
                </button>

                <button
                  onClick={() => setPreviewInvoice(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border transition-colors"
                  style={{ borderColor: C.rule, color: C.muted }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Viewer Content */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex items-center justify-center bg-black/10 dark:bg-black/30 min-h-[350px]">
              {previewInvoice.fileType === "application/pdf" || (previewInvoice.fileName || "").endsWith(".pdf") ? (
                <div className="w-full h-[65vh] flex flex-col items-center justify-center gap-4">
                  <iframe
                    src={previewInvoice.fileData}
                    title={previewInvoice.description}
                    className="w-full h-full rounded-xl border shadow-sm"
                    style={{ borderColor: C.rule }}
                  />
                </div>
              ) : previewInvoice.fileData ? (
                <img
                  src={previewInvoice.fileData}
                  alt={previewInvoice.description}
                  className="max-h-[70vh] max-w-full rounded-xl shadow-lg object-contain"
                />
              ) : (
                <div className="text-center py-12" style={{ color: C.muted }}>
                  <span className="text-4xl block mb-2">📁</span>
                  File content not viewable in browser preview.
                </div>
              )}
            </div>

            {/* Lightbox Footer Actions */}
            <div className="px-6 py-3 border-t flex items-center justify-between text-xs" style={{ background: C.paper, borderColor: C.rule }}>
              <span style={{ color: C.muted }}>
                {previewInvoice.isDirectlyLinked ? "Directly attached to Daily Tracker entry" : "Archived invoice"}
              </span>
              <button
                onClick={() => {
                  if (window.confirm("Detach this receipt from the transaction? The transaction itself will remain.")) {
                    if (onDetachInvoiceFromTx && previewInvoice.txId && previewInvoice.date) {
                      onDetachInvoiceFromTx(previewInvoice.date, previewInvoice.txId);
                    } else {
                      onDeleteInvoice(previewInvoice.id);
                    }
                    setPreviewInvoice(null);
                  }
                }}
                className="px-3 py-1 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors border border-red-500/30 font-medium"
              >
                ✂️ Detach from Transaction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
