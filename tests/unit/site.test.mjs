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

test('released titles: no page still announces a title as coming once every title is ready', () => {
  const soon = CAT.titles.filter((t) => t.status === 'soon');
  for (const t of CAT.titles.filter((x) => x.status === 'ready')) {
    const h = html[`/titles/${t.slug}/index.html`];
    assert.doesNotMatch(text(h), /Release date:|coming (October|November|December)/, t.slug);
    if (!t.free) assert.match(h, new RegExp(`order/\\?item=${t.slug}"`), `${t.slug}: buy link`);
  }
  const cfg = JSON.parse(html['/order/index.html'].match(/<script type="application\/json" id="order-config">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(cfg.items.filter((i) => i.kind === 'title').map((i) => i.id), CAT.titles.filter((t) => t.status === 'ready' && !t.free).map((t) => t.slug));
  if (!soon.length) {
    for (const [p, h] of Object.entries(html)) assert.doesNotMatch(text(h), /by e-mail as each one is released|\d more by|then [A-Z][a-z]+.* on (October|November)/, p);
  }
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

test('study pages: one per ready title, with overview rows, passages, 3 pack questions, AP section and one buy button', () => {
  const AP = JSON.parse(readFileSync(join(ROOT, 'data/ap-q3.json'), 'utf8'));
  const sm = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
  for (const t of CAT.titles.filter((x) => x.status === 'ready')) {
    const st = JSON.parse(readFileSync(join(ROOT, 'data/study', `${t.slug}.json`), 'utf8'));
    const h = html[`/study/${t.slug}/index.html`];
    assert.ok(h, `${t.slug}: study page`);
    assert.equal(st.checks.length, t.checks.length, `${t.slug}: one overview per check`);
    assert.equal((h.match(/<table class="titles units">[\s\S]*?<\/table>/)[0].match(/<tr>/g) || []).length - 1, t.checks.length, `${t.slug}: rows`);
    assert.ok(st.passages.length >= 5 && st.passages.length <= 6, `${t.slug}: passages`);
    assert.equal((h.match(/<figure class="passage">/g) || []).length, st.passages.length);
    for (const p of st.passages) assert.ok(p.quote.split(/\s+/).length <= 45 && /^(Act \d, Scene \d|Chapter \d+|Letter|The Custom-House)/.test(p.ref), `${t.slug}: ${p.ref}`);
    assert.equal(st.samples.length, 3, `${t.slug}: 3 questions from the pack, no more`);
    assert.equal(new Set(st.samples.map((q) => q.check)).size, 3, `${t.slug}: from 3 different checks`);
    assert.equal((h.match(/<figure class="qcard">/g) || []).length, 3);
    for (const q of st.samples) assert.ok(!t.samples.questions.some((x) => x.stem === q.stem), `${t.slug}: not the title-page samples`);
    assert.equal(st.qa.failing, 0);
    assert.equal(st.qa.leak, 0);
    const n = AP.lists.filter((l) => l.titles.includes(t.slug)).length;
    assert.match(text(h), n ? new RegExp(`printed in ${n} of the ${AP.lists.length} question-3 lists`) : /is not printed in any of the/, `${t.slug}: AP claim matches the lists`);
    const btns = [...h.matchAll(/<a class="btn" href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(btns, [t.free ? '/chapter-checks/free-sample/' : `/chapter-checks/order/?item=${t.slug}`], `${t.slug}: one CTA`);
    for (const l of ['/chapter-checks/', `/chapter-checks/titles/${t.slug}/`, '/chapter-checks/ap-literature/']) assert.ok(h.includes(`href="${l}"`), `${t.slug}: link ${l}`);
    const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))[0]['@graph'];
    assert.ok(ld.some((x) => x['@type'] === 'Article' && x.datePublished === st.updated) && ld.some((x) => x['@type'] === 'BreadcrumbList'), `${t.slug}: JSON-LD`);
    assert.match(sm, new RegExp(`study/${t.slug}/</loc><lastmod>${st.updated}</lastmod>`));
    assert.ok(html[`/titles/${t.slug}/index.html`].includes(`href="/chapter-checks/study/${t.slug}/"`), `${t.slug}: title page links to the guide`);
    assert.match(h, /AI assistant/, `${t.slug}: AI authorship disclosed`);
  }
});

test('AP question 3 data: 7 lists checked on 2026-10-17, Hamlet in none, home and AP page use the same counts', () => {
  const AP = JSON.parse(readFileSync(join(ROOT, 'data/ap-q3.json'), 'utf8'));
  assert.equal(AP.lists.length, 7);
  assert.equal(AP.checked, '2026-10-17');
  const n = (s) => AP.lists.filter((l) => l.titles.includes(s)).length;
  assert.deepEqual(['jane-eyre', 'frankenstein-1831', 'wuthering-heights', 'the-awakening', 'scarlet-letter', 'macbeth', 'great-gatsby', 'hamlet'].map(n), [6, 5, 5, 5, 4, 3, 1, 0]);
  for (const l of AP.lists) assert.match(l.url, /^https:\/\/apcentral\.collegeboard\.org\/media\/pdf\/ap2[3-6]-frq-english-lit/);
  assert.match(text(html['/index.html']), /Macbeth in three and The Great Gatsby in one\. Hamlet is in none/);
  assert.doesNotMatch(text(html['/index.html']), /other three are the classroom staples/);
});

test('CRO 2026-10-18: rd-hero pooled test on the home only, preview pages, licences, quote route, breadcrumbs, cluster links', () => {
  const xp = readFileSync(join(DIST, 'assets/xp.js'), 'utf8');
  assert.match(xp, /id: 'rd-hero',\s+variants: \['a', 'b'\],\s+mode: 'tab',\s+param: 'hero',\s+pages: '\^\/chapter-checks\/\$'/);
  const home = html['/index.html'];
  assert.match(home, /<figure class="hero-excerpt" data-hero-excerpt>[\s\S]*?data-cta[\s\S]*?Real excerpt from the free <i>Macbeth<\/i> pack/);
  assert.match(readFileSync(join(DIST, 'assets/style.css'), 'utf8'), /html\[data-xp-rd-hero="b"\] \.hero-excerpt \{ display: block; \}/);
  for (const p of ['/index.html', '/free-sample/index.html', '/order/index.html']) assert.match(html[p], /macbeth-student-p1\.webp/, p);
  assert.match(text(home), /Licence: one teacher, all of your classes\. .*Licence: every teacher in one school/);
  for (const p of ['/index.html', '/order/index.html']) assert.ok(html[p].includes('href="/chapter-checks/quote/"'), p);
  const ld = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const faq = ld.find((x) => x['@type'] === 'FAQPage');
  const visible = [...home.match(/<section class="faq" id="faq">[\s\S]*?<\/section>/)[0].matchAll(/<details><summary>([^<]+)<\/summary>/g)].map((m) => m[1]);
  assert.deepEqual(faq.mainEntity.map((q) => q.name), visible, 'FAQPage = the visible FAQ');
  for (const [p, h] of Object.entries(html)) {
    if (p === '/index.html' || p === '/404.html') continue;
    assert.match(h, /<nav class="crumbs" aria-label="Breadcrumb"><a href="https:\/\/outils\.vread\.fr\/">outils\.vread\.fr<\/a> › <a href="\/chapter-checks\/">Chapter Checks<\/a>/, p);
    const g = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
    const bc = g.find((x) => x['@type'] === 'BreadcrumbList');
    assert.equal(bc.itemListElement[0].item, 'https://outils.vread.fr/', p);
    assert.match(h, /<a href="https:\/\/outils\.vread\.fr\/a-propos\/">Who makes this, and how<\/a>/, p);
  }
  for (const t of CAT.titles.filter((x) => x.status === 'ready' && !x.free)) {
    assert.ok(html[`/titles/${t.slug}/index.html`].includes('href="/chapter-checks/free-sample/"'), `${t.slug}: title -> sample`);
    assert.ok(html[`/study/${t.slug}/index.html`].includes('href="/chapter-checks/free-sample/"'), `${t.slug}: study -> sample`);
    assert.ok(html['/free-sample/index.html'].includes(`href="/chapter-checks/titles/${t.slug}/"`) && html['/free-sample/index.html'].includes(`href="/chapter-checks/study/${t.slug}/"`), `${t.slug}: sample -> title and study`);
  }
  assert.ok(html['/free-sample/index.html'].includes('href="/chapter-checks/study/macbeth/"'));
  const sm = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
  assert.match(sm, /chapter-checks\/quote\/<\/loc><lastmod>2026-10-18</);
  assert.match(sm, /chapter-checks\/<\/loc><lastmod>2026-10-21</);
  const q = html['/quote/index.html'];
  assert.match(text(q), /not available yet/);
  assert.doesNotMatch(q, /<form[^>]+action=/, 'quote form posts nowhere');
});

test('free quiz titles (2026-10-21): one page each, a checkpoint and MC questions per check, keys with evidence, gated QA, one sample CTA, linked from the cluster', () => {
  const quizzes = CAT.free_quizzes || [];
  const sm = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
  const AP = JSON.parse(readFileSync(join(ROOT, 'data/ap-q3.json'), 'utf8'));
  for (const t of quizzes) {
    const d = JSON.parse(readFileSync(join(ROOT, 'data/free', `${t.slug}.json`), 'utf8'));
    const h = html[`/quizzes/${t.slug}/index.html`];
    assert.ok(h, `${t.slug}: page`);
    assert.ok(d.checks.length >= 3, t.slug);
    assert.equal((h.match(/<section class="quiz" id="/g) || []).length, d.checks.length, `${t.slug}: one quiz per check`);
    assert.equal((h.match(/<figure class="qcard cp">/g) || []).length, d.checks.length, `${t.slug}: one checkpoint per check`);
    assert.equal((h.match(/<figure class="qcard">/g) || []).length, d.checks.reduce((a, c) => a + c.questions.length, 0));
    for (const c of d.checks) {
      assert.ok(!/\s/.test(c.checkpoint.answer.trim()) && c.checkpoint.evidence.includes(c.checkpoint.answer), `${t.slug} ${c.id}: one-word checkpoint in its evidence`);
      for (const q of c.questions) assert.ok(q.options.length === 4 && new Set(q.options).size === 4 && 'ABCD'.includes(q.answer) && q.evidence.length >= 1, `${t.slug} ${c.id}`);
    }
    assert.ok(d.passages.length >= 5 && d.passages.length <= 6, `${t.slug}: passages`);
    assert.deepEqual([d.qa.failing, d.qa.leak, d.qa.pass], [0, 0, d.qa.items], `${t.slug}: every item passed the summary gate`);
    assert.equal(d.qa.items, d.checks.reduce((a, c) => a + 1 + c.questions.length, 0), `${t.slug}: QA covers every question`);
    assert.deepEqual([...h.matchAll(/<a class="btn" href="([^"]+)"/g)].map((m) => m[1]), ['/chapter-checks/free-sample/'], `${t.slug}: one CTA, the free sample`);
    assert.match(h, /href="\/chapter-checks\/free-sample\/" data-mesure="sample_click"/);
    const g = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
    const qz = g.find((x) => x['@type'] === 'Quiz');
    assert.ok(qz && qz.isAccessibleForFree && qz.about.author.name === t.author && qz.datePublished === d.updated, `${t.slug}: Quiz JSON-LD`);
    assert.match(sm, new RegExp(`quizzes/${t.slug}/</loc><lastmod>${d.updated}</lastmod>`));
    assert.match(h, /AI assistant/);
    const n = AP.lists.filter((l) => l.titles.includes(t.slug)).length;
    if (n) assert.match(text(h), new RegExp(`is printed in ${n} of the ${AP.lists.length} AP Literature question-3 lists`), t.slug);
    for (const p of ['/index.html', '/free-sample/index.html', '/sources/index.html', '/titles/hamlet/index.html', '/study/hamlet/index.html']) assert.ok(html[p].includes(`href="/chapter-checks/quizzes/${t.slug}/"`) || p === '/sources/index.html', `${p} -> ${t.slug}`);
    assert.match(text(html['/sources/index.html']), new RegExp(`Project Gutenberg #${t.gutenberg}`));
    for (const x of quizzes.filter((x) => x.slug !== t.slug)) assert.ok(h.includes(`href="/chapter-checks/quizzes/${x.slug}/"`), `${t.slug} -> ${x.slug}`);
  }
  assert.ok(!files.some((f) => f.includes('/sample/') && quizzes.some((t) => f.includes(t.slug))), 'no files for free quiz titles');
});
