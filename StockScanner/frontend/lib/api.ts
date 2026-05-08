export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
export const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE ?? "ws://127.0.0.1:8000";

export type ScannerRow = {
  ticker: string;
  last_price: number | null;
  prev_close: number | null;
  open_price: number | null;
  high: number | null;
  premarket_high: number | null;
  total_volume: number;
  gap_pct: number | null;
  intraday_gap_pct: number | null;
};

export type AlertRow = ScannerRow & {
  hod_rvol: number | null;
  last_hod_alert_minute: number | null;
  backside_hod: number | null;
  backside_low: number | null;
  backside_last_level: number;
  kinds: ("hod" | "backside")[];
};

export type ScannerPanels = {
  date: string | null;
  gappers: ScannerRow[];
  runners: ScannerRow[];
  alerts: AlertRow[];
};

// ---------- Enrichment ----------

export type FilingItem = {
  file_number: string;
  form: string;
  company: string;
  cik: string;
  filing_date: string;
  accession_number: string;
  url: string;
};

export type FilingGroup = {
  file_number: string;
  most_recent: FilingItem;
  older_filings: FilingItem[];
};

export type OwnershipFiling = FilingItem & {
  owner: string;
  position: string;
};

export type Rename = {
  old_symbol: string;
  date: string;
  name: string;
};

export type EdgarPayload = {
  ticker: string;
  date: string;
  previously: Rename | null;
  filings: { groups: FilingGroup[]; error?: string };
  ownership: { filings: OwnershipFiling[]; error?: string };
};

// DilutionTracker
export type DTSection = {
  type: "atm" | "shelf" | "warrant" | "conv_note" | "conv_pref" | "equity_line";
  title: string;
  fields: [string, string][];
};

export type DTPayload = {
  sector_line: string;
  mktcap_line: string;
  description: string;
  cash_position: string;
  sections: DTSection[];
  error?: string;
};
