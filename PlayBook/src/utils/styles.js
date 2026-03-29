// ─── COLOR TOKENS ────────────────────────────────────────────────────────────
export const C = {
  bg: '#020617',
  surface: '#0F172A',
  elevated: '#1E293B',
  border: '#1E293B',
  borderMid: '#334155',
  primary: '#F8FAFC',
  secondary: '#94A3B8',
  dim: '#475569',
  green: '#22C55E',
  red: '#EF4444',
  amber: '#F59E0B',
  blue: '#3B82F6',
};

export const base = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color: C.primary,
  fontSize: '13px',
};

export const mono = {
  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace',
};

export function getDirectionColor(dir) {
  if (dir === 'short') return '#EF4444';
  if (dir === 'long') return '#22C55E';
  return '#F59E0B';
}

export function getGradeColor(grade) {
  if (!grade) return C.dim;
  if (grade.startsWith('A')) return '#22C55E';
  if (grade.startsWith('B')) return '#F59E0B';
  return '#EF4444';
}
