export function parseR(rStr) {
  if (!rStr) return null;
  const cleaned = rStr.replace(/[rR]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function calculateSummary(trades) {
  const rValues = trades.map(t => parseR(t.rResult)).filter(v => v !== null);
  if (rValues.length === 0) {
    return { totalR: 0, wins: 0, losses: 0, winRate: 0, bestTrade: null, worstTrade: null };
  }

  const totalR = rValues.reduce((sum, v) => sum + v, 0);
  const wins = rValues.filter(v => v > 0).length;
  const losses = rValues.filter(v => v < 0).length;
  const winRate = rValues.length > 0 ? (wins / rValues.length) * 100 : 0;

  let bestTrade = null;
  let worstTrade = null;
  let bestR = -Infinity;
  let worstR = Infinity;

  for (const trade of trades) {
    const r = parseR(trade.rResult);
    if (r === null) continue;
    if (r > bestR) { bestR = r; bestTrade = trade; }
    if (r < worstR) { worstR = r; worstTrade = trade; }
  }

  return { totalR, wins, losses, winRate, bestTrade, worstTrade };
}
