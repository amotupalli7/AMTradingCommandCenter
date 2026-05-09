/**
 * Minimal server-side Polygon REST client.
 *
 * Only exposes the one call we need: 1-minute OHLCV aggs for a window. We
 * deliberately don't use the full Polygon SDK — keeps deps small and the
 * surface area is tiny.
 */
import { fromZonedTime } from "date-fns-tz";

export interface MinuteBar {
  ts: number;     // bar open, unix ms (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number | null;
}

interface PolygonAggsResponse {
  status?: string;
  results?: Array<{
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
    vw?: number;
  }>;
  next_url?: string;
}

const ET_ZONE = "America/New_York";

/** Combine a YYYY-MM-DD date and HH:MM:SS time as ET wall-clock and return UTC ms. */
export function etDateTimeToUtcMs(date: string, time: string | null): number {
  // Default to market open if no time on the row (TOS imports etc.)
  const t = time && time.length >= 5 ? time : "09:30:00";
  // date-fns-tz wants an ISO-ish "YYYY-MM-DDTHH:mm:ss" interpreted in zone.
  return fromZonedTime(`${date}T${t}`, ET_ZONE).getTime();
}

export async function fetchMinuteAggs(
  ticker: string,
  fromMs: number,
  toMs: number
): Promise<MinuteBar[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    throw new Error(
      "POLYGON_API_KEY is not set. Add it to TraderJournal/trader-journal/.env.local"
    );
  }

  const url = new URL(
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(
      ticker
    )}/range/1/minute/${fromMs}/${toMs}`
  );
  // adjusted=false: return prices as printed at the time, not retroactively
  // split-adjusted. We want the trade journal to match what the trader saw.
  url.searchParams.set("adjusted", "false");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "50000");
  url.searchParams.set("apiKey", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Polygon ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as PolygonAggsResponse;
  if (!json.results) return [];

  return json.results.map((r) => ({
    ts: r.t,
    open: r.o,
    high: r.h,
    low: r.l,
    close: r.c,
    volume: r.v,
    vwap: r.vw ?? null,
  }));
}
