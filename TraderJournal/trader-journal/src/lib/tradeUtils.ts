/**
 * Returns true for any side value that represents a long/buy position.
 * "Margin" is the broker's label for a standard long trade.
 */
export function isLongSide(side: string): boolean {
  return side === "Long" || side === "Buy" || side === "Margin";
}

// Ordered palette — tag names are deterministically mapped to a color slot
// so the same tag always gets the same color across sessions.
const TAG_PALETTE = [
  "border-cyan-500/40 text-cyan-400 bg-cyan-500/10",
  "border-amber-500/40 text-amber-400 bg-amber-500/10",
  "border-pink-500/40 text-pink-400 bg-pink-500/10",
  "border-teal-500/40 text-teal-400 bg-teal-500/10",
  "border-orange-500/40 text-orange-400 bg-orange-500/10",
  "border-indigo-500/40 text-indigo-400 bg-indigo-500/10",
  "border-violet-500/40 text-violet-400 bg-violet-500/10",
  "border-rose-500/40 text-rose-400 bg-rose-500/10",
];

// Simple deterministic hash so a tag always maps to the same palette slot
function hashTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function tagColor(tag: string): string {
  // Hash on lowercase so "Backside" and "backside" always get the same color
  return TAG_PALETTE[hashTag(tag.toLowerCase()) % TAG_PALETTE.length];
}

export function parseTags(raw: string): string[] {
  if (!raw) return [];
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}
