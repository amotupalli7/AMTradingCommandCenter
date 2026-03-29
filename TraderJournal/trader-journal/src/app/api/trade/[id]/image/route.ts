import { NextRequest, NextResponse } from "next/server";
import { getTradeById } from "@/lib/excel";
import { getCachedImagePath, downloadAndCacheImage, findLocalChart } from "@/lib/images";
import fs from "fs";

function serveImage(imagePath: string) {
  const imageBuffer = fs.readFileSync(imagePath);
  return new NextResponse(imageBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tradeId = parseInt(id, 10);

  try {
    const trade = getTradeById(tradeId);
    if (!trade) {
      return NextResponse.json(
        { error: "Trade not found" },
        { status: 404 }
      );
    }

    // 1. Try local execution chart (instant, no network)
    const localPath = findLocalChart(trade.Date, trade.Ticker);
    if (localPath) {
      return serveImage(localPath);
    }

    // 2. Fall back to Dropbox URL via cache
    if (!trade.Chart) {
      return NextResponse.json(
        { error: "No chart available for this trade" },
        { status: 404 }
      );
    }

    let imagePath = getCachedImagePath(trade.Chart);

    if (!imagePath) {
      imagePath = await downloadAndCacheImage(trade.Chart);
      if (!imagePath) {
        return NextResponse.json(
          { error: "Failed to download chart image" },
          { status: 502 }
        );
      }
    }

    return serveImage(imagePath);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get image" },
      { status: 500 }
    );
  }
}
