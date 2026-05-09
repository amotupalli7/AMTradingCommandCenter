import { NextRequest, NextResponse } from "next/server";
import { getTradeChartData } from "@/lib/tradeChart";

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
    const data = await getTradeChartData(tradeId);
    if (!data) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build chart" },
      { status: 500 }
    );
  }
}
