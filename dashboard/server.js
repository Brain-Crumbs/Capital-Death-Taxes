import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PORT       = Number(process.env.PORT) || 3000;

const DASHBOARD_ROOT = __dirname;
const RUNS_ROOT      = path.resolve(__dirname, '../output/runs');
const CARDS_ROOT     = path.resolve(__dirname, '../data/cards');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.ico':  'image/x-icon',
};

function send(res, status, contentType, body) {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

function serveFile(res, filePath) {
  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) { send(res, 404, 'text/plain', 'Not found'); return; }
    send(res, 200, mime, data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, `http://localhost:${PORT}`).pathname;

  // /runs/ → JSON listing of available simulation output files
  if (urlPath === '/runs' || urlPath === '/runs/') {
    fs.readdir(RUNS_ROOT, (err, files) => {
      const jsonFiles = err ? [] : files.filter(f => f.endsWith('.json')).sort();
      send(res, 200, MIME['.json'], JSON.stringify({ files: jsonFiles }));
    });
    return;
  }

  // /runs/<file> → serve individual run file
  if (urlPath.startsWith('/runs/')) {
    const filename = path.basename(urlPath); // prevents path traversal
    serveFile(res, path.join(RUNS_ROOT, filename));
    return;
  }

  // /cards/<file>.json → serve card data file directly
  if (urlPath.startsWith('/cards/')) {
    const cardPath = urlPath.slice('/cards/'.length);

    // Security: reject path traversal attempts
    if (!cardPath || cardPath.includes('..') || cardPath.includes('\0')) {
      send(res, 403, 'text/plain', 'Forbidden');
      return;
    }

    const fullPath = path.resolve(CARDS_ROOT, cardPath);

    // Ensure the resolved path stays inside CARDS_ROOT
    if (!fullPath.startsWith(CARDS_ROOT + path.sep) && fullPath !== CARDS_ROOT) {
      send(res, 403, 'text/plain', 'Forbidden');
      return;
    }

    serveFile(res, fullPath);
    return;
  }

  // dashboard/ static files
  const relPath  = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.resolve(DASHBOARD_ROOT, '.' + relPath);
  if (!filePath.startsWith(DASHBOARD_ROOT)) {
    send(res, 403, 'text/plain', 'Forbidden');
    return;
  }
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Dashboard    →  http://localhost:${PORT}`);
  console.log(`Card viewer  →  http://localhost:${PORT}/card-viewer.html`);
  console.log(`Runs list    →  http://localhost:${PORT}/runs/`);
  console.log('Ctrl+C to stop.');
});
