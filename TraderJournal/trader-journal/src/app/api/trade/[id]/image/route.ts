import { NextRequest, NextResponse } from "next/server";
import { getTradeById } from "@/lib/excel";
import {
  getChartPath,
  setChartPath,
  findLocalChartFilename,
  getCachedImagePath,
  downloadAndCacheImage,
} from "@/lib/images";
import fs from "fs";
import path from "path";

function serveImage(imagePath: string, ifModSince?: string | null) {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  const stat = fs.statSync(imagePath);
  const lastModified = new Date(Math.floor(stat.mtimeMs / 1000) * 1000).toUTCString();

  if (ifModSince && ifModSince === lastModified) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Last-Modified": lastModified,
      },
    });
  }

  const imageBuffer = fs.readFileSync(imagePath);
  return new NextResponse(imageBuffer, {
    headers: {
      "Content-Type": mimeTypes[ext] || "image/png",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Last-Modified": lastModified,
      "Content-Length": String(imageBuffer.length),
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
    // 1. Fast path: check the path index for a previously resolved chart
    const cachedRelPath = getChartPath(tradeId);
    if (cachedRelPath) {
      // Redirect to the fast /api/charts/ route
      return NextResponse.redirect(
        new URL(`/api/charts/${encodeURIComponent(cachedRelPath)}`, _request.url)
      );
    }

    const trade = await getTradeById(tradeId);
    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    // 2. Try local execution chart — resolve and cache the filename
    const localFilename = findLocalChartFilename(trade.Date, trade.Ticker);
    if (localFilename) {
      // Store in path index for instant future lookups
      setChartPath(tradeId, localFilename);
      return NextResponse.redirect(
        new URL(`/api/charts/${encodeURIComponent(localFilename)}`, _request.url)
      );
    }

    // 3. Fall back to Dropbox URL via download cache
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

    return serveImage(imagePath, _request.headers.get("if-modified-since"));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get image" },
      { status: 500 }
    );
  }
}
