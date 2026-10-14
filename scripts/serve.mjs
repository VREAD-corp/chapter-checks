// Tiny static server for local testing: serves dist/ under SITE_BASE.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
const base = process.env.SITE_BASE || '/chapter-checks/';
const root = new URL('../dist/', import.meta.url).pathname;
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.webp': 'image/webp', '.pdf': 'application/pdf', '.zip': 'application/zip', '.csv': 'text/csv; charset=utf-8', '.gs': 'text/plain; charset=utf-8' };
createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith(base)) { res.writeHead(404); return res.end('not found'); }
  let p = normalize(join(root, decodeURIComponent(u.pathname.slice(base.length))));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    if ((await stat(p)).isDirectory()) p = join(p, 'index.html');
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(join(root, '404.html')).catch(() => 'not found'));
  }
}).listen(port, () => console.log(`http://localhost:${port}${base}`));
