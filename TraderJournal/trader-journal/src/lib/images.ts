import fs from "fs";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = path.resolve(process.cwd(), "..", "chart-cache");
const LOCAL_CHARTS_DIR = path.join("C:", "Users", "sspma", "Dropbox", "Gap Up Short Charts", "Execution Charts");

// ─── Path index: maps tradeId → relative filename for /api/charts/ fast serving ──
const PATH_INDEX_FILE = path.resolve(process.cwd(), "..", "chart-paths.json");
let pathIndex: Record<string, string> = {};

function loadPathIndex() {
  try {
    if (fs.existsSync(PATH_INDEX_FILE)) {
      pathIndex = JSON.parse(fs.readFileSync(PATH_INDEX_FILE, "utf-8"));
    }
  } catch {
    pathIndex = {};
  }
}

function savePathIndex() {
  try {
    fs.writeFileSync(PATH_INDEX_FILE, JSON.stringify(pathIndex, null, 2), "utf-8");
  } catch {
    // non-critical
  }
}

// Load on startup
loadPathIndex();

/**
 * Get the cached fast-serve path for a trade (relative filename for /api/charts/).
 * Returns null if not yet resolved.
 */
export function getChartPath(tradeId: number): string | null {
  const cached = pathIndex[String(tradeId)];
  if (!cached) return null;

  // Verify the file still exists in the chart folders
  const fullPath = resolveChartFile(cached);
  if (fullPath) return cached;

  // Stale entry — remove it
  delete pathIndex[String(tradeId)];
  savePathIndex();
  return null;
}

/**
 * Store a resolved chart filename for a trade for instant future lookups.
 */
export function setChartPath(tradeId: number, relativePath: string) {
  pathIndex[String(tradeId)] = relativePath;
  savePathIndex();
}

// Chart folders searched by /api/charts/ route — resolve a relative path to full path
const CHART_FOLDERS = [
  path.join("C:", "Users", "sspma", "Dropbox", "Gap Up Short Charts"),
  LOCAL_CHARTS_DIR,
];

function resolveChartFile(relativePath: string): string | null {
  for (const folder of CHART_FOLDERS) {
    const full = path.join(folder, relativePath);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

// ─── Existing helpers (kept for Dropbox fallback) ──────────────────────────

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function convertDropboxUrl(url: string): string {
  if (!url) return "";
  return url.trim().replace("dl=0", "raw=1").replace("dl=1", "raw=1");
}

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
 * Returns the full path on disk.
 */
export function findLocalChart(tradeDate: string, ticker: string): string | null {
  if (!tradeDate || !ticker) return null;
  if (!fs.existsSync(LOCAL_CHARTS_DIR)) return null;

  const [y, m, d] = tradeDate.split("-");
  const yy = y.slice(2);
  const padded = `${m}-${d}-${yy}`;
  const unpadded = `${parseInt(m)}-${parseInt(d)}-${yy}`;
  const targets = [
    `${padded} ${ticker.toUpperCase()}`,
    `${unpadded} ${ticker.toUpperCase()}`,
  ];

  try {
    const files = fs.readdirSync(LOCAL_CHARTS_DIR);

    for (const target of targets) {
      const exact = files.find(
        (f) => f.toLowerCase() === `${target}.png`.toLowerCase()
      );
      if (exact) return path.join(LOCAL_CHARTS_DIR, exact);

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

/**
 * Find local chart and return just the filename (for use with /api/charts/).
 */
export function findLocalChartFilename(tradeDate: string, ticker: string): string | null {
  const fullPath = findLocalChart(tradeDate, ticker);
  if (!fullPath) return null;
  return path.basename(fullPath);
}

export function getImageUrl(tradeId: number): string {
  return `/api/trade/${tradeId}/image`;
}
