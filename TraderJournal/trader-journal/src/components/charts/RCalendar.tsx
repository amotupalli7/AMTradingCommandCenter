"use client";

import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useFilters } from "@/context/FilterContext";

interface RCalendarProps {
  data: Record<string, number>; // "YYYY-MM-DD" → daily Net R total
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Get cells for a month grid (Monday-start). Returns array of 42 slots (6 weeks). */
function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  // getDay() → 0=Sun, convert to Mon-start: Mon=0 … Sun=6
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  // Leading empty cells
  for (let i = 0; i < startDow; i++) cells.push(null);
  // Day cells
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Trailing empty cells to fill last row
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function rToColor(r: number): string {
  if (r > 0) return "rgba(34, 197, 94, 0.25)";
  if (r < 0) return "rgba(239, 68, 68, 0.25)";
  return "rgba(100, 116, 139, 0.1)";
}

export function RCalendar({ data }: RCalendarProps) {
  const { filters, setFilters } = useFilters();

  // Determine initial month from latest date in data, or fallback to today
  const latestDate = useMemo(() => {
    const dates = Object.keys(data).sort();
    if (dates.length === 0) return new Date();
    const d = new Date(dates[dates.length - 1] + "T00:00:00");
    return isNaN(d.getTime()) ? new Date() : d;
  }, [data]);

  const [year, setYear] = useState(latestDate.getFullYear());
  const [month, setMonth] = useState(latestDate.getMonth());

  // Sync to latest date when data changes significantly (e.g. filters cleared)
  useEffect(() => {
    setYear(latestDate.getFullYear());
    setMonth(latestDate.getMonth());
  }, [latestDate]);

  const cells = useMemo(() => getMonthGrid(year, month), [year, month]);

  const monthLabel = new Date(year, month).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  // Monthly totals
  const monthStats = useMemo(() => {
    let totalR = 0;
    let tradingDays = 0;
    for (const [dateStr, r] of Object.entries(data)) {
      const d = new Date(dateStr + "T00:00:00");
      if (d.getFullYear() === year && d.getMonth() === month) {
        totalR += r;
        tradingDays++;
      }
    }
    return { totalR, tradingDays };
  }, [data, year, month]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const handleDayClick = (day: number) => {
    const dateStr = toDateStr(year, month, day);
    // If already filtered to this exact day, clear the date filter
    if (filters.dateFrom === dateStr && filters.dateTo === dateStr) {
      setFilters({ ...filters, dateFrom: "", dateTo: "" });
    } else {
      setFilters({ ...filters, dateFrom: dateStr, dateTo: dateStr });
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-slate-200 w-36 text-center">
            {monthLabel}
          </span>
          <button
            onClick={nextMonth}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-slate-500">
            {monthStats.tradingDays} trading day{monthStats.tradingDays !== 1 ? "s" : ""}
          </span>
          <span
            className={cn(
              "font-mono font-medium",
              monthStats.totalR >= 0 ? "text-emerald-400" : "text-red-400"
            )}
          >
            {monthStats.totalR >= 0 ? "+" : ""}
            {monthStats.totalR.toFixed(2)}R
          </span>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5 max-w-md mx-auto">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[9px] text-slate-600 font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 max-w-md mx-auto">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="h-7" />;
          }

          const dateStr = toDateStr(year, month, day);
          const r = data[dateStr];
          const hasData = r !== undefined;
          const isSelected = filters.dateFrom === dateStr && filters.dateTo === dateStr;

          return (
            <button
              key={dateStr}
              onClick={() => hasData && handleDayClick(day)}
              className={cn(
                "h-7 rounded flex items-center justify-center gap-0.5 transition-all text-center",
                hasData
                  ? "cursor-pointer hover:ring-1 hover:ring-slate-500"
                  : "cursor-default",
                isSelected && "ring-1 ring-blue-500"
              )}
              style={{
                backgroundColor: hasData ? rToColor(r) : undefined,
              }}
              disabled={!hasData}
            >
              <span
                className={cn(
                  "text-[9px] leading-none",
                  hasData ? "text-slate-400" : "text-slate-700"
                )}
              >
                {day}
              </span>
              {hasData && (
                <span
                  className={cn(
                    "text-[9px] font-mono font-medium leading-none",
                    r >= 0 ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {r >= 0 ? "+" : ""}
                  {r.toFixed(1)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
