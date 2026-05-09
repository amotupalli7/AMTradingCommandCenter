"use client";
import { fmtPrice, fmtPct, fmtVolume, pctClass } from "@/lib/fmt";
import type { AlertRow, ScannerRow } from "@/lib/api";

type Col = {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: string;
  render: (r: ScannerRow & Partial<AlertRow>) => React.ReactNode;
};

export function ScannerTable({
  title,
  rows,
  columns,
  selected,
  onSelect,
  emptyHint,
}: {
  title: string;
  rows: (ScannerRow | AlertRow)[];
  columns: Col[];
  selected: string | null;
  onSelect: (ticker: string) => void;
  emptyHint?: string;
}) {
  return (
    <section className="flex flex-col min-h-0 border border-border bg-panel">
      <header className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <h2 className="text-xs uppercase tracking-wider text-muted">{title}</h2>
        <span className="text-xs text-muted">{rows.length}</span>
      </header>
      <div className="overflow-y-auto thin-scroll flex-1">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-panel">
            <tr className="text-muted">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-2 py-1 font-normal ${c.align === "right" ? "text-right" : "text-left"}`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-muted">
                  {emptyHint ?? "—"}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isSel = selected === r.ticker;
              return (
                <tr
                  key={r.ticker}
                  onClick={() => onSelect(r.ticker)}
                  className={`cursor-pointer border-t border-border/50 hover:bg-border/40 ${
                    isSel ? "bg-border/60" : ""
                  }`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-2 py-1 whitespace-nowrap ${
                        c.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function GapColumns(): Col[] {
  return [
    { key: "ticker", label: "Symbol", render: (r) => <span className="font-semibold">{r.ticker}</span> },
    { key: "price", label: "Price", align: "right", render: (r) => fmtPrice(r.last_price) },
    {
      key: "gap",
      label: "Gap %",
      align: "right",
      render: (r) => <span className={pctClass(r.gap_pct)}>{fmtPct(r.gap_pct)}</span>,
    },
    { key: "vol", label: "Vol", align: "right", render: (r) => fmtVolume(r.total_volume) },
  ];
}

export function RunnerColumns(): Col[] {
  return [
    { key: "ticker", label: "Symbol", render: (r) => <span className="font-semibold">{r.ticker}</span> },
    { key: "price", label: "Price", align: "right", render: (r) => fmtPrice(r.last_price) },
    {
      key: "open",
      label: "Open %",
      align: "right",
      render: (r) => <span className={pctClass(r.intraday_gap_pct)}>{fmtPct(r.intraday_gap_pct)}</span>,
    },
    { key: "vol", label: "Vol", align: "right", render: (r) => fmtVolume(r.total_volume) },
  ];
}

const ALERT_BADGES: Record<string, { label: string; cls: string }> = {
  new_gapper: { label: "GAP",  cls: "bg-accent/20 text-accent" },
  new_runner: { label: "RUN",  cls: "bg-blue-500/20 text-blue-300" },
  hod:        { label: "HOD",  cls: "bg-accent/20 text-accent" },
  backside:   { label: "BS",   cls: "bg-warn/20 text-warn" },
};

export function AlertColumns(): Col[] {
  return [
    { key: "ticker", label: "Symbol", render: (r) => <span className="font-semibold">{r.ticker}</span> },
    {
      key: "kind",
      label: "Kind",
      render: (r) => {
        const kinds = (r as AlertRow).kinds ?? [];
        return (
          <span className="flex gap-1">
            {kinds.map((k) => {
              const b = ALERT_BADGES[k];
              if (!b) return null;
              return <span key={k} className={`px-1 rounded ${b.cls}`}>{b.label}</span>;
            })}
          </span>
        );
      },
    },
    { key: "price", label: "Price", align: "right", render: (r) => fmtPrice(r.last_price) },
    {
      key: "pct",
      label: "%",
      align: "right",
      render: (r) => {
        const v = r.gap_pct ?? r.intraday_gap_pct;
        if (v === null || v === undefined) return "—";
        return <span className={v >= 0 ? "text-accent" : "text-danger"}>+{v.toFixed(1)}%</span>;
      },
    },
  ];
}
