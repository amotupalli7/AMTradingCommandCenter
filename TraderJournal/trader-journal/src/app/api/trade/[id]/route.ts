import { NextRequest, NextResponse } from "next/server";
import { getTradeById, updateTradeField } from "@/lib/excel";
import { EDITABLE_FIELDS } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tradeId = parseInt(id, 10);

  try {
    const trade = await getTradeById(tradeId);
    if (!trade) {
      return NextResponse.json(
        { error: `Trade ${tradeId} not found` },
        { status: 404 }
      );
    }
    return NextResponse.json(trade);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read trade" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tradeId = parseInt(id, 10);

  try {
    const body = await request.json();
    const { field, value } = body;

    if (!field || typeof value !== "string") {
      return NextResponse.json(
        { error: "Missing field or value" },
        { status: 400 }
      );
    }

    if (!EDITABLE_FIELDS.includes(field)) {
      return NextResponse.json(
        { error: `Field "${field}" is not editable. Allowed: ${EDITABLE_FIELDS.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await updateTradeField(tradeId, field, value);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update trade" },
      { status: 500 }
    );
  }
}
