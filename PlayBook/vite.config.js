import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVE_DIR = path.join(__dirname, 'data');
const CARDS_FILE = path.join(SAVE_DIR, 'playbook.json');
const TAXONOMY_FILE = path.join(SAVE_DIR, 'taxonomy.json');
const MARKET_NOTES_FILE = path.join(SAVE_DIR, 'market-notes.json');

// Load chart folder paths from config
function getChartFolders() {
  const configPath = path.join(__dirname, 'playbook.config.js');
  const folders = [path.join(__dirname, 'charts')]; // always include local charts/
  try {
    // Read the config file and extract paths (simple parse, avoids dynamic import issues)
    const content = fs.readFileSync(configPath, 'utf-8');
    const match = content.match(/chartFolders:\s*\[([\s\S]*?)\]/);
    if (match) {
      const entries = match[1].match(/'([^']+)'|"([^"]+)"/g);
      if (entries) {
        entries.forEach(e => {
          const p = e.replace(/['"]/g, '');
          if (p === './charts') return; // already included
          const resolved = path.isAbsolute(p) ? p : path.join(__dirname, p);
          if (fs.existsSync(resolved)) {
            folders.push(resolved);
            console.log('[PlayBook] Chart folder:', resolved);
          } else {
            console.warn('[PlayBook] Chart folder not found:', resolved);
          }
        });
      }
    }
  } catch { /* ignore */ }
  return folders;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function jsonHandler(filePath) {
  return (req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          ensureDir(SAVE_DIR);
          fs.writeFileSync(filePath, body, 'utf-8');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          console.error('[PlayBook] Save error:', err.message);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else if (req.method === 'GET') {
      try {
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf-8');
          res.setHeader('Content-Type', 'application/json');
          res.end(data);
        } else {
          res.setHeader('Content-Type', 'application/json');
          res.end('null');
        }
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    } else {
      res.statusCode = 405;
      res.end();
    }
  };
}

function playbookPlugin() {
  return {
    name: 'playbook-save',
    configureServer(server) {
      server.middlewares.use('/api/cards', jsonHandler(CARDS_FILE));
      server.middlewares.use('/api/taxonomy', jsonHandler(TAXONOMY_FILE));
      server.middlewares.use('/api/market-notes', jsonHandler(MARKET_NOTES_FILE));

      // Serve image files — searches all configured chart folders
      const chartFolders = getChartFolders();
      console.log('[PlayBook] Serving charts from:', chartFolders);

      server.middlewares.use('/charts', (req, res, next) => {
        const decoded = decodeURIComponent(req.url).replace(/^\//, '');

        // Try each configured folder
        for (const folder of chartFolders) {
          const filePath = path.join(folder, decoded);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
              '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
              '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
            };
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }

        res.statusCode = 404;
        res.end('Not found');
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), playbookPlugin()],
});
