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
      const stat = fs.statSync(filePath);
      // mtime is whole-second precision in HTTP; round down to match what the
      // browser will send back in If-Modified-Since.
      const lastModified = new Date(Math.floor(stat.mtimeMs / 1000) * 1000).toUTCString();

      // 304 fast path: skip the read entirely when the browser's copy is
      // still fresh. This keeps loads instant while letting updated charts
      // appear as soon as the file's mtime changes.
      const ifModSince = _request.headers.get("if-modified-since");
      if (ifModSince && ifModSince === lastModified) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            "Cache-Control": "public, max-age=0, must-revalidate",
            "Last-Modified": lastModified,
          },
        });
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const buffer = fs.readFileSync(filePath);

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=0, must-revalidate",
          "Last-Modified": lastModified,
          "Content-Length": String(buffer.length),
        },
      });
    }
  }

  return NextResponse.json({ error: "Chart not found" }, { status: 404 });
}
