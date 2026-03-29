// Sub-setups are GLOBAL — they can apply to any setup.
// Each setup references sub-setup IDs from this shared pool.

export const GLOBAL_SUB_SETUPS = [
  { id: 'china', name: 'China', side: 'short' },
  { id: 'dilution', name: 'Dilution', side: 'short' },
  { id: 'loose-ah', name: 'Loose AH', side: 'short' },
  { id: 'liquidation', name: 'Liquidation Candle', side: 'short' },
  { id: 'weak-liquidation', name: 'Weak Liquidation Candle', side: 'short' },
  { id: 'bounce', name: 'Bounce', side: 'short' },
  { id: 'shitco', name: 'Shitco', side: 'short' },
  { id: 'foreign', name: 'Foreign', side: 'short' },
  { id: 'sympathy', name: 'Sympathy', side: 'short' },
  { id: 'adf-avoid', name: 'ADF Avoid', side: 'short' },
  { id: 'PIPE', name: 'PIPE', side: 'short' },
  { id: 'warrants', name: 'Warrants', side: 'short' },
  { id: 'subbie', name: 'Subbie', side: 'short' },
  { id: '4am', name: '4am', side: 'short' },
  { id: 'liquidated', name: 'China Liquidation', side: 'short' },
  { id: 'sector', name: 'Sector / Theme', side: 'short' },
  { id: 'popdrop', name: 'PopDrop', side: 'short' },
  { id: 'accumulation', name: 'Accumulation', side: 'short' },
  { id: 'technical', name: 'Technical', side: 'short' },
  { id: 'market-open', name: 'Market Open', side: 'short' },
];

export const INITIAL_TAXONOMY = {
  setups: [
    {
      id: 'gus', name: 'GUS', fullName: 'Gap Up Short', color: '#3B82F6', side: 'short',
      subSetups: GLOBAL_SUB_SETUPS.map(s => ({ ...s })),
    },
    {
      id: 'ip', name: 'IP', fullName: 'Intraday Parabolic', color: '#F59E0B', side: 'short',
      subSetups: GLOBAL_SUB_SETUPS.map(s => ({ ...s })),
    },
    {
      id: 'd2', name: 'D2', fullName: 'Day 2', color: '#A78BFA', side: 'short',
      subSetups: GLOBAL_SUB_SETUPS.map(s => ({ ...s })),
    },
    {
      id: 'mdr', name: 'MDR', fullName: 'Multi-Day Runner', color: '#F472B6', side: 'short',
      subSetups: GLOBAL_SUB_SETUPS.map(s => ({ ...s })),
    },
    {
      id: 'ah', name: 'AH', fullName: 'After-Hours', color: '#3B82F6', side: 'short',
      subSetups: GLOBAL_SUB_SETUPS.map(s => ({ ...s })),
    },
    {
      id: 'special', name: 'Special', fullName: 'Special', color: '#6B7280', side: 'short',
      subSetups: GLOBAL_SUB_SETUPS.map(s => ({ ...s })),
    }
  ],
  entryMethods: [
    { id: 'dtb', name: 'DTB', side: 'short' },
    { id: 'liquidity-swipe', name: 'Liquidity Swipe', side: 'short' },
    { id: 'long-trap', name: 'Long Trap', side: 'short' },
    { id: 'chase-conviction', name: 'Chase / Conviction', side: 'short' },
    { id: 'strong-open', name: 'Strong Open', side: 'short' },
  ],
};

export const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C'];

export const SETUP_COLORS = [
  '#3B82F6', '#F59E0B', '#14B8A6', '#A78BFA',
  '#F472B6', '#22C55E', '#EF4444', '#8B5CF6', '#06B6D4',
];
