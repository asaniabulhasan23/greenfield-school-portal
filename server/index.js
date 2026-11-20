'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const api = require('./api');
const { seed, ensureSections } = require('./seed');
const { UPLOADS_DIR } = require('./db');

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
};

function sendFile(res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const noCache = ['.html', '.js', '.mjs', '.css'].includes(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    if (req.url.startsWith('/api/')) {
      const handled = await api.handle(req, res);
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    /* Profile photos live in data/uploads, not in the public bundle. */
    if (pathname.startsWith('/uploads/')) {
      const name = path.basename(pathname);
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad request');
        return;
      }
      sendFile(res, path.join(UPLOADS_DIR, name));
      return;
    }

    /* Generated PDFs are served as real downloads so in-app WebViews
       hand them to the device's download manager instead of ignoring them. */
    const downloadMatch = /^\/download\/([a-f0-9]{36})\/([a-zA-Z0-9._-]+)$/.exec(pathname);
    if (downloadMatch) {
      const filePath = path.join(__dirname, '..', 'data', 'exports', `${downloadMatch[1]}.pdf`);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('This document is no longer available. Download it again from the portal.');
        return;
      }
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${downloadMatch[2]}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    /* Same document can be opened inline for preview / system print. */
    const viewMatch = /^\/view\/([a-f0-9]{36})$/.exec(pathname);
    if (viewMatch) {
      const filePath = path.join(__dirname, '..', 'data', 'exports', `${viewMatch[1]}.pdf`);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('This document is no longer available. Generate it again from the portal.');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': fs.statSync(filePath).size,
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const target = path.join(PUBLIC_DIR, path.normalize(pathname));
    if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== PUBLIC_DIR) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      sendFile(res, target);
      return;
    }

    /* SPA fallback for client-side routes */
    if (!path.extname(pathname)) {
      sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

const created = seed();
if (created) console.log('[db] demo data seeded');
const madeSections = ensureSections();
if (madeSections) console.log('[db] sections created and classes assigned');

server.listen(PORT, HOST, () => {
  console.log(`\n  Greenfield Academy portal`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<this-device-ip>:${PORT}`);
  console.log(`  Admin:   admin@greenfield.edu.ng / admin123`);
  console.log(`  Teacher: adaeze@greenfield.edu.ng / teach123`);
  console.log(`  Student: chidera.obi@student.greenfield.edu.ng / student123\n`);
});
