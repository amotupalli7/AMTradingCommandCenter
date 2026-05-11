/**
 * Bulk endpoint for the Analysis -> Export workbook.
 *
 * The browser sends a list of trade IDs (whatever was on screen after
 * filtering). We fetch the per-trade chart payload (bars/fills/MFE/MAE) and
 * executions in parallel batches and return the combined dictionary so the
 * client only has to wait on one network round-trip.
 */
import { NextRequest, NextResponse } from "next/server";
import { getTradeChartData } from "@/lib/tradeChart";
import { getTradeExecutions } from "@/lib/excel";

const BATCH = 5;

async function runInBatches<T>(
  items: number[],
  size: number,
  fn: (id: number) => Promise<T>
): Promise<Record<number, T | { error: string }>> {
  const out: Record<number, T | { error: string }> = {};
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          return { id, value: await fn(id) };
        } catch (err) {
          return {
            id,
            value: { error: err instanceof Error ? err.message : "Unknown error" } as { error: string },
          };
        }
      })
    );
    for (const r of results) out[r.id] = r.value;
  }
  return out;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const tradeIds = (body as { tradeIds?: unknown }).tradeIds;
  if (!Array.isArray(tradeIds) || tradeIds.some((x) => typeof x !== "number")) {
    return NextResponse.json(
      { error: "tradeIds must be an array of numbers" },
      { status: 400 }
    );
  }
  const ids = tradeIds as number[];
  if (ids.length === 0) {
    return NextResponse.json({ traces: {}, executions: {} });
  }

  const [traces, executions] = await Promise.all([
    runInBatches(ids, BATCH, getTradeChartData),
    runInBatches(ids, BATCH, getTradeExecutions),
  ]);

  return NextResponse.json({ traces, executions });
}
