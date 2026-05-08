"use client";
import { useMemo, useState } from "react";
import { useEnrich } from "@/lib/useEnrich";
import type { DTPayload, EdgarPayload, FilingGroup, OwnershipFiling } from "@/lib/api";

type Tab = "dilution" | "filings" | "ownership";

export function EnrichPanel({ ticker }: { ticker: string | null }) {
  const { edgar, edgarStatus, dt, dtStatus, refresh } = useEnrich(ticker);
  const [tab, setTab] = useState<Tab>("dilution");

  if (!ticker) {
    return (
      <section className="border border-border bg-panel flex items-center justify-center text-muted text-xs h-full">
        Click a ticker to load enrichment
      </section>
    );
  }

  return (
    <section className="border border-border bg-panel flex flex-col min-h-0 h-full">
      <Header ticker={ticker} dt={dt} edgar={edgar} dtStatus={dtStatus} onRefresh={refresh} />
      <Tabs tab={tab} onTab={setTab} />
      <div className="flex-1 overflow-y-auto thin-scroll">
        {tab === "dilution" && <DilutionTab dt={dt} status={dtStatus} />}
        {tab === "filings" && <FilingsTab edgar={edgar} status={edgarStatus} />}
        {tab === "ownership" && <OwnershipTab edgar={edgar} status={edgarStatus} />}
      </div>
    </section>
  );
}

// ---------------- Header ----------------

function Header({
  ticker, dt, edgar, dtStatus, onRefresh,
}: {
  ticker: string;
  dt: DTPayload | null;
  edgar: EdgarPayload | null;
  dtStatus: "idle" | "loading" | "ready" | "error";
  onRefresh: () => void;
}) {
  // Pull Float / OS / Country / Inst Own from DT's mktcap_line + sector_line.
  const fields = useMemo(() => parseHeaderFields(dt), [dt]);
  const prev = edgar?.previously;
  return (
    <header className="flex items-center gap-3 px-3 py-2 border-b border-border text-xs flex-wrap">
      <span className="font-mono font-bold text-text">{ticker}</span>
      <Field label="Float / OS" value={fields.float_os} />
      <Field label="Country" value={fields.country} />
      <Field label="Inst Own" value={fields.inst_own} />
      <Field label="Mkt Cap" value={fields.mkt_cap} />
      {prev && (
        <span className="text-muted">
          Previously: <span className="text-text font-mono">{prev.old_symbol}</span> ({prev.date})
        </span>
      )}
      <div className="flex-1" />
      {dtStatus === "loading" && <span className="text-warn">DT loading…</span>}
      <button
        onClick={onRefresh}
        className="px-2 py-0.5 border border-border hover:text-text text-muted"
      >Refresh</button>
    </header>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <span>
      <span className="text-muted">{label}:</span>{" "}
      <span className="font-mono text-text">{value ?? "—"}</span>
    </span>
  );
}

function parseHeaderFields(dt: DTPayload | null): {
  float_os: string | null; country: string | null; inst_own: string | null; mkt_cap: string | null;
} {
  if (!dt) return { float_os: null, country: null, inst_own: null, mkt_cap: null };
  const mktcap = dt.mktcap_line || "";
  const sector = dt.sector_line || "";
  const grab = (src: string, label: string) => {
    const m = new RegExp(`${label}\\s*:?\\s*([^A-Z][^A-Z]*?)(?=(?:[A-Z][a-zA-Z .]*?:|$))`).exec(src);
    return m ? m[1].trim() : null;
  };
  return {
    float_os: /Float\s*&\s*OS\s*:\s*([^A-Z]+?)(?:Est\.|Inst\s*Own|$)/.exec(mktcap)?.[1]?.trim() ?? null,
    inst_own: /Inst\s*Own\s*:\s*([^A-Z]+?)(?:$|[A-Z])/.exec(mktcap)?.[1]?.trim() ?? null,
    mkt_cap: /Mkt\s*Cap\s*&\s*EV\s*:\s*([^A-Z]+?)(?:Float|Est\.|Inst|$)/.exec(mktcap)?.[1]?.trim() ?? null,
    country: /Country\s*:\s*([^A-Z]+?)(?:Exchange|$)/.exec(sector)?.[1]?.trim() ?? null,
  };
}

// ---------------- Tabs ----------------

const TABS: { id: Tab; label: string }[] = [
  { id: "dilution", label: "Dilution" },
  { id: "filings",  label: "SEC Filings" },
  { id: "ownership", label: "Ownership" },
];

function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <div className="flex border-b border-border text-xs">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onTab(t.id)}
          className={`px-3 py-1.5 ${
            tab === t.id ? "text-accent border-b-2 border-accent -mb-px" : "text-muted hover:text-text"
          }`}
        >{t.label}</button>
      ))}
    </div>
  );
}

// ---------------- Dilution tab ----------------

const SECTION_LABELS: Record<DTPayload["sections"][number]["type"], string> = {
  atm: "ATM",
  shelf: "Shelf",
  warrant: "Warrant",
  conv_note: "Convertible Note",
  conv_pref: "Convertible Preferred",
  equity_line: "Equity Line",
};
const SECTION_ORDER: DTPayload["sections"][number]["type"][] = [
  "atm", "shelf", "warrant", "conv_note", "conv_pref", "equity_line",
];

function DilutionTab({ dt, status }: { dt: DTPayload | null; status: string }) {
  if (status === "loading") return <Empty text="Scraping DilutionTracker… (~3-5s)" />;
  if (status === "error" || !dt) return <Empty text="DT scrape failed" />;
  if (dt.error) return <Empty text={`DT error: ${dt.error}`} />;

  const grouped: Record<string, DTPayload["sections"]> = {};
  for (const s of dt.sections) (grouped[s.type] ||= []).push(s);

  return (
    <div className="p-3 space-y-3 text-xs">
      {dt.description && (
        <p className="text-muted leading-relaxed">{dt.description}</p>
      )}
      {dt.cash_position && (
        <div className="text-accent">{dt.cash_position}</div>
      )}
      {SECTION_ORDER.map((kind) => {
        const blocks = grouped[kind];
        if (!blocks?.length) return null;
        return (
          <div key={kind}>
            <div className="text-muted uppercase text-[10px] tracking-wider mb-1">
              {SECTION_LABELS[kind]}
            </div>
            {blocks.map((b, i) => (
              <div key={i} className="border-l border-border pl-3 mb-2">
                <div className="font-semibold text-text">{b.title}</div>
                {b.fields.length > 0 && (
                  <table className="font-mono mt-1">
                    <tbody>
                      {b.fields.map(([label, val], j) => (
                        <tr key={j}>
                          <td className="text-muted pr-3 py-0.5">{label}</td>
                          <td className="text-text py-0.5">{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {dt.sections.length === 0 && <Empty text="No dilution sections found" />}
    </div>
  );
}

// ---------------- Filings tab ----------------

function FilingsTab({ edgar, status }: { edgar: EdgarPayload | null; status: string }) {
  if (status === "loading") return <Empty text="Loading EDGAR…" />;
  if (status === "error" || !edgar) return <Empty text="EDGAR fetch failed" />;
  const groups = edgar.filings.groups;
  if (edgar.filings.error) return <Empty text={`EDGAR error: ${edgar.filings.error}`} />;
  if (!groups.length) return <Empty text="No filings in last 6 months" />;

  return (
    <table className="w-full text-xs font-mono">
      <thead className="sticky top-0 bg-panel">
        <tr className="text-muted">
          <th className="text-left px-2 py-1 font-normal">Form</th>
          <th className="text-left px-2 py-1 font-normal">Date</th>
          <th className="text-left px-2 py-1 font-normal">File #</th>
          <th className="text-left px-2 py-1 font-normal">Older</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g: FilingGroup) => (
          <tr key={g.file_number} className="border-t border-border/50">
            <td className="px-2 py-1">
              <a href={g.most_recent.url} target="_blank" rel="noreferrer"
                 className="text-accent hover:underline">{g.most_recent.form}</a>
            </td>
            <td className="px-2 py-1">{g.most_recent.filing_date}</td>
            <td className="px-2 py-1 text-muted">{g.file_number}</td>
            <td className="px-2 py-1 text-muted">{g.older_filings.length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------- Ownership tab ----------------

function OwnershipTab({ edgar, status }: { edgar: EdgarPayload | null; status: string }) {
  if (status === "loading") return <Empty text="Loading EDGAR…" />;
  if (status === "error" || !edgar) return <Empty text="EDGAR fetch failed" />;
  const filings = edgar.ownership.filings;
  if (edgar.ownership.error) return <Empty text={`EDGAR error: ${edgar.ownership.error}`} />;
  if (!filings.length) return <Empty text="No ownership filings in last 3 years" />;

  return (
    <table className="w-full text-xs font-mono">
      <thead className="sticky top-0 bg-panel">
        <tr className="text-muted">
          <th className="text-left px-2 py-1 font-normal">Form</th>
          <th className="text-left px-2 py-1 font-normal">Date</th>
          <th className="text-left px-2 py-1 font-normal">Owner</th>
          <th className="text-left px-2 py-1 font-normal">Position</th>
        </tr>
      </thead>
      <tbody>
        {filings.map((f: OwnershipFiling, i: number) => (
          <tr key={`${f.accession_number}-${i}`} className="border-t border-border/50">
            <td className="px-2 py-1">
              <a href={f.url} target="_blank" rel="noreferrer"
                 className="text-accent hover:underline">{f.form}</a>
            </td>
            <td className="px-2 py-1">{f.filing_date}</td>
            <td className="px-2 py-1 truncate max-w-[220px]" title={f.owner}>{f.owner}</td>
            <td className="px-2 py-1 text-muted">{f.position}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------- helpers ----------------

function Empty({ text }: { text: string }) {
  return <div className="p-6 text-center text-muted text-xs">{text}</div>;
}
