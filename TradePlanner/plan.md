# Trade Planner — Intraday Trade Planning & Journaling Tool

## Prompt for Claude Code

Build a lightweight, local React + Vite application called **Trade Planner**. This is an intraday trade planning tool for an active short-biased day trader. The entire point is **speed and low friction** — it replaces a clunky Notion journal with something that takes under 10 seconds to log a trade plan. The trader keeps this open on a second monitor alongside their charting platform.

---

## Core Concept

Each **day** has:
1. A **Daily Header** (filled once at start of session)
2. A list of **Trade Cards** (added throughout the day as trades are taken)

The user navigates between days. Today's date is always the default landing page. All data persists in **localStorage** so nothing is lost between browser refreshes.

---

## Daily Header (top of each day)

The header appears at the top of each day's view. These fields are filled once at the start of the trading session:

| Field | Type | Notes |
|---|---|---|
| **Date** | Auto-filled | Today's date, also serves as the day identifier |
| **X Score** | Text input | Pre-market score (e.g., "7", "8.5") |
| **Grade** | Dropdown | A+, A, A-, B+, B, B-, C+, C, C-, D, F — filled end of day |
| **Weekly Goal** | Text input | Persists from day to day (auto-copies from previous day) |
| **Daily Goal** | Text input | Fresh each day |
| **Reminders / Aphorisms** | Bullet list / text area | Editable list of personal reminders. Auto-copies from previous day so the user can keep a running list and tweak it |
| **Temp Before** | Dropdown or quick select | Emotional temperature before session. Options: Great, Good, Neutral, Tired, Stressed, Anxious, Frustrated |
| **Temp Before Comments** | Text input | Brief note (e.g., "woke up 6:55 snoozed for an hour") |
| **Temp During** | Same dropdown as above | Filled during or after session |
| **Temp During Comments** | Text input | Brief note |
| **Temp After** | Same dropdown as above | Filled after session |
| **Temp After Comments** | Text input | Brief note |
| **Overview** | Text area | General market/session overview filled during or after |

---

## Trade Cards

Each trade is a card that can be quickly added with a prominent **"+ New Trade"** button. Cards stack vertically below the header. Each card contains:

| Field | Type | Notes |
|---|---|---|
| **Ticker** | Text input | e.g., "CREG", "LNKS" — should be prominent/large |
| **Setup** | Dropdown / quick-select buttons | GUS, IP, Subbie, D2, MDR, Situational, Other — user should be able to add custom setups |
| **Setup Notes** | Text area | Quick context about the setup, why this ticker, what's the thesis |
| **Dilution Notes** | Text area | Filing/dilution research notes (e.g., "recent S-1, warrant adjustment, Series D convert") |
| **Grade** | Dropdown | A+, A, A-, B+, B, B-, C+, C, C-, D, F — grade for this specific trade's quality |
| **Size** | Text input or quick buttons | e.g., "30%", "50%", "Full" or preset buttons for common sizes |
| **Entry Plan** | Text area | **This is the most critical field.** Where to enter, what confirmation to wait for, risk level. e.g., "Short on push above 3.50, risk HOD, starter 30%" |
| **Exit Plan** | Text area | **Second most critical field.** Target levels, partial plan, when to cover. e.g., "T1: 3.20 take 25%, T2: 3.00 take 50%, trail rest" |
| **Emotions** | Text area | How the trader felt during this trade, emotional state, any tilt |
| **Execution Notes** | Text area | Post-trade: what actually happened vs the plan, mistakes, what went well |
| **R Result** | Text input | e.g., "+1.76R", "-0.45R" — filled after trade closes |
| **Timestamp** | Auto-filled | When the card was created (shows time like "9:34 AM") |

### Trade Card UX Requirements:
- Cards should be **collapsible** — show just Ticker + R Result + Grade when collapsed, expand to show all fields
- Cards can be **reordered** via drag-and-drop (to match chronological order if entered out of sequence)
- Cards can be **deleted** (with confirmation)
- Cards can be **duplicated** (useful for re-shorting same ticker)
- The **Entry Plan and Exit Plan fields should be visually emphasized** — slightly different background color or border to draw the eye, since filling these is the #1 behavioral goal
- New cards should auto-expand and focus the Ticker field immediately

---

## Day Navigation

- **Left/Right arrows or date picker** to navigate between days
- **"Today" button** to jump back to current date
- Days with data show a dot/indicator in the navigation
- **Previous day's data is read-only by default** (toggle to edit) to prevent accidental changes
- When creating a new day, **Weekly Goal and Reminders auto-copy from the most recent previous day**

---

## End-of-Day Summary Section

At the bottom of each day, auto-calculated:
- **Total R**: Sum of all trade R results
- **Win/Loss**: Count of positive vs negative R trades
- **Win Rate**: Percentage
- **Best Trade**: Ticker with highest R
- **Worst Trade**: Ticker with lowest R

Plus manual fields:
- **What I Did Well** — text area
- **What I Learned** — text area  
- **What I Need to Improve** — text area

---

## Data & Export

- All data stored in **localStorage** (JSON structure)
- **Export Day as JSON** button — exports the full day's data as a JSON file
- **Export Day as Markdown** button — exports in a clean markdown format that could be pasted into Notion
- **Export All Data** button — full localStorage dump for backup
- **Import Data** button — restore from a previous export
- Consider a **"Copy to Clipboard as Markdown"** button for easy paste into Notion DRC

---

## Design Direction

**Dark mode, trading terminal aesthetic.** Think Bloomberg terminal meets Linear/Raycast. This is a serious trader's tool that happens to be beautiful.

Specific design requirements:
- **Dark background** (#0a0a0f or similar very dark blue-black), not pure black
- **Muted text** for labels, bright white for data/inputs
- **Accent color**: A single accent — something like a muted teal, amber, or electric blue for interactive elements and the Entry/Exit plan emphasis
- **Monospace or semi-mono font** for ticker symbols and R results (e.g., JetBrains Mono, IBM Plex Mono)
- **Clean sans-serif** for everything else (e.g., Geist, Satoshi, or similar)
- **Minimal borders** — use subtle background color shifts to delineate sections, not heavy borders
- **Compact but readable** — this needs to fit on a single monitor alongside a charting platform, so space efficiency matters
- **Fast transitions** — collapse/expand should be 150ms, no sluggish animations
- **No unnecessary chrome** — every pixel should serve a purpose

### Visual Hierarchy (most prominent to least):
1. Ticker symbols (large, bold, possibly monospace)
2. Entry Plan / Exit Plan fields (highlighted containers)
3. R Result (color-coded green/red)
4. Setup type (pill/badge)
5. Everything else (standard weight)

---

## Tech Stack

- **React 18+** with hooks (useState, useReducer, useEffect)
- **Vite** for dev server and building
- **No component library** — custom styled components, CSS modules or Tailwind
- **localStorage** for persistence
- **No backend** — fully client-side
- Optional: **Tailwind CSS** if it speeds up development, but the design should NOT look like default Tailwind

---

## File Structure Suggestion

```
trade-planner/
├── src/
│   ├── components/
│   │   ├── DayView.jsx          # Main day layout (header + cards + summary)
│   │   ├── DailyHeader.jsx      # The daily header section
│   │   ├── TradeCard.jsx         # Individual trade card (collapsible)
│   │   ├── DaySummary.jsx        # End-of-day auto-calculated + manual summary
│   │   ├── DayNavigation.jsx     # Date picker / arrows / today button
│   │   ├── ExportPanel.jsx       # Export/import controls
│   │   └── ui/                   # Shared UI primitives (Input, Select, TextArea, Badge, Button)
│   ├── hooks/
│   │   ├── useTradeData.js       # localStorage read/write, CRUD operations
│   │   └── useDayNavigation.js   # Day switching logic
│   ├── utils/
│   │   ├── exporters.js          # JSON and Markdown export logic
│   │   └── calculations.js       # R totals, win rate, etc.
│   ├── constants.js              # Setup types, grade options, emotion presets
│   ├── App.jsx
│   ├── App.css (or index.css)
│   └── main.jsx
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## Key Behavioral Context

This tool exists to solve ONE problem: the trader knows he needs to write down his entry plan and exit plan before every trade, but the current Notion journal is too clunky to do this intraday. The result is he enters trades without written plans and then panic-covers or makes emotional exits.

The tool succeeds if:
1. Adding a new trade plan takes **under 10 seconds**
2. The Entry Plan and Exit Plan fields are **impossible to ignore** visually
3. The trader can glance at his plan **while in the trade** without switching windows
4. End-of-day review data can be **exported to Notion** easily

The tool fails if:
- It's slow to load or laggy
- Adding a trade feels like filling out a form (it should feel like jotting a quick note)
- The design is generic/boring (the trader needs to actually WANT to use this)
- Data is lost between sessions

---

## Example Workflow

1. **7:00 AM** — Trader opens Trade Planner, today's date auto-loads
2. Fills in Daily Goal: "Follow all rules, write plan before every trade"
3. Reminders auto-copied from yesterday, trader tweaks one
4. Sets Temp Before: "Tired" + "woke up late, desk by 7:45"
5. **9:32 AM** — Hits "+ New Trade", types "CREG"
6. Selects Setup: "Subbie", types Setup Notes: "China dilution, sold off daily"  
7. Types Entry Plan: "Short on push above 2.80, risk 3.10, starter 30%"
8. Types Exit Plan: "T1: 2.50 take 25%, T2: 2.20 take 50%, trail"
9. **Card stays visible** — trader glances at it when in the trade
10. **9:55 AM** — Trade closes, fills in R Result: "-1.45R"
11. Fills Execution Notes: "Entered too low in range, ignored bullish daily"
12. **4:00 PM** — Fills in end-of-day summary, grade, exports markdown to paste into Notion DRC
