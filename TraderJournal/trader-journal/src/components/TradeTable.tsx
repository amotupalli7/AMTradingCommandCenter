"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { forwardRef } from "react";
import { Trade } from "@/lib/types";
import { TradeDetail } from "./TradeDetail";
import { BrokerLogo } from "./BrokerLogo";
import { useKeyboardNav } from "@/hooks/useKeyboardNav";
import { useFilters } from "@/context/FilterContext";
import { TradeFilters, EMPTY_TRADE_FILTERS, applyTradeFilters, UNJOURNALED_OPTION } from "@/components/FilterBar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isLongSide, tagColor, parseTags } from "@/lib/tradeUtils";
import { useChartPreload } from "@/hooks/useChartPreload";
import { useDatasets, Datasets } from "@/hooks/useDatasets";
import { exportTradesWorkbook } from "@/lib/exportXlsx";

// ─── Data filter types ──────────────────────────────────────────────────────
// dataFilters maps dataset name → selected value ("" = all)
type DataFilters = Record<string, string>;

function applyDataFilters(
  trades: Trade[],
  dataFilters: DataFilters,
  datasets: Datasets
): Trade[] {
  const active = Object.entries(dataFilters).filter(([, v]) => v !== "");
  if (active.length === 0) return trades;

  return trades.filter((trade) => {
    const id = String(trade["Trade ID"]);
    for (const [name, selected] of active) {
      const ds = datasets[name];
      if (!ds) continue;
      const val = ds.values[id] ?? "";
      if (val !== selected) return false;
    }
    return true;
  });
}

interface TradeTableProps {
  trades: Trade[];
  onRefresh: () => void;
}

function unique(arr: string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of arr) {
    if (!v) continue;
    const key = v.toLowerCase();
    if (!seen.has(key)) seen.set(key, v);
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

// ─── Local search filter (searches notes fields only) ────────────────────────
function applySearch(trades: Trade[], search: string): Trade[] {
  if (!search) return trades;
  const q = search.toLowerCase();
  return trades.filter((trade) => {
    const searchable = [
      trade["Entry Notes"],
      trade["Exit Notes"],
      trade.Notes,
      trade["Mistake Notes"],
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(q);
  });
}

// ─── Sort state ───────────────────────────────────────────────────────────────
type SortKey = "default" | "pnl" | "r" | "xscore";
type SortDir = "asc" | "desc";

function applySorting(trades: Trade[], sortBy: SortKey, sortDir: SortDir): Trade[] {
  if (sortBy === "default") {
    // Grouped: date (asc/desc) → ticker group (by first entry time on that date) → entry time asc within ticker
    const firstEntry: Record<string, string> = {};
    for (const t of trades) {
      const key = `${t.Date}__${t.Ticker}`;
      if (!firstEntry[key] || t["Enter Time"] < firstEntry[key]) {
        firstEntry[key] = t["Enter Time"];
      }
    }
    return [...trades].sort((a, b) => {
      // Date: flip direction based on sortDir
      const dateCompare = sortDir === "desc"
        ? b.Date.localeCompare(a.Date)
        : a.Date.localeCompare(b.Date);
      if (dateCompare !== 0) return dateCompare;
      // Ticker group order always follows the date direction
      const aFirst = firstEntry[`${a.Date}__${a.Ticker}`];
      const bFirst = firstEntry[`${b.Date}__${b.Ticker}`];
      const tickerCompare = aFirst.localeCompare(bFirst);
      if (tickerCompare !== 0) return tickerCompare;
      // Within ticker: always chronological
      return a["Enter Time"].localeCompare(b["Enter Time"]);
    });
  }

  const getValue = (t: Trade) => {
    if (sortBy === "pnl") return t["Net P&L"];
    if (sortBy === "r") return t["Net R"];
    return t["X Score"];
  };

  return [...trades].sort((a, b) => {
    const diff = getValue(a) - getValue(b);
    return sortDir === "asc" ? diff : -diff;
  });
}

// ─── Main component ───────────────────────────────────────────────────────────
export function TradeTable({ trades, onRefresh }: TradeTableProps) {
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const { filters, setFilters } = useFilters();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("default");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const chartUrls = useChartPreload();
  const { datasets } = useDatasets();
  const [dataFilters, setDataFilters] = useState<DataFilters>({});
  const [exportState, setExportState] = useState<"idle" | "working" | "error">("idle");

  // All unique tags across every trade (for autocomplete)
  const everyTag = useMemo(
    () => unique(trades.flatMap((t) => parseTags(t.Tags))),
    [trades]
  );

  // All unique triggers across every trade (for autocomplete)
  const everyTrigger = useMemo(
    () => unique(trades.map((t) => t.Trigger).filter(Boolean)),
    [trades]
  );

  // All unique setups / sub-setups across every trade (for autocomplete)
  const everySetup = useMemo(
    () => unique(trades.map((t) => t.Setup).filter(Boolean)),
    [trades]
  );
  const everySubSetup = useMemo(
    () => unique(trades.map((t) => t["Sub-Setup"]).filter(Boolean)),
    [trades]
  );

  const filteredTrades = useMemo(() => {
    const afterShared = applyTradeFilters(trades, filters);
    const afterSearch = applySearch(afterShared, search);
    const afterData = applyDataFilters(afterSearch, dataFilters, datasets);
    return applySorting(afterData, sortBy, sortDir);
  }, [trades, filters, search, dataFilters, datasets, sortBy, sortDir]);

  // Cascading option lists
  const afterSideResultDate = useMemo(() => applyTradeFilters(trades, {
    ...EMPTY_TRADE_FILTERS, side: filters.side, result: filters.result,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo,
  }), [trades, filters.side, filters.result, filters.dateFrom, filters.dateTo]);

  const withUnjournaled = (options: string[], raw: string[]): string[] => {
    const hasBlank = raw.some((v) => !v || v.trim() === "");
    if (!hasBlank) return options;
    const sentinelKey = UNJOURNALED_OPTION.toLowerCase();
    if (options.some((o) => o.toLowerCase() === sentinelKey)) return options;
    return [...options, UNJOURNALED_OPTION];
  };

  const allSetups = useMemo(() => {
    const raw = afterSideResultDate.map((t) => t.Setup);
    return withUnjournaled(unique(raw), raw);
  }, [afterSideResultDate]);

  const afterSetups = useMemo(() => applyTradeFilters(trades, {
    ...EMPTY_TRADE_FILTERS, side: filters.side, result: filters.result,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo, setups: filters.setups,
  }), [trades, filters.side, filters.result, filters.dateFrom, filters.dateTo, filters.setups]);

  const allSubSetups = useMemo(() => {
    const raw = afterSetups.map((t) => t["Sub-Setup"]);
    return withUnjournaled(unique(raw), raw);
  }, [afterSetups]);

  const afterSubSetups = useMemo(() => applyTradeFilters(trades, {
    ...EMPTY_TRADE_FILTERS, side: filters.side, result: filters.result,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo,
    setups: filters.setups, subSetups: filters.subSetups,
  }), [trades, filters.side, filters.result, filters.dateFrom, filters.dateTo, filters.setups, filters.subSetups]);

  const allTriggers = useMemo(() => {
    const raw = afterSubSetups.map((t) => t.Trigger ?? "");
    return withUnjournaled(unique(raw), raw);
  }, [afterSubSetups]);

  const afterTriggers = useMemo(() => applyTradeFilters(trades, {
    ...EMPTY_TRADE_FILTERS, side: filters.side, result: filters.result,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo,
    setups: filters.setups, subSetups: filters.subSetups, triggers: filters.triggers,
  }), [trades, filters.side, filters.result, filters.dateFrom, filters.dateTo, filters.setups, filters.subSetups, filters.triggers]);

  const allTags = useMemo(() => {
    const named = unique(afterTriggers.flatMap((t) => parseTags(t.Tags)));
    const hasUntagged = afterTriggers.some((t) => parseTags(t.Tags).length === 0);
    if (!hasUntagged) return named;
    const sentinelKey = UNJOURNALED_OPTION.toLowerCase();
    if (named.some((t) => t.toLowerCase() === sentinelKey)) return named;
    return [...named, UNJOURNALED_OPTION];
  }, [afterTriggers]);

  // Clicking a sortable column: if already active, flip direction; else switch to it (desc first)
  const handleSort = useCallback((key: SortKey) => {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  }, [sortBy]);

  const tradeIds = useMemo(
    () => filteredTrades.map((t) => t["Trade ID"]),
    [filteredTrades]
  );

  const handleSelect = useCallback((id: number | null) => {
    setSelectedTradeId(id);
  }, []);

  useKeyboardNav({ tradeIds, selectedTradeId, onSelect: handleSelect });

  useEffect(() => {
    if (selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedTradeId]);

  const selectedTrade = filteredTrades.find((t) => t["Trade ID"] === selectedTradeId);
  const selectedIndex = selectedTrade ? filteredTrades.indexOf(selectedTrade) : -1;

  // Helpers to toggle multi-select filter values
  const set = (patch: Partial<TradeFilters>) => setFilters({ ...filters, ...patch });
  const toggleSetup = (v: string) =>
    set({ setups: filters.setups.includes(v) ? filters.setups.filter((x) => x !== v) : [...filters.setups, v] });
  const toggleSubSetup = (v: string) =>
    set({ subSetups: filters.subSetups.includes(v) ? filters.subSetups.filter((x) => x !== v) : [...filters.subSetups, v] });
  const toggleTrigger = (v: string) =>
    set({ triggers: filters.triggers.includes(v) ? filters.triggers.filter((x) => x !== v) : [...filters.triggers, v] });
  const toggleTag = (v: string) =>
    set({ tags: filters.tags.includes(v) ? filters.tags.filter((x) => x !== v) : [...filters.tags, v] });
  const toggleExcludeTag = (v: string) =>
    set({ excludeTags: filters.excludeTags.includes(v) ? filters.excludeTags.filter((x) => x !== v) : [...filters.excludeTags, v] });

  // Count active filters
  const activeFilterCount =
    (filters.side ? 1 : 0) +
    (filters.result ? 1 : 0) +
    filters.setups.length +
    filters.subSetups.length +
    filters.triggers.length +
    filters.tags.length +
    filters.excludeTags.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.priceMin !== "" ? 1 : 0) +
    (filters.priceMax !== "" ? 1 : 0);

  const activeDataFilterCount = Object.values(dataFilters).filter((v) => v !== "").length;
  const hasActiveFilters = activeFilterCount > 0 || activeDataFilterCount > 0 || search !== "";

  return (
    <div className="space-y-3">
      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Notes search */}
        <Input
          type="text"
          placeholder="Search notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 bg-slate-900/50 border-slate-700 text-sm h-9"
        />

        {/* Side */}
        <select
          value={filters.side}
          onChange={(e) => set({ side: e.target.value })}
          className="bg-slate-900/50 border border-slate-700 rounded-md px-3 h-9 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Sides</option>
          <option value="Long">Long</option>
          <option value="Short">Short</option>
        </select>

        {/* Result */}
        <select
          value={filters.result}
          onChange={(e) => set({ result: e.target.value })}
          className="bg-slate-900/50 border border-slate-700 rounded-md px-3 h-9 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Results</option>
          <option value="win">Winners</option>
          <option value="loss">Losers</option>
        </select>

        {/* Setup dropdown */}
        <MultiSelectDropdown
          label="Setup"
          options={allSetups}
          selected={filters.setups}
          onToggle={toggleSetup}
          onSelectAll={(all) => set({ setups: all })}
        />

        {/* Sub-Setup dropdown */}
        <MultiSelectDropdown
          label="Sub-Setup"
          options={allSubSetups}
          selected={filters.subSetups}
          onToggle={toggleSubSetup}
          onSelectAll={(all) => set({ subSetups: all })}
        />

        {/* Trigger dropdown */}
        <MultiSelectDropdown
          label="Trigger"
          options={allTriggers}
          selected={filters.triggers}
          onToggle={toggleTrigger}
          onSelectAll={(all) => set({ triggers: all })}
        />

        {/* Tags dropdown */}
        <MultiSelectDropdown
          label="Tags"
          options={allTags}
          selected={filters.tags}
          onToggle={toggleTag}
          onSelectAll={(all) => set({ tags: all })}
          colorFn={tagColor}
        />
        <MultiSelectDropdown
          label="Exclude Tags"
          options={allTags}
          selected={filters.excludeTags}
          onToggle={toggleExcludeTag}
          onSelectAll={(all) => set({ excludeTags: all })}
          colorFn={tagColor}
          variant="exclude"
        />

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => set({ dateFrom: e.target.value })}
            className="bg-slate-900/50 border border-slate-700 rounded-md px-2 h-9 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 scheme-dark"
            title="From date"
          />
          <span className="text-slate-600 text-xs">–</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => set({ dateTo: e.target.value })}
            className="bg-slate-900/50 border border-slate-700 rounded-md px-2 h-9 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 scheme-dark"
            title="To date"
          />
        </div>

        {/* Price range */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-xs whitespace-nowrap">Price $</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Min"
            value={filters.priceMin}
            onChange={(e) => set({ priceMin: e.target.value })}
            className="bg-slate-900/50 border border-slate-700 rounded-md px-2 h-9 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-20"
          />
          <span className="text-slate-600 text-xs">–</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Max"
            value={filters.priceMax}
            onChange={(e) => set({ priceMax: e.target.value })}
            className="bg-slate-900/50 border border-slate-700 rounded-md px-2 h-9 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-20"
          />
        </div>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            onClick={() => { setFilters(EMPTY_TRADE_FILTERS); setSearch(""); setDataFilters({}); }}
            className="ml-1 text-xs px-2.5 h-9 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
          >
            Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
          {filteredTrades.length} / {trades.length} trade{trades.length !== 1 ? "s" : ""}
          &nbsp;&middot;&nbsp;Arrow keys to navigate
          <button
            onClick={async () => {
              if (exportState === "working") return;
              setExportState("working");
              try {
                await exportTradesWorkbook(filteredTrades);
                setExportState("idle");
              } catch (err) {
                console.error("Export failed:", err);
                setExportState("error");
                setTimeout(() => setExportState("idle"), 4000);
              }
            }}
            disabled={exportState === "working" || filteredTrades.length === 0}
            className="ml-1 px-2.5 h-7 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              exportState === "working"
                ? "Fetching Polygon traces — may take a few seconds"
                : exportState === "error"
                  ? "Export failed — see console"
                  : "Export filtered trades to XLSX (Trades / P&L Trace / Executions)"
            }
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
            </svg>
            {exportState === "working" ? "Exporting…" : exportState === "error" ? "Export failed" : "Export"}
          </button>
        </div>
      </div>

      {/* ── Data Filters Row ── */}
      {Object.keys(datasets).length > 0 && (
        <div className="flex flex-wrap gap-2 items-center border-t border-slate-800/50 pt-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Data</span>
          {Object.entries(datasets).map(([name, ds]) => (
            <select
              key={name}
              value={dataFilters[name] ?? ""}
              onChange={(e) =>
                setDataFilters((prev) => ({ ...prev, [name]: e.target.value }))
              }
              className={cn(
                "border rounded-md px-3 h-9 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500",
                dataFilters[name]
                  ? "border-violet-500/60 bg-violet-500/10 text-violet-300"
                  : "bg-slate-900/50 border-slate-700 text-slate-200"
              )}
            >
              <option value="">{name}: All</option>
              {ds.options.map((opt) => (
                <option key={opt} value={opt}>
                  {name}: {opt}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

      {/* ── Active filter badges ── */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] text-slate-600 uppercase tracking-wider">Filters:</span>

          {filters.side && (
            <ActiveBadge label={filters.side} onRemove={() => set({ side: "" })} />
          )}
          {filters.result && (
            <ActiveBadge
              label={filters.result === "win" ? "Winners" : "Losers"}
              onRemove={() => set({ result: "" })}
            />
          )}
          {filters.setups.map((s) => (
            <ActiveBadge key={s} label={`Setup: ${s}`} onRemove={() => toggleSetup(s)} />
          ))}
          {filters.subSetups.map((s) => (
            <ActiveBadge key={s} label={`Sub: ${s}`} onRemove={() => toggleSubSetup(s)} />
          ))}
          {filters.triggers.map((t) => (
            <ActiveBadge key={t} label={`Trigger: ${t}`} onRemove={() => toggleTrigger(t)} />
          ))}
          {filters.tags.map((t) => (
            <ActiveBadge key={t} label={t} onRemove={() => toggleTag(t)} colorClass={tagColor(t)} />
          ))}
          {filters.excludeTags.map((t) => (
            <ActiveBadge key={`ex-${t}`} label={`Exclude: ${t}`} onRemove={() => toggleExcludeTag(t)} colorClass="border-red-500/40 text-red-400 bg-red-500/10" />
          ))}
          {filters.dateFrom && (
            <ActiveBadge label={`From ${filters.dateFrom}`} onRemove={() => set({ dateFrom: "" })} />
          )}
          {filters.dateTo && (
            <ActiveBadge label={`To ${filters.dateTo}`} onRemove={() => set({ dateTo: "" })} />
          )}
          {filters.priceMin !== "" && (
            <ActiveBadge label={`Price ≥ $${filters.priceMin}`} onRemove={() => set({ priceMin: "" })} />
          )}
          {filters.priceMax !== "" && (
            <ActiveBadge label={`Price ≤ $${filters.priceMax}`} onRemove={() => set({ priceMax: "" })} />
          )}
          {Object.entries(dataFilters)
            .filter(([, v]) => v !== "")
            .map(([name, val]) => (
              <ActiveBadge
                key={`data-${name}`}
                label={`${name}: ${val}`}
                onRemove={() => setDataFilters((prev) => ({ ...prev, [name]: "" }))}
                colorClass="border-violet-500/40 text-violet-400 bg-violet-500/10"
              />
            ))}
        </div>
      )}

      {/* ── Trade List Table ── */}
      <div className="rounded-lg border border-slate-700/50 overflow-hidden bg-slate-900/30">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wider">
              <SortableHeader label="Date" align="left" sortKey="default" active={sortBy} dir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left font-medium">Ticker</th>
              <th className="px-4 py-3 text-left font-medium">Side</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <SortableHeader label="Net P&L" align="right" sortKey="pnl" active={sortBy} dir={sortDir} onSort={handleSort} />
              <SortableHeader label="Net R" align="right" sortKey="r" active={sortBy} dir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-center font-medium">W/L</th>
              <SortableHeader label="X Score" align="right" sortKey="xscore" active={sortBy} dir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left font-medium">Setup</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrades.map((trade) => {
              const isSelected = selectedTradeId === trade["Trade ID"];
              const pnlPositive = trade["Net P&L"] >= 0;
              return (
                <TradeRow
                  key={trade["Trade ID"]}
                  trade={trade}
                  isSelected={isSelected}
                  pnlPositive={pnlPositive}
                  onClick={() => handleSelect(isSelected ? null : trade["Trade ID"])}
                  ref={isSelected ? selectedRowRef : null}
                />
              );
            })}
            {filteredTrades.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                  No trades found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Fixed full-screen popout ── */}
      {selectedTrade && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50 bg-slate-900/95 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">
                Trade {selectedIndex + 1} of {filteredTrades.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { if (selectedIndex > 0) handleSelect(tradeIds[selectedIndex - 1]); }}
                  disabled={selectedIndex <= 0}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Previous trade (↑)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => { if (selectedIndex < filteredTrades.length - 1) handleSelect(tradeIds[selectedIndex + 1]); }}
                  disabled={selectedIndex >= filteredTrades.length - 1}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Next trade (↓)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-600">
                <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-500 font-mono">↑↓</kbd> navigate
                &nbsp;&middot;&nbsp;
                <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-500 font-mono">Esc</kbd> close
              </span>
              <button
                onClick={() => handleSelect(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Close (Esc)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto">
            <TradeDetail key={selectedTrade["Trade ID"]} trade={selectedTrade} allTags={everyTag} allTriggers={everyTrigger} allSetups={everySetup} allSubSetups={everySubSetup} chartUrl={chartUrls[selectedTrade["Trade ID"]]} onSaved={onRefresh} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sortable column header ───────────────────────────────────────────────────
function SortableHeader({
  label,
  align,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  align: "left" | "right" | "center";
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th
      className={cn(
        "px-4 py-3 font-medium cursor-pointer select-none hover:text-white transition-colors",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        isActive ? "text-blue-400" : ""
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {align === "right" && (
          <SortIcon active={isActive} dir={dir} />
        )}
        {label}
        {align !== "right" && (
          <SortIcon active={isActive} dir={dir} />
        )}
      </span>
    </th>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={cn("text-[10px] leading-none", active ? "text-blue-400" : "text-slate-600")}>
      {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────
function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
  onSelectAll,
  colorFn,
  variant,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onSelectAll: (all: string[]) => void;
  colorFn?: (v: string) => string;
  variant?: "default" | "exclude";
}) {
  const isExclude = variant === "exclude";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (options.length === 0) return null;

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;
  const allSelected = options.length > 0 && selected.length === options.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 px-3 h-9 rounded-md border text-sm transition-colors",
          selected.length > 0
            ? isExclude
              ? "border-red-500/60 bg-red-500/10 text-red-300"
              : "border-blue-500/60 bg-blue-500/10 text-blue-300"
            : "border-slate-700 bg-slate-900/50 text-slate-200 hover:border-slate-600"
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className={cn("text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center", isExclude ? "bg-red-500" : "bg-blue-500")}>
            {selected.length}
          </span>
        )}
        <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 min-w-45 max-h-72 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 flex flex-col">
          <input
            type="text"
            placeholder={`Search ${label.toLowerCase()}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mx-2 mt-1 mb-1 px-2 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <button
            onClick={() => onSelectAll(allSelected ? [] : options)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-blue-400 hover:bg-slate-800/50 border-b border-slate-700/50 font-medium"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
          <div className="overflow-y-auto">
            {filtered.map((opt) => {
              const checked = selected.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => onToggle(opt)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                    checked ? "bg-slate-800/80" : "hover:bg-slate-800/50"
                  )}
                >
                  <span
                    className={cn(
                      "w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center",
                      checked ? "bg-blue-500 border-blue-500" : "border-slate-600"
                    )}
                  >
                    {checked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  {colorFn ? (
                    <span className={cn("text-xs px-1.5 py-0.5 rounded border", colorFn(opt))}>{opt}</span>
                  ) : (
                    <span className="text-slate-200">{opt}</span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-500">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Active filter badge ──────────────────────────────────────────────────────
function ActiveBadge({
  label,
  onRemove,
  colorClass,
}: {
  label: string;
  onRemove: () => void;
  colorClass?: string;
}) {
  return (
    <button
      onClick={onRemove}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-opacity hover:opacity-70",
        colorClass || "border-slate-600 text-slate-300 bg-slate-800/60"
      )}
    >
      {label}
      <span className="opacity-50">&times;</span>
    </button>
  );
}

// ─── Trade row ────────────────────────────────────────────────────────────────
interface TradeRowProps {
  trade: Trade;
  isSelected: boolean;
  pnlPositive: boolean;
  onClick: () => void;
}

const TradeRow = forwardRef<HTMLTableRowElement, TradeRowProps>(
  function TradeRow({ trade, isSelected, pnlPositive, onClick }, ref) {
    return (
      <tr
        ref={ref}
        onClick={onClick}
        className={cn(
          "border-t border-slate-800/50 cursor-pointer transition-colors duration-150",
          isSelected
            ? "bg-blue-500/15 ring-1 ring-inset ring-blue-500/30"
            : "hover:bg-slate-800/30",
          pnlPositive
            ? "border-l-2 border-l-emerald-500/40"
            : "border-l-2 border-l-red-500/40"
        )}
      >
        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{trade.Date}</td>
        <td className="px-4 py-3 font-mono font-semibold text-white whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            <BrokerLogo broker={trade.Broker} size={14} />
            {trade.Ticker}
          </span>
        </td>
        <td className="px-4 py-3">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-semibold px-1.5",
              isLongSide(trade.Side)
                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                : "border-red-500/40 text-red-400 bg-red-500/10"
            )}
          >
            {trade.Side}
          </Badge>
        </td>
        <td className="px-4 py-3 text-right font-mono text-slate-300">${trade.Price.toFixed(2)}</td>
        <td className={cn("px-4 py-3 text-right font-mono font-medium", pnlPositive ? "text-emerald-400" : "text-red-400")}>
          {pnlPositive ? "+" : ""}${trade["Net P&L"].toFixed(2)}
        </td>
        <td className={cn("px-4 py-3 text-right font-mono", trade["Net R"] >= 0 ? "text-emerald-400" : "text-red-400")}>
          {trade["Net R"].toFixed(2)}R
        </td>
        <td className="px-4 py-3 text-center">
          {trade.Win === 1 ? (
            <span className="text-emerald-400 font-bold text-xs">W</span>
          ) : (
            <span className="text-red-400 font-bold text-xs">L</span>
          )}
        </td>
        <td className="px-4 py-3 text-right text-slate-400">
          {(trade["X Score"] * 100).toFixed(0)}%
        </td>
        <td className="px-4 py-3 text-slate-400 text-xs">
          {trade.Setup}
          {trade["Sub-Setup"] && (
            <span className="text-slate-600"> / {trade["Sub-Setup"]}</span>
          )}
        </td>
      </tr>
    );
  }
);
