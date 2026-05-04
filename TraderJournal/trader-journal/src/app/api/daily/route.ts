import { NextRequest, NextResponse } from "next/server";
import {
  readDailyAccount,
  upsertDailyAccount,
  deleteDailyAccount,
} from "@/lib/excel";

export async function GET() {
  try {
    const rows = await readDailyAccount();
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read daily_account" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, account_value, dollar_risk } = body;

    if (typeof date !== "string") {
      return NextResponse.json({ error: "date is required" }, { status: 400 });
    }

    const av =
      account_value === null || account_value === undefined || account_value === ""
        ? null
        : Number(account_value);
    const dr =
      dollar_risk === null || dollar_risk === undefined || dollar_risk === ""
        ? null
        : Number(dollar_risk);

    if (av !== null && !Number.isFinite(av)) {
      return NextResponse.json({ error: "account_value must be numeric" }, { status: 400 });
    }
    if (dr !== null && (!Number.isFinite(dr) || dr < 0)) {
      return NextResponse.json({ error: "dollar_risk must be a non-negative number" }, { status: 400 });
    }

    const result = await upsertDailyAccount(date, av, dr);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upsert daily_account" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (!date) {
      return NextResponse.json({ error: "date query param required" }, { status: 400 });
    }
    const result = await deleteDailyAccount(date);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete daily_account" },
      { status: 500 }
    );
  }
}
