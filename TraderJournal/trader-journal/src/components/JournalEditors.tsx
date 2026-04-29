"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Shared save hook ─────────────────────────────────────────────────────────
type Status = "idle" | "saving" | "saved" | "error";

function useFieldSave(tradeId: number, field: string, onSaved?: () => void) {
  const [status, setStatus] = useState<Status>("idle");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const save = useCallback(
    async (value: string) => {
      setStatus("saving");
      try {
        const resp = await fetch(`/api/trade/${tradeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value }),
        });
        if (!resp.ok) throw new Error("Save failed");
        setStatus("saved");
        onSaved?.();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setStatus("idle"), 1500);
      } catch {
        setStatus("error");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setStatus("idle"), 3000);
      }
    },
    [tradeId, field, onSaved]
  );

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);
  return { status, save };
}

function StatusPill({ status }: { status: Status }) {
  if (status === "saved") return <span className="text-[10px] text-emerald-400">Saved</span>;
  if (status === "saving") return <span className="text-[10px] text-blue-400">Saving...</span>;
  if (status === "error") return <span className="text-[10px] text-red-400">Error</span>;
  return null;
}

// ─── Setup / Sub-Setup with autocomplete ──────────────────────────────────────
export function SetupEditor({
  value: initialValue,
  field,
  options,
  tradeId,
  onSaved,
  label,
  width = "w-40",
}: {
  value: string;
  field: "Setup" | "Sub-Setup";
  options: string[];
  tradeId: number;
  onSaved?: () => void;
  label: string;
  width?: string;
}) {
  const [value, setValue] = useState(initialValue || "");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { status, save } = useFieldSave(tradeId, field, onSaved);

  useEffect(() => { setValue(initialValue || ""); }, [initialValue]);

  const suggestions = value.trim()
    ? options.filter((o) => o.toLowerCase().includes(value.trim().toLowerCase()) && o !== value)
    : options.filter((o) => o !== value);

  const select = (v: string) => {
    setValue(v);
    setShowSuggestions(false);
    setHighlight(-1);
    save(v);
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <StatusPill status={status} />
      </div>
      <div ref={wrapperRef} className={cn("relative", width)}>
        <Input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setShowSuggestions(true); setHighlight(-1); }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((i) => Math.min(i + 1, suggestions.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") {
              e.preventDefault();
              if (highlight >= 0 && highlight < suggestions.length) select(suggestions[highlight]);
              else { setShowSuggestions(false); save(value.trim()); }
            } else if (e.key === "Escape") { setShowSuggestions(false); setHighlight(-1); }
          }}
          onBlur={() => setTimeout(() => {
            setShowSuggestions(false);
            if (value.trim() !== (initialValue || "")) save(value.trim());
          }, 150)}
          placeholder={`Set ${label.toLowerCase()}...`}
          className="h-8 bg-transparent border-slate-700 text-sm px-2 focus-visible:ring-1 focus-visible:ring-blue-500"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 mt-1 w-full max-h-40 overflow-y-auto rounded-md border border-slate-700 bg-slate-800 shadow-lg z-50">
            {suggestions.map((s, i) => (
              <button
                key={s}
                type="button"
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors",
                  i === highlight && "bg-slate-700 text-white"
                )}
                onMouseDown={(e) => { e.preventDefault(); select(s); }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── $ Risk numeric input ─────────────────────────────────────────────────────
export function DollarRiskEditor({
  value: initialValue,
  tradeId,
  onSaved,
}: {
  value: number;
  tradeId: number;
  onSaved?: () => void;
}) {
  const [value, setValue] = useState(initialValue ? String(initialValue) : "");
  const { status, save } = useFieldSave(tradeId, "$ Risk", onSaved);

  useEffect(() => { setValue(initialValue ? String(initialValue) : ""); }, [initialValue]);

  const commit = () => {
    const trimmed = value.trim();
    const original = initialValue ? String(initialValue) : "";
    if (trimmed !== original) save(trimmed);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">$ Risk</span>
        <StatusPill status={status} />
      </div>
      <div className="relative w-32">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); }
          }}
          placeholder="0.00"
          className="h-8 bg-transparent border-slate-700 text-sm pl-6 pr-2 focus-visible:ring-1 focus-visible:ring-blue-500"
        />
      </div>
    </div>
  );
}

// ─── Win Override 3-state toggle (Auto / Win / Loss) ──────────────────────────
export function WinOverrideEditor({
  winOverride,
  computedWin,
  tradeId,
  onSaved,
}: {
  winOverride: number | null;
  computedWin: number;
  tradeId: number;
  onSaved?: () => void;
}) {
  const { status, save } = useFieldSave(tradeId, "Win Override", onSaved);

  const click = (next: "auto" | 1 | 0) => {
    save(next === "auto" ? "" : String(next));
  };

  const isAuto = winOverride === null;
  const isWin = winOverride === 1 || (isAuto && computedWin === 1);
  const isLoss = winOverride === 0 || (isAuto && computedWin === 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Win Override</span>
        <StatusPill status={status} />
      </div>
      <div className="inline-flex rounded-md border border-slate-700 overflow-hidden">
        <button
          type="button"
          onClick={() => click("auto")}
          className={cn(
            "px-3 py-1 text-xs font-medium transition-colors border-r border-slate-700",
            isAuto
              ? "bg-slate-700 text-white"
              : "bg-transparent text-slate-400 hover:text-white hover:bg-slate-800"
          )}
        >
          Auto {isAuto && (computedWin === 1 ? "(W)" : "(L)")}
        </button>
        <button
          type="button"
          onClick={() => click(1)}
          className={cn(
            "px-3 py-1 text-xs font-medium transition-colors border-r border-slate-700",
            !isAuto && isWin
              ? "bg-emerald-600 text-white"
              : "bg-transparent text-slate-400 hover:text-white hover:bg-slate-800"
          )}
        >
          Win
        </button>
        <button
          type="button"
          onClick={() => click(0)}
          className={cn(
            "px-3 py-1 text-xs font-medium transition-colors",
            !isAuto && isLoss
              ? "bg-red-600 text-white"
              : "bg-transparent text-slate-400 hover:text-white hover:bg-slate-800"
          )}
        >
          Loss
        </button>
      </div>
    </div>
  );
}

// ─── X-flag 3-state toggle (0 / 0.5 / 1) ──────────────────────────────────────
export function XFlagToggle({
  label,
  value,
  field,
  tradeId,
  onSaved,
}: {
  label: string;
  value: number;
  field: string;
  tradeId: number;
  onSaved?: () => void;
}) {
  const { status, save } = useFieldSave(tradeId, field, onSaved);

  // Click cycles 0 -> 0.5 -> 1 -> 0
  const cycle = () => {
    const next = value === 0 ? 0.5 : value === 0.5 ? 1 : 0;
    save(String(next));
  };

  const setVal = (v: number) => save(String(v));

  // Display: badge color reflects severity
  const colorFor = (v: number) =>
    v === 0
      ? "border-slate-700 text-slate-400 bg-slate-900/50"
      : v === 0.5
        ? "border-amber-500/50 text-amber-400 bg-amber-500/10"
        : "border-red-500/50 text-red-400 bg-red-500/10";

  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-slate-800 bg-slate-900/30">
      <button
        type="button"
        onClick={cycle}
        className="flex-1 text-left text-xs text-slate-300 hover:text-white transition-colors"
        title="Click to cycle 0 → 0.5 → 1"
      >
        {label}
      </button>
      <div className="flex items-center gap-1">
        <StatusPill status={status} />
        <div className="inline-flex">
          {[0, 0.5, 1].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVal(v)}
              className={cn(
                "px-1.5 py-0.5 text-[10px] font-mono border first:rounded-l last:rounded-r -ml-px first:ml-0 transition-colors",
                value === v ? colorFor(v) : "border-slate-800 text-slate-600 hover:text-slate-300"
              )}
            >
              {v === 0.5 ? "½" : v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
