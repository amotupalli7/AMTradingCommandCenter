export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

export function fmtVolume(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

export function pctClass(n: number | null | undefined): string {
  if (n === null || n === undefined) return "text-muted";
  if (n > 0) return "text-accent";
  if (n < 0) return "text-danger";
  return "text-text";
}
