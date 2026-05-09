import { NextRequest, NextResponse } from "next/server";
import { getTradeExecutions } from "@/lib/excel";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tradeId = parseInt(id, 10);
  if (!Number.isFinite(tradeId)) {
    return NextResponse.json({ error: "Invalid trade id" }, { status: 400 });
  }
  try {
    const rows = await getTradeExecutions(tradeId);
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read executions" },
      { status: 500 }
    );
  }
}
