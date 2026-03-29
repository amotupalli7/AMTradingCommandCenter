import fs from "fs";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = path.resolve(process.cwd(), "..", "chart-cache");
const LOCAL_CHARTS_DIR = path.join("C:", "Users", "sspma", "Dropbox", "Gap Up Short Charts", "Execution Charts");

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function convertDropboxUrl(url: string): string {
  if (!url) return "";
  // Replace dl=0 with raw=1 for direct file access
  return url.trim().replace("dl=0", "raw=1").replace("dl=1", "raw=1");
}

// Cache by URL hash so trades sharing the same chart URL reuse one file
function urlHash(url: string): string {
  return crypto.createHash("sha256").update(url.trim()).digest("hex").slice(0, 16);
}

export function getCachedImagePath(dropboxUrl: string): string | null {
  if (!dropboxUrl) return null;
  ensureCacheDir();
  const filename = `chart_${urlHash(dropboxUrl)}.png`;
  const filePath = path.join(CACHE_DIR, filename);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

export async function downloadAndCacheImage(
  dropboxUrl: string
): Promise<string | null> {
  if (!dropboxUrl) return null;

  ensureCacheDir();
  const filename = `chart_${urlHash(dropboxUrl)}.png`;
  const filePath = path.join(CACHE_DIR, filename);

  // Check cache first — same URL = same file regardless of trade ID
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  try {
    const directUrl = convertDropboxUrl(dropboxUrl);
    const response = await fetch(directUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "TraderJournal/1.0",
      },
    });

    if (!response.ok) {
      console.error(
        `Failed to download image: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error("Error downloading chart image:", err);
    return null;
  }
}

/**
 * Find a local execution chart by matching trade date + ticker.
 * Files are named like "MM-DD-YY TICKER.png" or "MM-DD-YY TICKER extra.png".
 * We match on the date prefix + ticker appearing right after it.
 */
export function findLocalChart(tradeDate: string, ticker: string): string | null {
  if (!tradeDate || !ticker) return null;
  if (!fs.existsSync(LOCAL_CHARTS_DIR)) return null;

  // tradeDate is "YYYY-MM-DD" → build both padded and unpadded prefixes
  const [y, m, d] = tradeDate.split("-");
  const yy = y.slice(2);
  const padded = `${m}-${d}-${yy}`;                          // "01-02-26"
  const unpadded = `${parseInt(m)}-${parseInt(d)}-${yy}`;    // "1-2-26"
  const targets = [
    `${padded} ${ticker.toUpperCase()}`,                      // "01-02-26 BNAI"
    `${unpadded} ${ticker.toUpperCase()}`,                    // "1-2-26 BNAI"
  ];

  try {
    const files = fs.readdirSync(LOCAL_CHARTS_DIR);

    for (const target of targets) {
      // Exact match first: "MM-DD-YY TICKER.png"
      const exact = files.find(
        (f) => f.toLowerCase() === `${target}.png`.toLowerCase()
      );
      if (exact) return path.join(LOCAL_CHARTS_DIR, exact);

      // Fuzzy match: file starts with "MM-DD-YY TICKER" (handles extra annotations)
      const fuzzy = files.find((f) => {
        const upper = f.toUpperCase();
        return upper.startsWith(target.toUpperCase()) && upper.endsWith(".PNG");
      });
      if (fuzzy) return path.join(LOCAL_CHARTS_DIR, fuzzy);
    }
  } catch {
    // Directory read failed — fall through
  }
  return null;
}

export function getImageUrl(tradeId: number): string {
  return `/api/trade/${tradeId}/image`;
}
