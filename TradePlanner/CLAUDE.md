# TradePlanner

Pre-market trade planning tool. React + Vite SPA.

## How to run

```bash
npm run dev      # http://localhost:5173 (Vite default)
npm run build
npm run preview
```

## Stack

- **React** (JSX) + **Vite**
- No backend — runs fully in the browser

## Key src layout

```
src/
  App.jsx
  components/
  hooks/
  utils/
  constants.js
```

## Notes

- Standalone app, no dependency on `trades_db` or other apps in the monorepo.
- `plan.md` at root of this folder contains the original feature spec.
- `dist/` is the built output — not committed.
