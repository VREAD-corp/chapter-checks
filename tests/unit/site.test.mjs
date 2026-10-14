// Static checks of the built site (npm test builds dist/ first).
// Optional local checks: OCTAVE_CHECKOUT_WEB=../octave-checkout/gas/web (mesure.js and cro.js byte-identical to the
// master copies), OG_DIST=../octave-global-checkout/dist (og-checkout.js identical), LINT_IA=../vread-revenue-lab/content/lint-ia.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = join(ROOT, 'dist');
const BASE = '/chapter-checks/';
const CAT = JSON.parse(readFileSync(join(ROOT, 'data/catalog.json'), 'utf8'));
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(DIST);
const pages = files.filter((f) => f.endsWith('.html'));
const html = Object.fromEntries(pages.map((f) => [f.slice(DIST.length), readFileSync(f, 'utf8')]));
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');

test('every page has lang en, a title, a description, one h1, and a canonical URL (except 404)', () => {
  assert.ok(pages.length >= 16, `${pages.length} pages`);
  for (const [p, h] of Object.entries(html)) {
    assert.match(h, /<html lang="en">/, p);
    assert.match(h, /<title>[^<]{10,}<\/title>/, p);
    assert.match(h, /<meta name="description" content="[^"]{40,}">/, p);
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, `${p}: one h1`);
    if (p !== '/404.html') assert.match(h, new RegExp(`<link rel="canonical" href="https://outils\\.vread\\.fr${BASE}`), p);
  }
  const titles = Object.values(html).map((h) => h.match(/<title>([^<]+)/)[1]);
  assert.equal(new Set(titles).size, titles.length, 'unique titles');
});

test('internal links and assets resolve to built files', () => {
  for (const [p, h] of Object.entries(html)) {
    for (const [, href] of h.matchAll(/(?:href|src)="(\/chapter-checks\/[^"#?]*)/g)) {
      let f = join(DIST, href.slice(BASE.length));
      if (href.endsWith('/')) f = join(f, 'index.html');
      assert.ok(existsSync(f), `${p} -> ${href}`);
    }
  }
});

test('JSON-LD parses, names READ FRANCE, and has no rating or review', () => {
  for (const [p, h] of Object.entries(html)) {
    for (const [, j] of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const d = JSON.parse(j);
      assert.ok(JSON.stringify(d).includes('READ FRANCE SAS'), p);
      assert.doesNotMatch(j, /aggregateRating|"review"|ratingValue/i, p);
    }
  }
});

test('tracking: mesure.js v:2 knows the site, cro.js is configured for chapter-checks; only the order page loads the checkout', () => {
  const mesure = readFileSync(join(DIST, 'mesure.js'), 'utf8');
  assert.match(mesure, /v:2/);
  assert.match(mesure, /chapter-checks/);
  for (const [p, h] of Object.entries(html)) {
    assert.match(h, /<script src="\/chapter-checks\/assets\/xp\.js"><\/script>\n<script src="\/chapter-checks\/cro\.js" data-site="chapter-checks"/, p);
    assert.match(h, /mesure\.js" defer/, p);
    const ext = [...h.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ext, [], `${p}: no third-party script tag`);
    if (p === '/order/index.html') assert.match(h, /og-checkout\.js\?v=1\.4\.0/);
    else assert.doesNotMatch(h, /og-checkout/, p);
  }
});

test('vendored scripts are byte-identical to their masters (when the sibling repos are given)', { skip: !process.env.OCTAVE_CHECKOUT_WEB && !process.env.OG_DIST }, () => {
  if (process.env.OCTAVE_CHECKOUT_WEB) for (const f of ['mesure.js', 'cro.js']) assert.equal(readFileSync(join(ROOT, 'src/vendor', f), 'utf8'), readFileSync(join(process.env.OCTAVE_CHECKOUT_WEB, f), 'utf8'), f);
  if (process.env.OG_DIST) assert.equal(readFileSync(join(ROOT, 'src/vendor/og-checkout.js'), 'utf8'), readFileSync(join(process.env.OG_DIST, 'og-checkout.js'), 'utf8'));
});

test('order page: US only, product ids and prices match the catalog, A/B variants p5/p7', () => {
  const h = html['/order/index.html'];
  const cfg = JSON.parse(h.match(/<script type="application\/json" id="order-config">([\s\S]*?)<\/script>/)[1]);
  assert.equal(cfg.venture, 'v4-64');
  assert.deepEqual(cfg.prices, { p5: 500, p7: 700, bundle: 2900, school: 24900 });
  assert.equal(cfg.endpoint, undefined, 'production build has no test endpoint');
  const titles = cfg.items.filter((i) => i.kind === 'title');
  assert.ok(titles.length >= 3);
  for (const t of titles) assert.match(`${t.products.p5} ${t.products.p7}`, /^cc-[a-z-]+-5-usd cc-[a-z-]+-7-usd$/);
  assert.deepEqual(cfg.items.filter((i) => i.kind !== 'title').map((i) => [i.product, i.amount]), [['cc-bundle-29-usd', 2900], ['cc-school-249-usd', 24900]]);
  const xp = readFileSync(join(DIST, 'assets/xp.js'), 'utf8');
  assert.match(xp, /id: 'cc-prix',\s+variants: \['p5', 'p7'\]/);
  assert.match(readFileSync(join(DIST, 'assets/order.js'), 'utf8'), /countries: \['US'\]/);
});

test('catalog: at least 3 ready titles, the others dated; every ready paid title has products', () => {
  const ready = CAT.titles.filter((t) => t.status === 'ready');
  assert.ok(ready.length >= 3, `${ready.length} ready`);
  for (const t of CAT.titles.filter((x) => x.status === 'soon')) assert.match(t.release, /^2026-1[0-2]-\d\d$/, t.slug);
  for (const t of ready.filter((x) => !x.free)) assert.ok(t.products?.p5 && t.products?.p7, t.slug);
  for (const t of CAT.titles) assert.ok(t.gutenberg > 0 && Number(String(t.first_published).slice(0, 4)) < 1931, `${t.slug}: published before 1931`);
});

test('no paid content in the public site: only the free title has files', () => {
  const sample = files.filter((f) => f.includes('/sample/'));
  const free = CAT.titles.filter((t) => t.free).map((t) => t.slug);
  assert.deepEqual([...new Set(sample.map((f) => f.split('/sample/')[1].split('/')[0]))], free);
  assert.ok(sample.some((f) => f.endsWith('-answer-key.pdf')) && sample.some((f) => f.endsWith('-qti-1.2.zip')) && sample.some((f) => f.endsWith('.csv')));
});

test('honest claims: no endorsement, no official status, AP disclaimer on every page', () => {
  for (const [p, h] of Object.entries(html)) {
    const t = text(h);
    assert.doesNotMatch(t, /\b(AP|College Board)[ -](approved|endorsed|official)\b|\bofficial (AP|College Board)\b|\bguarantee/i, p);
    assert.match(t, /College Board, which is not affiliated with/, p);
    assert.doesNotMatch(t, /\bVread (Classe|Classroom)\b/, p);
  }
});

test('anti-AI grid: lint-ia >= 85 on every page (when the linter is given)', { skip: !process.env.LINT_IA }, () => {
  const out = execFileSync('node', [process.env.LINT_IA, '--json', ...pages], { encoding: 'utf8' });
  const res = JSON.parse(out);
  for (const r of Array.isArray(res) ? res : res.files) assert.ok(r.score >= 85, `${r.file}: ${r.score}`);
});
