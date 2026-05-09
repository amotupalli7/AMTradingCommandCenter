"use client";

import { Trade } from "@/lib/types";
import { EditableField } from "./EditableField";
import { TradeExecutionsTable } from "./TradeExecutionsTable";
import { TradePnLChart } from "./TradePnLChart";
import { useTradeExecutions } from "@/hooks/useTradeExecutions";
import {
  SetupEditor,
  DollarRiskEditor,
  WinOverrideEditor,
  XFlagToggle,
} from "./JournalEditors";
import { BrokerLogo } from "./BrokerLogo";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useState, useRef, useCallback, useEffect } from "react";
import { isLongSide, tagColor, parseTags } from "@/lib/tradeUtils";

interface TradeDetailProps {
  trade: Trade;
  allTags?: string[];
  allTriggers?: string[];
  allSetups?: string[];
  allSubSetups?: string[];
  chartUrl?: string;
  onSaved?: () => void;
}

export function TradeDetail({
  trade,
  allTags = [],
  allTriggers = [],
  allSetups = [],
  allSubSetups = [],
  chartUrl,
  onSaved,
}: TradeDetailProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Acc % shown on the card is the peak across all executions, computed
  // off the same data the executions table renders. SWR de-dupes the fetch.
  const { peakAccPct } = useTradeExecutions(trade["Trade ID"]);

  const imageSrc = chartUrl || `/api/trade/${trade["Trade ID"]}/image`;

  const pnlColor =
    trade["Net P&L"] >= 0 ? "text-emerald-400" : "text-red-400";
  const rColor = trade["Net R"] >= 0 ? "text-emerald-400" : "text-red-400";
  const xScoreColor =
    trade["X Score"] >= 0.8
      ? "text-emerald-400"
      : trade["X Score"] >= 0.5
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <BrokerLogo broker={trade.Broker} size={24} />
          <h2 className="text-2xl font-bold text-white font-mono">
            {trade.Ticker}
          </h2>
          <Badge
            variant="outline"
            className={cn(
              "text-xs font-semibold",
              isLongSide(trade.Side)
                ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                : "border-red-500/50 text-red-400 bg-red-500/10"
            )}
          >
            {trade.Side}
          </Badge>
          {trade.Setup && (
            <Badge
              variant="outline"
              className="text-xs border-blue-500/50 text-blue-400 bg-blue-500/10"
            >
              {trade.Setup}
            </Badge>
          )}
          {trade["Sub-Setup"] && (
            <Badge
              variant="outline"
              className="text-xs border-purple-500/50 text-purple-400 bg-purple-500/10"
            >
              {trade["Sub-Setup"]}
            </Badge>
          )}
          <span className="text-sm text-slate-400">
            {trade.Date} at {trade["Enter Time"]}
          </span>
        </div>

        {/* Chart Image — full width, right under header */}
        <div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-900/50">
          {!imageError ? (
            <>
              {!imageLoaded && (
                <div className="w-full aspect-video relative">
                  <Skeleton className="w-full h-full bg-slate-800" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm text-slate-500 animate-pulse">Loading chart...</span>
                  </div>
                </div>
              )}
              <img
                src={imageSrc}
                alt={`${trade.Ticker} chart`}
                className={cn(
                  "w-full object-contain cursor-zoom-in",
                  !imageLoaded && "hidden"
                )}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                onClick={() => setLightboxOpen(true)}
              />
            </>
          ) : (
            <div className="w-full aspect-video flex items-center justify-center text-slate-500 text-sm">
              No chart available
            </div>
          )}
        </div>

        {/* Chart Lightbox */}
        {lightboxOpen && imageLoaded && (
          <ChartLightbox
            src={imageSrc}
            alt={`${trade.Ticker} chart`}
            onClose={() => setLightboxOpen(false)}
          />
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <MetricCard
            label="Net P&L"
            value={`$${trade["Net P&L"].toFixed(2)}`}
            className={pnlColor}
          />
          <MetricCard
            label="Net R"
            value={`${trade["Net R"].toFixed(2)}R`}
            className={rColor}
          />
          <MetricCard
            label="Result"
            value={trade.Win === 1 ? "WIN" : "LOSS"}
            className={trade.Win === 1 ? "text-emerald-400" : "text-red-400"}
          />
          <MetricCard
            label="X Score"
            value={`${(trade["X Score"] * 100).toFixed(0)}%`}
            className={xScoreColor}
          />
          <MetricCard
            label="Entry Price"
            value={`$${trade.Price.toFixed(2)}`}
            className="text-slate-200"
          />
          <MetricCard
            label="Acc %"
            value={peakAccPct === null || peakAccPct === undefined
              ? "—"
              : `${peakAccPct.toFixed(1)}%`}
            className={
              peakAccPct === null || peakAccPct === undefined
                ? "text-slate-500"
                : peakAccPct >= 100
                  ? "text-red-400"
                  : peakAccPct >= 50
                    ? "text-yellow-400"
                    : "text-emerald-400"
            }
          />
        </div>

        {/* Trigger */}
        <TriggerEditor
          trigger={trade.Trigger}
          tradeId={trade["Trade ID"]}
          allTriggers={allTriggers}
          onSaved={onSaved}
        />

        {/* Tags as badges */}
        <TagsEditor
          tags={trade.Tags}
          tradeId={trade["Trade ID"]}
          allTags={allTags}
          onSaved={onSaved}
        />

        {/* Setup / Sub-Setup / $ Risk / Win Override row */}
        <div className="flex flex-wrap gap-6 items-end pt-2 border-t border-slate-800">
          <SetupEditor
            value={trade.Setup}
            field="Setup"
            options={allSetups}
            tradeId={trade["Trade ID"]}
            onSaved={onSaved}
            label="Setup"
          />
          <SetupEditor
            value={trade["Sub-Setup"]}
            field="Sub-Setup"
            options={allSubSetups}
            tradeId={trade["Trade ID"]}
            onSaved={onSaved}
            label="Sub-Setup"
          />
          <DollarRiskEditor
            value={trade["$ Risk"]}
            tradeId={trade["Trade ID"]}
            onSaved={onSaved}
          />
          <WinOverrideEditor
            winOverride={trade["Win Override"]}
            computedWin={trade.Win}
            tradeId={trade["Trade ID"]}
            onSaved={onSaved}
          />
        </div>

        {/* X-mistake flags */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            X-Mistake Flags <span className="text-slate-600 normal-case font-normal">(click value or label to set)</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <XFlagToggle
              label="Failing Goal"
              value={trade["X: Failing Goal"]}
              field="X: Failing Goal"
              tradeId={trade["Trade ID"]}
              onSaved={onSaved}
            />
            <XFlagToggle
              label="Non-Playbook"
              value={trade["X: Non-Playbook Trade"]}
              field="X: Non-Playbook Trade"
              tradeId={trade["Trade ID"]}
              onSaved={onSaved}
            />
            <XFlagToggle
              label="Selection"
              value={trade["X: Selection Mistake"]}
              field="X: Selection Mistake"
              tradeId={trade["Trade ID"]}
              onSaved={onSaved}
            />
            <XFlagToggle
              label="Entry"
              value={trade["X: Entry Mistake"]}
              field="X: Entry Mistake"
              tradeId={trade["Trade ID"]}
              onSaved={onSaved}
            />
            <XFlagToggle
              label="Sizing"
              value={trade["X: Sizing Mistake"]}
              field="X: Sizing Mistake"
              tradeId={trade["Trade ID"]}
              onSaved={onSaved}
            />
            <XFlagToggle
              label="Exit"
              value={trade["X: Exit Mistake"]}
              field="X: Exit Mistake"
              tradeId={trade["Trade ID"]}
              onSaved={onSaved}
            />
            <XFlagToggle
              label="Emotional"
              value={trade["X: Emotional Mistake"]}
              field="X: Emotional Mistake"
              tradeId={trade["Trade ID"]}
              onSaved={onSaved}
            />
            <XFlagToggle
              label="Preparation"
              value={trade["X: Preparation Mistake"]}
              field="X: Preparation Mistake"
              tradeId={trade["Trade ID"]}
              onSaved={onSaved}
            />
          </div>
        </div>

        {/* Editable Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditableField
            label="Entry Notes"
            value={trade["Entry Notes"]}
            tradeId={trade["Trade ID"]}
            field="Entry Notes"
            onSaved={onSaved}
          />
          <EditableField
            label="Exit Notes"
            value={trade["Exit Notes"]}
            tradeId={trade["Trade ID"]}
            field="Exit Notes"
            onSaved={onSaved}
          />
          <EditableField
            label="Notes"
            value={trade.Notes}
            tradeId={trade["Trade ID"]}
            field="Notes"
            onSaved={onSaved}
          />
          <EditableField
            label="Mistake Notes"
            value={trade["Mistake Notes"]}
            tradeId={trade["Trade ID"]}
            field="Mistake Notes"
            onSaved={onSaved}
          />
        </div>

        <div className="pt-4 border-t border-slate-800 space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            P&amp;L Trace
          </h3>
          <TradePnLChart tradeId={trade["Trade ID"]} />
        </div>

        <TradeExecutionsTable tradeId={trade["Trade ID"]} />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  className,
  small,
}: {
  label: string;
  value: string;
  className?: string;
  small?: boolean;
}) {
  return (
    <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
        {label}
      </div>
      <div
        className={cn(
          "font-semibold mt-0.5 font-mono",
          small ? "text-sm" : "text-lg",
          className
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Chart Lightbox with zoom & pan ──────────────────────────────────────────
function ChartLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const isZoomed = scale !== 1 || translate.x !== 0 || translate.y !== 0;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onClose]);

  // Zoom toward mouse cursor position
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prevScale) => {
      const newScale = Math.min(Math.max(0.5, prevScale * zoomFactor), 10);
      // Zoom toward cursor: adjust translate so the point under cursor stays fixed
      const rect = imgRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        const ratio = 1 - newScale / prevScale;
        setTranslate((t) => ({
          x: t.x + cx * ratio,
          y: t.y + cy * ratio,
        }));
      }
      return newScale;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    didDrag.current = false;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
    setTranslate((t) => ({ x: t.x + dx, y: t.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  return (
    <div
      className="fixed inset-0 z-100 bg-black/90 flex items-center justify-center"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <span className="text-xs text-slate-400 mr-2">{Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale((s) => Math.min(s + 0.5, 10))}
          className="p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          title="Zoom in"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12M6 12h12" />
          </svg>
        </button>
        <button
          onClick={() => setScale((s) => Math.max(s - 0.5, 0.5))}
          className="p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          title="Zoom out"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h12" />
          </svg>
        </button>
        <button
          onClick={resetView}
          className="p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          title="Reset zoom"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115.36-6.36M20 15a9 9 0 01-15.36 6.36" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          title="Close (Esc)"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-slate-500 pointer-events-none select-none">
        Scroll to zoom &middot; Drag to pan &middot; Esc to close
      </div>

      {/* Image */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] select-none"
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          cursor: dragging.current ? "grabbing" : "grab",
          transition: dragging.current ? "none" : "transform 0.1s ease-out",
        }}
        draggable={false}
        onMouseDown={handleMouseDown}
        onClick={() => {
          // Close only if user didn't drag and isn't zoomed
          if (!didDrag.current && !isZoomed) onClose();
        }}
      />
    </div>
  );
}

function TriggerEditor({
  trigger: initialTrigger,
  tradeId,
  allTriggers = [],
  onSaved,
}: {
  trigger: string;
  tradeId: number;
  allTriggers?: string[];
  onSaved?: () => void;
}) {
  const [value, setValue] = useState(initialTrigger || "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const suggestions = value.trim()
    ? allTriggers.filter(
        (t) => t.toLowerCase().includes(value.trim().toLowerCase()) && t !== value
      )
    : allTriggers.filter((t) => t !== value);

  const save = useCallback(
    async (newValue: string) => {
      setStatus("saving");
      try {
        const resp = await fetch(`/api/trade/${tradeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "Trigger", value: newValue }),
        });
        if (!resp.ok) throw new Error("Save failed");
        setStatus("saved");
        onSaved?.();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setStatus("idle"), 2000);
      } catch {
        setStatus("error");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setStatus("idle"), 3000);
      }
    },
    [tradeId, onSaved]
  );

  const selectSuggestion = useCallback(
    (val: string) => {
      setValue(val);
      setShowSuggestions(false);
      setHighlightIndex(-1);
      save(val);
    },
    [save]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        selectSuggestion(suggestions[highlightIndex]);
      } else {
        setShowSuggestions(false);
        save(value.trim());
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightIndex(-1);
    }
  };

  // Close dropdown on outside click
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
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Trigger
        </span>
        {status === "saved" && <span className="text-xs text-emerald-400">Saved</span>}
        {status === "error" && <span className="text-xs text-red-400">Error</span>}
        {status === "saving" && <span className="text-xs text-blue-400">Saving...</span>}
      </div>
      <div ref={wrapperRef} className="relative w-56">
        <Input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setShowSuggestions(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setTimeout(() => {
              setShowSuggestions(false);
              if (value.trim() !== initialTrigger) save(value.trim());
            }, 150);
          }}
          placeholder="Set trigger..."
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
                  i === highlightIndex && "bg-slate-700 text-white"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(s);
                }}
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

function TagsEditor({
  tags: rawTags,
  tradeId,
  allTags: allTagsProp = [],
  onSaved,
}: {
  tags: string;
  tradeId: number;
  allTags?: string[];
  onSaved?: () => void;
}) {
  const [tags, setTags] = useState<string[]>(() => parseTags(rawTags));
  const [inputValue, setInputValue] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Filter suggestions: match input, exclude already-added tags
  const suggestions = inputValue.trim()
    ? allTagsProp.filter(
        (t) =>
          t.toLowerCase().includes(inputValue.trim().toLowerCase()) &&
          !tags.includes(t)
      )
    : allTagsProp.filter((t) => !tags.includes(t));

  const save = useCallback(
    async (newTags: string[]) => {
      setStatus("saving");
      const csv = newTags.length > 0 ? newTags.join(", ") + "," : "";
      try {
        const resp = await fetch(`/api/trade/${tradeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "Tags", value: csv }),
        });
        if (!resp.ok) throw new Error("Save failed");
        setStatus("saved");
        onSaved?.();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setStatus("idle"), 2000);
      } catch {
        setStatus("error");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setStatus("idle"), 3000);
      }
    },
    [tradeId, onSaved]
  );

  const addTag = useCallback((val?: string) => {
    const tagVal = (val ?? inputValue).trim();
    if (!tagVal || tags.includes(tagVal)) {
      setInputValue("");
      setShowSuggestions(false);
      return;
    }
    const newTags = [...tags, tagVal];
    setTags(newTags);
    setInputValue("");
    setShowSuggestions(false);
    setHighlightIndex(-1);
    save(newTags);
  }, [inputValue, tags, save]);

  const removeTag = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    setTags(newTags);
    save(newTags);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        addTag(suggestions[highlightIndex]);
      } else {
        addTag();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightIndex(-1);
    } else if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  // Close dropdown on outside click
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
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Tags
        </span>
        {status === "saved" && <span className="text-xs text-emerald-400">Saved</span>}
        {status === "error" && <span className="text-xs text-red-400">Error</span>}
        {status === "saving" && <span className="text-xs text-blue-400">Saving...</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {tags.map((tag, i) => (
          <Badge
            key={`${tag}-${i}`}
            variant="outline"
            className={cn(
              "text-xs font-medium cursor-pointer hover:opacity-70 transition-opacity",
              tagColor(tag)
            )}
            onClick={() => removeTag(i)}
            title="Click to remove"
          >
            {tag}
            <span className="ml-1 opacity-50">&times;</span>
          </Badge>
        ))}
        <div ref={wrapperRef} className="relative">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowSuggestions(true);
              setHighlightIndex(-1);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Delay so click on suggestion fires first
              setTimeout(() => {
                if (inputValue.trim()) addTag();
                setShowSuggestions(false);
              }, 150);
            }}
            placeholder={tags.length === 0 ? "Add tags..." : "+"}
            className="h-7 w-28 bg-transparent border-slate-700 text-xs px-2 focus-visible:ring-1 focus-visible:ring-blue-500"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-48 max-h-40 overflow-y-auto rounded-md border border-slate-700 bg-slate-800 shadow-lg z-50">
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors",
                    i === highlightIndex && "bg-slate-700 text-white"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent input blur
                    addTag(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
