# PlayBook

Strategy/playbook reference viewer. React + Vite SPA that reads local xlsx data files.

## How to run

```bash
npm run dev      # http://localhost:5173 (Vite default)
npm run build
npm run preview
```

Also launchable via `StartPlaybook.bat` at the repo root.

## Stack

- **React 19** + **Vite 6**
- **`recharts`** for chart visualizations
- **`xlsx`** for reading local Excel files (e.g. `data/retracements.xlsx`)
- **`lucide-react`** for icons

## Key src layout

```
src/
  main.jsx
  components/
  utils/

data/            # local xlsx data files read by the app
charts/          # chart images or assets
dist/            # built output (not committed)
```

## Notes

- Standalone app — no backend, no Postgres dependency.
- Reads `data/` folder for playbook content and reference spreadsheets.
- `PlayBook.jsx` at the root is the main component (large single-file component).
- `playbook.config.js` and `vite.config.js` configure the build.
