import { calculateSummary, parseR } from './calculations';

export function exportDayAsJSON(dayData) {
  const blob = new Blob([JSON.stringify(dayData, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `trade-plan-${dayData.date}.json`);
}

export function exportAllAsJSON(allData) {
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `trade-planner-backup-${new Date().toISOString().split('T')[0]}.json`);
}

export function dayToMarkdown(day) {
  const h = day.header;
  const stats = calculateSummary(day.trades);
  let md = `# Trade Plan — ${day.date}\n\n`;

  md += `## Daily Header\n`;
  if (h.xScore) md += `- **X Score:** ${h.xScore}\n`;
  if (h.grade) md += `- **Grade:** ${h.grade}\n`;
  if (h.weeklyGoal) md += `- **Weekly Goal:** ${h.weeklyGoal}\n`;
  if (h.dailyGoal) md += `- **Daily Goal:** ${h.dailyGoal}\n`;
  if (h.reminders) md += `- **Reminders:**\n${h.reminders.split('\n').map(l => `  - ${l}`).join('\n')}\n`;
  if (h.tempBefore) md += `- **Temp Before:** ${h.tempBefore}${h.tempBeforeComments ? ` — ${h.tempBeforeComments}` : ''}\n`;
  if (h.tempDuring) md += `- **Temp During:** ${h.tempDuring}${h.tempDuringComments ? ` — ${h.tempDuringComments}` : ''}\n`;
  if (h.tempAfter) md += `- **Temp After:** ${h.tempAfter}${h.tempAfterComments ? ` — ${h.tempAfterComments}` : ''}\n`;
  if (h.overview) md += `\n### Overview\n${h.overview}\n`;

  md += `\n---\n\n## Trades\n\n`;
  for (const t of day.trades) {
    md += `### ${t.ticker || 'Untitled'} ${t.rResult ? `(${t.rResult})` : ''}\n`;
    md += `- **Time:** ${t.timestamp}\n`;
    if (t.setup) md += `- **Setup:** ${t.setup}\n`;
    if (t.grade) md += `- **Grade:** ${t.grade}\n`;
    if (t.size) md += `- **Size:** ${t.size}\n`;
    if (t.setupNotes) md += `- **Setup Notes:** ${t.setupNotes}\n`;
    if (t.dilutionNotes) md += `- **Dilution Notes:** ${t.dilutionNotes}\n`;
    if (t.entryPlan) md += `- **Entry Plan:** ${t.entryPlan}\n`;
    if (t.exitPlan) md += `- **Exit Plan:** ${t.exitPlan}\n`;
    if (t.emotions) md += `- **Emotions:** ${t.emotions}\n`;
    if (t.executionNotes) md += `- **Execution Notes:** ${t.executionNotes}\n`;
    md += `\n`;
  }

  md += `---\n\n## Summary\n`;
  md += `- **Total R:** ${stats.totalR.toFixed(2)}R\n`;
  md += `- **Win/Loss:** ${stats.wins}W / ${stats.losses}L\n`;
  md += `- **Win Rate:** ${stats.winRate.toFixed(0)}%\n`;
  if (stats.bestTrade) md += `- **Best Trade:** ${stats.bestTrade.ticker} (${stats.bestTrade.rResult})\n`;
  if (stats.worstTrade) md += `- **Worst Trade:** ${stats.worstTrade.ticker} (${stats.worstTrade.rResult})\n`;

  const s = day.summary;
  if (s.whatDidWell) md += `\n### What I Did Well\n${s.whatDidWell}\n`;
  if (s.whatLearned) md += `\n### What I Learned\n${s.whatLearned}\n`;
  if (s.whatToImprove) md += `\n### What I Need to Improve\n${s.whatToImprove}\n`;

  return md;
}

export function exportDayAsMarkdown(dayData) {
  const md = dayToMarkdown(dayData);
  const blob = new Blob([md], { type: 'text/markdown' });
  downloadBlob(blob, `trade-plan-${dayData.date}.md`);
}

export function copyDayAsMarkdown(dayData) {
  const md = dayToMarkdown(dayData);
  navigator.clipboard.writeText(md);
}

export function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(JSON.parse(e.target.result));
      } catch {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
