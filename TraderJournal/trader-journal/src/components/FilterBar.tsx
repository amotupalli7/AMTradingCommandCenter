"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { tagColor, parseTags } from "@/lib/tradeUtils";
import { Trade } from "@/lib/types";

// ─── Filter state (exported so pages can share the type) ──────────────────────
export interface TradeFilters {
  side: string;
  result: string;
  setups: string[];
  subSetups: string[];
  tags: string[];
  excludeTags: string[];
  dateFrom: string;
  dateTo: string;
  priceMin: string;
  priceMax: string;
}

export const EMPTY_TRADE_FILTERS: TradeFilters = {
  side: "",
  result: "",
  setups: [],
  subSetups: [],
  tags: [],
  excludeTags: [],
  dateFrom: "",
  dateTo: "",
  priceMin: "",
  priceMax: "",
};

// ─── Apply filters to a trades array ─────────────────────────────────────────
import { isLongSide } from "@/lib/tradeUtils";

export function applyTradeFilters(trades: Trade[], f: TradeFilters): Trade[] {
  const filterSetups = f.setups.map((s) => s.toLowerCase());
  const filterSubSetups = f.subSetups.map((s) => s.toLowerCase());
  const filterTags = f.tags.map((t) => t.toLowerCase());
  const excludeTags = f.excludeTags.map((t) => t.toLowerCase());

  return trades.filter((trade) => {
    if (f.side) {
      const isLong = isLongSide(trade.Side);
      if (f.side === "Long" && !isLong) return false;
      if (f.side === "Short" && isLong) return false;
    }
    if (f.result === "win" && trade.Win !== 1) return false;
    if (f.result === "loss" && trade.Win !== 0) return false;
    if (filterSetups.length > 0 && !filterSetups.includes(trade.Setup.toLowerCase())) return false;
    if (filterSubSetups.length > 0 && !filterSubSetups.includes(trade["Sub-Setup"].toLowerCase())) return false;
    if (filterTags.length > 0 || excludeTags.length > 0) {
      const tradeTags = parseTags(trade.Tags).map((t) => t.toLowerCase());
      if (filterTags.length > 0 && !filterTags.some((t) => tradeTags.includes(t))) return false;
      if (excludeTags.length > 0 && excludeTags.some((t) => tradeTags.includes(t))) return false;
    }
    if (f.dateFrom && trade.Date < f.dateFrom) return false;
    if (f.dateTo && trade.Date > f.dateTo) return false;
    if (f.priceMin !== "" && trade.Price < parseFloat(f.priceMin)) return false;
    if (f.priceMax !== "" && trade.Price > parseFloat(f.priceMax)) return false;
    return true;
  });
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

// ─── FilterBar component ──────────────────────────────────────────────────────
interface FilterBarProps {
  trades: Trade[]; // all trades (for populating option lists)
  filters: TradeFilters;
  onChange: (f: TradeFilters) => void;
  totalCount: number;
  filteredCount: number;
}

export function FilterBar({ trades, filters, onChange, totalCount, filteredCount }: FilterBarProps) {
  const set = (patch: Partial<TradeFilters>) => onChange({ ...filters, ...patch });

  // Cascading options: each list is derived from trades passing all upstream filters
  const afterSideResultDate = useMemo(() => applyTradeFilters(trades, {
    ...EMPTY_TRADE_FILTERS, side: filters.side, result: filters.result,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo,
  }), [trades, filters.side, filters.result, filters.dateFrom, filters.dateTo]);

  const allSetups = useMemo(
    () => unique(afterSideResultDate.map((t) => t.Setup)),
    [afterSideResultDate]
  );

  const afterSetups = useMemo(() => applyTradeFilters(trades, {
    ...EMPTY_TRADE_FILTERS, side: filters.side, result: filters.result,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo, setups: filters.setups,
  }), [trades, filters.side, filters.result, filters.dateFrom, filters.dateTo, filters.setups]);

  const allSubSetups = useMemo(
    () => unique(afterSetups.map((t) => t["Sub-Setup"])),
    [afterSetups]
  );

  const afterSubSetups = useMemo(() => applyTradeFilters(trades, {
    ...EMPTY_TRADE_FILTERS, side: filters.side, result: filters.result,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo,
    setups: filters.setups, subSetups: filters.subSetups,
  }), [trades, filters.side, filters.result, filters.dateFrom, filters.dateTo, filters.setups, filters.subSetups]);

  const allTags = useMemo(
    () => unique(afterSubSetups.flatMap((t) => parseTags(t.Tags))),
    [afterSubSetups]
  );

  // Drop selected values that are no longer valid after upstream changes
  useEffect(() => {
    const validSetups = new Set(allSetups);
    const validSubSetups = new Set(allSubSetups);
    const validTags = new Set(allTags);
    const nextSetups = filters.setups.filter((s) => validSetups.has(s));
    const nextSubSetups = filters.subSetups.filter((s) => validSubSetups.has(s));
    const nextTags = filters.tags.filter((t) => validTags.has(t));
    const nextExcludeTags = filters.excludeTags.filter((t) => validTags.has(t));
    if (
      nextSetups.length !== filters.setups.length ||
      nextSubSetups.length !== filters.subSetups.length ||
      nextTags.length !== filters.tags.length ||
      nextExcludeTags.length !== filters.excludeTags.length
    ) {
      onChange({ ...filters, setups: nextSetups, subSetups: nextSubSetups, tags: nextTags, excludeTags: nextExcludeTags });
    }
  }, [allSetups, allSubSetups, allTags]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSetup = (v: string) =>
    set({ setups: filters.setups.includes(v) ? filters.setups.filter((x) => x !== v) : [...filters.setups, v] });
  const toggleSubSetup = (v: string) =>
    set({ subSetups: filters.subSetups.includes(v) ? filters.subSetups.filter((x) => x !== v) : [...filters.subSetups, v] });
  const toggleTag = (v: string) =>
    set({ tags: filters.tags.includes(v) ? filters.tags.filter((x) => x !== v) : [...filters.tags, v] });
  const toggleExcludeTag = (v: string) =>
    set({ excludeTags: filters.excludeTags.includes(v) ? filters.excludeTags.filter((x) => x !== v) : [...filters.excludeTags, v] });

  const activeCount =
    (filters.side ? 1 : 0) +
    (filters.result ? 1 : 0) +
    filters.setups.length +
    filters.subSetups.length +
    filters.tags.length +
    filters.excludeTags.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.priceMin !== "" ? 1 : 0) +
    (filters.priceMax !== "" ? 1 : 0);
  const hasActive = activeCount > 0;

  return (
    <div className="space-y-2">
      {/* Row */}
      <div className="flex flex-wrap gap-2 items-center">
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

        <MultiSelectDropdown
          label="Setup"
          options={allSetups}
          selected={filters.setups}
          onToggle={toggleSetup}
          onSelectAll={(all) => set({ setups: all })}
        />
        <MultiSelectDropdown
          label="Sub-Setup"
          options={allSubSetups}
          selected={filters.subSetups}
          onToggle={toggleSubSetup}
          onSelectAll={(all) => set({ subSetups: all })}
        />
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

        {hasActive && (
          <button
            onClick={() => onChange(EMPTY_TRADE_FILTERS)}
            className="text-xs px-2.5 h-9 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
          >
            Clear filters
          </button>
        )}

        <div className="ml-auto text-xs text-slate-500 whitespace-nowrap">
          {filteredCount} / {totalCount} trade{totalCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Active filter badges */}
      {hasActive && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] text-slate-600 uppercase tracking-wider">Filters:</span>
          {filters.side && (
            <ActiveBadge label={filters.side} onRemove={() => set({ side: "" })} />
          )}
          {filters.result && (
            <ActiveBadge label={filters.result === "win" ? "Winners" : "Losers"} onRemove={() => set({ result: "" })} />
          )}
          {filters.setups.map((s) => (
            <ActiveBadge key={s} label={`Setup: ${s}`} onRemove={() => toggleSetup(s)} />
          ))}
          {filters.subSetups.map((s) => (
            <ActiveBadge key={s} label={`Sub: ${s}`} onRemove={() => toggleSubSetup(s)} />
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
        </div>
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────
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
