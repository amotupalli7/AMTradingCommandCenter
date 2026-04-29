export interface Trade {
  "Trade ID": number;
  Date: string;
  "Enter Time": string;
  Ticker: string;
  Side: string;
  Price: number;
  "Net P&L": number;
  "Net R": number;
  Win: number;                      // 0 or 1 (computed from net_pnl unless overridden)
  "Win Override": number | null;    // null = use computed; 0/1 to override
  "X Score": number;
  "Acc %": number;
  "Risk %": number;
  "$ Risk": number;
  Setup: string;
  "Sub-Setup": string;
  Trigger: string;
  Tags: string;
  "Entry Notes": string;
  "Exit Notes": string;
  Notes: string;
  "Mistake Notes": string;
  Chart: string;
  // 8 X-mistake flags: 0, 0.5, or 1
  "X: Failing Goal": number;
  "X: Non-Playbook Trade": number;
  "X: Selection Mistake": number;
  "X: Entry Mistake": number;
  "X: Sizing Mistake": number;
  "X: Exit Mistake": number;
  "X: Emotional Mistake": number;
  "X: Preparation Mistake": number;
  search: string;
}

export interface Execution {
  "Trade ID": number;
  Date: string;
  "Enter Time": string;
  "Symbol / Ticker": string;
  Side: string;
  Price: number;
  Qty: number;
  Route: string;
  Type: string;
  "New Trade": number;
  "$ Value": number;
  "Gross P&L": number;
  Quantity: number;
  "Exit Time": string;
  ECN: number;
  Comms: number;
  SEC: number;
  FINRA: number;
  Locates: number;
  "CAT FEE": number;
  "Net P&L": number;
  "$ Risk": number;
  "R Net": number;
  Win: number;
  "Risk %": number;
  "X: Failing Goal": number;
  "X: Non-Playbook Trade": number;
  "X: Selection Mistake": number;
  "X: Entry Mistake": number;
  "X: Sizing Mistake": number;
  "X: Exit Mistake": number;
  "X: Emotional Mistake": number;
  "X: Preparation Mistake": number;
  "X Score": number;
  Month: number;
  "~Pos Size": number;
}

export interface DashboardStats {
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  grossPnL: number;
  netPnL: number;
  avgR: number;
  totalR: number;
  maxWin: number;
  maxLoss: number;
  avgWinner: number;
  avgLoser: number;
  avgWinR: number;
  avgLossR: number;
  profitFactor: number;
  maxDrawdown: number;
  avgXScore: number;
}

export interface ChartDataPoint {
  date: string;
  value: number;
}

export interface SetupPnL {
  setup: string;
  pnl: number;
  count: number;
  winRate: number;
}

export interface RBin {
  range: string;
  count: number;
}

export interface TimeBucket {
  time: string;
  pnl: number;
  r: number;
  count: number;
  winRate: number;
}

export const EDITABLE_FIELDS = [
  "Trigger",
  "Tags",
  "Entry Notes",
  "Exit Notes",
  "Notes",
  "Mistake Notes",
  "Setup",
  "Sub-Setup",
  "$ Risk",
  "Win Override",
  "X: Failing Goal",
  "X: Non-Playbook Trade",
  "X: Selection Mistake",
  "X: Entry Mistake",
  "X: Sizing Mistake",
  "X: Exit Mistake",
  "X: Emotional Mistake",
  "X: Preparation Mistake",
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

// Fields that store numeric values (not strings). updateTradeField treats them
// differently: empty string -> NULL, otherwise parsed as float. The view's
// X Score formula treats X: Failing Goal == 1 specially as a gate.
export const NUMERIC_EDITABLE_FIELDS: ReadonlySet<EditableField> = new Set([
  "$ Risk",
  "Win Override",
  "X: Failing Goal",
  "X: Non-Playbook Trade",
  "X: Selection Mistake",
  "X: Entry Mistake",
  "X: Sizing Mistake",
  "X: Exit Mistake",
  "X: Emotional Mistake",
  "X: Preparation Mistake",
]);
