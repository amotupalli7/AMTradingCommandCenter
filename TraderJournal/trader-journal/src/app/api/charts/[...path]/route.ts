import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Same folders PlayBook uses — search each in order, first match wins
const CHART_FOLDERS = [
  path.join("C:", "Users", "sspma", "Dropbox", "Gap Up Short Charts"),
  path.join("C:", "Users", "sspma", "Dropbox", "Gap Up Short Charts", "Execution Charts"),
];

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const fileName = decodeURIComponent(segments.join("/"));

  for (const folder of CHART_FOLDERS) {
    const filePath = path.join(folder, fileName);

    // Prevent directory traversal
    if (!filePath.startsWith(folder)) continue;

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const buffer = fs.readFileSync(filePath);

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, immutable",
          "Content-Length": String(buffer.length),
        },
      });
    }
  }

  return NextResponse.json({ error: "Chart not found" }, { status: 404 });
}
