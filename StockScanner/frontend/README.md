# StockScanner frontend

Next.js 15 + React 19 + Tailwind. Pulls live scanner state from the FastAPI backend.

## Setup

```
npm install
npm run dev
```

Open http://localhost:3000. The backend must be running on http://127.0.0.1:8000 (override with `NEXT_PUBLIC_API_BASE` / `NEXT_PUBLIC_WS_BASE`).
