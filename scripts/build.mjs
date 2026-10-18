// Builds the static site into dist/ (GitHub Pages, served at https://outils.vread.fr/chapter-checks/).
// Inputs: data/catalog.json (exported by the private content repo: titles, status, counts, 2 sample questions per
// title, product ids), src/ (assets, vendored mesure.js / cro.js / og-checkout.js, the free Macbeth files).
// Env: SITE_BASE (default /chapter-checks/), SITE_ORIGIN (default https://outils.vread.fr), OUT (default dist),
//      OG_ENDPOINT + OG_PK (test builds only: checkout against a local backend and the Stripe sandbox).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.env.OUT || 'dist');
const BASE = process.env.SITE_BASE || '/chapter-checks/';
const ORIGIN = process.env.SITE_ORIGIN || 'https://outils.vread.fr';
const CAT = JSON.parse(readFileSync(join(ROOT, 'data/catalog.json'), 'utf8'));
const CONTACT = 'octave@vread.fr';
const TRACK_API = 'https://script.google.com/macros/s/AKfycbzD1IRL8QALluKGZxgGiORFP6-DkC_qFJYR9aOxZiimxa06nbCqpzUI-9iLblp6V2VY/exec';
const VENTURE = 'v4-64';
const OG_VERSION = '1.4.0';
const TERMS_VERSION = 'terms-2026-10-14';
const UPDATED = 'October 14, 2026';

const u = (p = '') => BASE + p.replace(/^\//, '');
const abs = (p = '') => ORIGIN + u(p);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const usd = (c) => `$${c % 100 ? (c / 100).toFixed(2) : c / 100}`;
const longDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fullTitle = (t) => t.title + (t.subtitle ? ` (${t.subtitle})` : '');
const TITLES = CAT.titles;
const READY = TITLES.filter((t) => t.status === 'ready');
const PAID = READY.filter((t) => !t.free);
const SOON = TITLES.filter((t) => t.status === 'soon');
const LAST = SOON.length ? longDate(SOON[SOON.length - 1].release) : null; // release date of the last title still to come
const isPlay = (t) => t.slug === 'macbeth' || t.slug === 'hamlet';
const FREE = READY.find((t) => t.free);
const P = CAT.prices;
const AP = JSON.parse(readFileSync(join(ROOT, 'data/ap-q3.json'), 'utf8'));
const STUDY = Object.fromEntries(READY.map((t) => [t.slug, join(ROOT, 'data/study', `${t.slug}.json`)]).filter(([, f]) => existsSync(f)).map(([s, f]) => [s, JSON.parse(readFileSync(f, 'utf8'))]));
const apLists = (slug) => AP.lists.filter((l) => l.titles.includes(slug));
const apName = (l) => `${l.year}${l.set ? ` ${l.set}` : ''}`;
const DEFAULT_LASTMOD = '2026-10-14';
const OG_ENDPOINT = process.env.OG_ENDPOINT || '';
const OG_PK = process.env.OG_PK || '';

const LOGO = `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect x="5" y="3" width="22" height="26" rx="3" fill="#FBF8F4" stroke="#2F2721" stroke-width="2"/><path d="M10 10h12M10 15h12M10 20h6" stroke="#2F2721" stroke-width="1.8" stroke-linecap="round"/><path d="M17 21.5l3 3 6-7" fill="none" stroke="#B4232C" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ABOUT = 'https://outils.vread.fr/a-propos/'; // READ FRANCE's page on who writes, who publishes and the reading engine (hub, in French)
const ORG = { '@type': 'Organization', '@id': 'https://outils.vread.fr/#org', name: 'READ FRANCE SAS', url: 'https://outils.vread.fr/', email: CONTACT, publishingPrinciples: ABOUT,
  address: { '@type': 'PostalAddress', streetAddress: '11 rue Rouvet', postalCode: '75019', addressLocality: 'Paris', addressCountry: 'FR' } };
// Article author: the company, with its "who and how" page (the texts are written by Octave, an AI agent; no Person author).
const AUTHOR = { '@type': 'Organization', name: 'READ FRANCE SAS', url: ABOUT };
const HUB = ['outils.vread.fr', 'https://outils.vread.fr/'];

const NAV = [['', 'Home'], ['free-sample/', 'Free Macbeth'], ['ap-literature/', 'AP Lit titles'], ['order/', 'Prices']];
const WHO = `<a href="${ABOUT}">Who makes this, and how</a>`;

function csp(checkout) {
  const ep = OG_ENDPOINT ? ' ' + new URL(OG_ENDPOINT).origin : '';
  return checkout
    ? `default-src 'self'; script-src 'self' https://js.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://api.stripe.com${ep}; img-src 'self' data: https://*.stripe.com; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`
    : `default-src 'self'; script-src 'self'; connect-src 'self' https://script.google.com https://script.googleusercontent.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`;
}

function layout(pg) {
  const canonical = abs(pg.path);
  const nav = NAV.map(([p, t]) => `<li><a href="${u(p)}"${p === pg.path ? ' aria-current="page"' : ''}>${t}</a></li>`).join('');
  // Breadcrumbs: outils.vread.fr › Chapter Checks › … ; pg.crumbs = [[label, path], …, [label]] (last one is this page).
  const trail = pg.crumbs ? [HUB, ['Chapter Checks', abs('')], ...pg.crumbs.map(([n, p]) => [n, p === undefined ? canonical : abs(p)])] : null;
  const crumbLd = trail ? [{ '@type': 'BreadcrumbList', itemListElement: trail.map(([n, item], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item })) }] : [];
  const crumbs = trail ? `<nav class="crumbs" aria-label="Breadcrumb"><a href="${HUB[1]}">${HUB[0]}</a> › <a href="${u('')}">Chapter Checks</a> › ${pg.crumbs.map(([n, p]) => (p === undefined ? `<span aria-current="page">${esc(n)}</span>` : `<a href="${u(p)}">${esc(n)}</a>`)).join(' › ')}</nav>\n` : '';
  const graph = [...(pg.ld || []), ...crumbLd];
  const ld = graph.length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [ORG, ...graph] })}</script>\n` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp(pg.checkout)}">
<title>${esc(pg.title)}</title>
<meta name="description" content="${esc(pg.description)}">
${pg.noindex ? '<meta name="robots" content="noindex">\n' : `<link rel="canonical" href="${canonical}">\n`}<meta property="og:type" content="website">
<meta property="og:locale" content="en_US">
<meta property="og:site_name" content="Chapter Checks by READ FRANCE">
<meta property="og:title" content="${esc(pg.title)}">
<meta property="og:description" content="${esc(pg.description)}">
<meta property="og:url" content="${canonical}">
<link rel="icon" href="${u('assets/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${u('assets/style.css')}">
<script src="${u('assets/xp.js')}"></script>
<script src="${u('cro.js')}" data-site="chapter-checks" data-api="${TRACK_API}" data-hosts="outils.vread.fr" data-cta="a.btn, [data-cta], #buy button"></script>
<script src="${u('mesure.js')}" defer></script>
<script src="${u('assets/goals.js')}" defer></script>
${ld}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site"><div class="wrap">
<a class="brand" href="${u('')}">${LOGO}<span>Chapter Checks<small>by READ FRANCE</small></span></a>
<nav aria-label="Main"><ul>${nav}</ul></nav>
</div></header>
<main id="main"><div class="wrap">
${crumbs}${pg.body}
</div></main>
<footer class="site"><div class="wrap">
<p><strong>Chapter Checks</strong> is an activity of READ FRANCE, the publisher of Vread. READ FRANCE SAS, 11 rue Rouvet, 75019 Paris, France. Contact: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
<p>AP® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this product. The literary texts are in the public domain in the United States; the questions are © 2026 READ FRANCE SAS.</p>
<ul class="links"><li>${WHO}</li><li><a href="${u('sources/')}">Sources and public-domain status</a></li><li><a href="${u('quote/')}">Quote or purchase order</a></li><li><a href="${u('terms/')}">Terms and legal notice</a></li><li><a href="${u('privacy/')}">Privacy</a></li></ul>
</div></footer>
${pg.scripts || ''}</body>
</html>
`;
}

function write(path, html) {
  const f = join(OUT, path, path.endsWith('.html') ? '' : 'index.html');
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, html);
}

// ------------------------------------------------------------------------------------------------------------
// Pieces
// ------------------------------------------------------------------------------------------------------------

const priceTitle = `<span data-price-title>${usd(P.p5)}</span>`;

function sampleCard(t, q, n, open = false) {
  const opts = q.options.map((o, i) => `<li${'ABCD'[i] === q.answer ? ' class="key"' : ''}><span class="L">${'ABCD'[i]}</span> ${esc(o)}</li>`).join('');
  return `<figure class="qcard">
<figcaption>${esc(t.title)} · ${esc(t.samples.check)} · ${q.skill === 'close' ? 'close reading' : q.skill}</figcaption>
<p class="stem"><span class="n">${n}.</span> ${esc(q.stem)}</p>${q.quote ? `<blockquote>“${esc(q.quote)}”</blockquote>` : ''}
<ol class="opts">${opts}</ol>
<details${open ? ' open' : ''}><summary>Answer key</summary><p><span class="n">${q.answer}.</span> ${esc(q.why)}</p></details>
</figure>`;
}

function checkpointCard(t) {
  const cp = t.samples && t.samples.checkpoint;
  if (!cp) return '';
  return `<figure class="qcard cp">
<figcaption>${esc(t.title)} · ${esc(t.samples.check)} · reading checkpoint</figcaption>
<p class="stem">${esc(cp.question)}</p>
<p class="muted">Answer: one word from the text.</p>
<details><summary>Answer key</summary><p><b>${esc(cp.answer)}</b>. “${esc(cp.evidence)}”</p></details>
</figure>`;
}

function titleRow(t) {
  const name = `<a href="${u(`titles/${t.slug}/`)}">${esc(fullTitle(t))}</a>`;
  const scope = t.status === 'ready' ? `${t.checks.length} checks, ${t.questions} questions` : esc(t.checks_planned);
  const status = t.free ? '<span class="tag free">Free</span>' : t.status === 'ready' ? `<span class="tag ok">Ready</span>` : `<span class="tag soon">${esc(longDate(t.release))}</span>`;
  return `<tr><td>${name}<br><span class="muted">${esc(t.author)}</span></td><td>${scope}</td><td>${status}${apLists(t.slug).length ? ` <span class="tag ap" title="Printed in ${apLists(t.slug).length} of the ${AP.lists.length} AP Literature question-3 lists, 2023–2026">AP Q3</span>` : ''}</td></tr>`;
}

const titleTable = `<div class="table-wrap"><table class="titles">
<thead><tr><th scope="col">Title</th><th scope="col">What you get</th><th scope="col">Status</th></tr></thead>
<tbody>${TITLES.map(titleRow).join('')}</tbody></table></div>`;

const packList = `<ul class="pack">
<li><b>Student checks (PDF, US Letter).</b> Name, date and score lines; each check starts on a new page.</li>
<li><b>A reading checkpoint per check.</b> One open question on a concrete detail from the middle of the act or chapters, answered with one word of the text. A study-guide summary does not give it.</li>
<li><b>Answer key (PDF, kept apart).</b> The right letter, one line on why, and the line of the text that proves it. A 2-1-0 rubric for every written answer.</li>
<li><b>Canvas and Schoology.</b> A QTI 1.2 ZIP: one quiz per check, multiple choice graded automatically.</li>
<li><b>Google Forms.</b> A CSV and a short script that turns it into one self-grading quiz per check, in your own Drive.</li>
<li><b>Any other quiz tool.</b> The same CSV: question, options A to D, right answer, points, rubric.</li>
</ul>`;

const vread = `<aside class="vread"><p><b>Want each student's reading checked as they go, without grading?</b> That is what the Vread app does: a question about the passage every 30 to 40 pages, and pages count only once the answer is right. It is free to download at <a href="https://www.vread-app.com/" rel="noopener">vread-app.com</a>. Chapter Checks stays on paper and in your LMS: no student accounts, no tracking.</p></aside>`;

// ------------------------------------------------------------------------------------------------------------
// Pages
// ------------------------------------------------------------------------------------------------------------

const pages = [];
const gatsby = TITLES.find((t) => t.slug === 'great-gatsby');
const frank = TITLES.find((t) => t.slug === 'frankenstein-1831');
const totalQ = READY.reduce((a, t) => a + t.questions, 0);
const totalChecks = READY.reduce((a, t) => a + t.checks.length, 0);

const apListed = READY.filter((t) => apLists(t.slug).length).length;
const FAQ = [
  ['Can I edit the questions?', 'Yes. The CSV and the imported Canvas or Google Forms quizzes are yours to edit for your classes. The PDF is fixed.'],
  ['Can colleagues use my copy?', `No. A title pack or the ${TITLES.length}-title set is licensed to one teacher, for as many classes as that teacher teaches. For a department, the school licence (${usd(P.school)}) covers every teacher in one school until June 30, 2027.`],
  ['Do I get corrections and updates?', 'Yes. If a question or a key turns out to be wrong, we fix it and send the corrected files to every buyer of the title, at no cost.'],
  ['Can my school pay with a purchase order?', `Not on net-30 terms yet: payment is by card (a school purchasing card works), and the invoice is made out to the school. If your business office needs a quote before it can buy, build a printable quote on the <a href="${u('quote/')}">quote page</a> and send it to us with your purchase order: we will tell you whether we can accept it.`],
  ['Do you collect student data?', 'No. There are no student accounts. The checks run on paper or inside your own LMS or Google account; nothing comes back to us.'],
  ['Is this endorsed by the College Board?', 'No. Chapter Checks is independent. We use "AP" only to say which course the titles are taught in.'],
];
const plain = (h) => h.replace(/<[^>]+>/g, '');
pages.push({
  path: '',
  title: 'Chapter Checks by READ FRANCE: printable reading checks for AP Literature classics',
  lastmod: '2026-10-18',
  description: `Chapter and act checks for ${TITLES.length} public-domain classics taught in AP Literature and grades 11–12: PDF, answer key with text evidence, rubric, Canvas QTI and Google Forms. ${usd(P.p5)} a title; Macbeth is free.`,
  ld: [{ '@type': 'WebSite', name: 'Chapter Checks by READ FRANCE', url: abs(''), publisher: { '@id': ORG['@id'] }, inLanguage: 'en-US' },
    { '@type': 'ItemList', name: 'Chapter Checks titles', itemListElement: TITLES.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: `${fullTitle(t)} chapter checks`, url: abs(`titles/${t.slug}/`) })) },
    { '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: plain(a) } })) },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: HUB[0], item: HUB[1] }, { '@type': 'ListItem', position: 2, name: 'Chapter Checks', item: abs('') }] }],
  body: `<section class="hero" id="hero">
<div>
<p class="eyebrow">AP® English Literature · grades 11–12</p>
<h1>Reading checks that a summary won't pass</h1>
<p class="lead">A short check for every chapter or act of ${TITLES.length} public-domain classics, with a key that quotes the line proving each answer. Print it or import it into Canvas or Google Forms. ${priceTitle} a title, and <i>Macbeth</i> is free.</p>
<p class="cta"><a class="btn" href="${u('free-sample/')}" data-mesure="cta_click">Download Macbeth, free (no e-mail)</a> <a class="textlink" href="#titles">See the ${TITLES.length} titles</a></p>
<p class="small">${SOON.length ? `${READY.length} titles ready today (${totalChecks} checks, ${totalQ} questions). ${SOON.length} more by ${esc(LAST)}.` : `All ${READY.length} titles ready today: ${totalChecks} checks, ${totalQ} questions, PDF + Canvas QTI + CSV, by e-mail within minutes of payment.`} ${apListed} of the ${READY.length} are printed in the College Board's AP Lit question 3 lists, 2023–2026 (<a href="${u('ap-literature/')}">our count, with the PDFs</a>).</p>
</div>
${sampleCard(frank, frank.samples.questions[1], 4)}
<figure class="hero-excerpt" data-hero-excerpt>
<a href="${u('free-sample/')}" data-cta><img src="${u('assets/img/macbeth-act1-excerpt.webp')}" width="760" height="495" loading="lazy" decoding="async" alt="Top of page 1 of the Macbeth student checks PDF: the Act 1 check header with name, date, class and score lines, the reading checkpoint and questions 1 and 2 with options A to D."></a>
<figcaption>Real excerpt from the free <i>Macbeth</i> pack: Act 1 check, student PDF, page 1. <a href="${u('free-sample/')}" data-cta>Open the whole pack, free</a></figcaption>
</figure>
</section>

<section id="format">
<h2>What a check looks like</h2>
<p>Each check has 5 to 8 questions and takes 10 to 15 minutes. The mix is the same in every check:</p>
<ul>
<li><b>Recall</b> of details a plot summary leaves out: who said what to whom, an object, a place, the order of two events.</li>
<li><b>Inference</b>: why a character acts, what a reaction shows.</li>
<li><b>Close reading</b> of a short quoted line: what a word or image does.</li>
<li><b>One written answer</b> in two or three sentences, graded 2, 1 or 0 with the rubric in the key.</li>
</ul>
<p>Questions refer to chapters and acts, never to page numbers, so they work with any complete edition.</p>
${sampleCard(gatsby, gatsby.samples.questions[0], 1)}
<h3>The pages, as you print them</h3>
<div class="previews">
<a href="${u('sample/macbeth/macbeth-student-checks.pdf')}" data-mesure="free_download"><img src="${u('assets/img/macbeth-student-p1.webp')}" width="480" height="621" loading="lazy" decoding="async" alt="Page 1 of the Macbeth student checks: Act 1 check, reading checkpoint and questions 1 to 5."><span>Student check, page 1 (PDF)</span></a>
<a href="${u('sample/macbeth/macbeth-answer-key.pdf')}" data-mesure="free_download"><img src="${u('assets/img/macbeth-key-p2.webp')}" width="480" height="621" loading="lazy" decoding="async" alt="Page 2 of the Macbeth answer key: Act 1 answers with the skill tested, why each answer is right and the line of the play that proves it."><span>Answer key, page 2 (PDF)</span></a>
</div>
<p class="small">Both pages come from the free <i>Macbeth</i> pack. Every paid title uses the same layout.</p>
</section>

<section id="titles">
<h2>The titles</h2>
<p>Seven of the eight are printed in at least one of the ${AP.lists.length} AP Literature free-response question 3 lists from 2023 to 2026: <i>Jane Eyre</i> in six, <i>Frankenstein</i>, <i>Wuthering Heights</i> and <i>The Awakening</i> in five, <i>The Scarlet Letter</i> in four, <i>Macbeth</i> in three and <i>The Great Gatsby</i> in one. <i>Hamlet</i> is in none (<a href="${u('ap-literature/')}">our count</a>).</p>
${titleTable}
<p>Each title also has a free reading guide for teachers: what each check covers, key passages with their references, and three questions from the pack. ${READY.filter((t) => STUDY[t.slug]).map((t) => `<a href="${u(`study/${t.slug}/`)}"><i>${esc(t.title)}</i> reading guide</a>`).join(', ')}.</p>
</section>

<section id="pack">
<h2>What is in a title pack</h2>
${packList}
</section>

<section class="prices" id="prices">
<h2>Prices and licences</h2>
<div class="price-grid">
<div class="price"><h3>One title</h3><p class="amount">${priceTitle}</p><p>Every check of one title.</p><p class="lic">Licence: one teacher, all of your classes.</p><p><a class="btn" href="${u('order/')}" data-mesure="cta_click">Choose a title</a></p></div>
<div class="price main"><h3>All ${TITLES.length} titles</h3><p class="amount">${usd(P.bundle)}</p><p>${SOON.length ? `The ${READY.length} titles ready today now, and ${SOON.map((t) => `<i>${esc(t.title)}</i>`).join(', ').replace(/, ([^,]*)$/, ' and $1')} by e-mail as each one is released (last one ${esc(LAST)}).` : `Every check of all ${TITLES.length} titles (${totalChecks} checks), in one e-mail.`}</p><p class="lic">Licence: one teacher, all of your classes.</p><p><a class="btn" href="${u('order/?item=bundle')}" data-mesure="cta_click">Buy the ${TITLES.length} titles, ${usd(P.bundle)}</a></p></div>
<div class="price"><h3>School licence</h3><p class="amount">${usd(P.school)}</p><p>All titles. Invoice in the school's name.</p><p class="lic">Licence: every teacher in one school, until June 30, 2027.</p><p><a class="btn" href="${u('order/?item=school')}" data-mesure="cta_click">License my school</a></p><p class="small"><a href="${u('quote/')}">Need a quote or a purchase order first?</a></p></div>
</div>
<p class="small">Card payment in US dollars, for buyers in the United States during this launch. No sales tax is added to the price shown. The files arrive by e-mail a few minutes after payment. Full refund within 14 days if they do not suit you (<a href="${u('terms/')}">terms</a>, section 6).</p>
</section>

<section id="method">
<h2>How the checks are made</h2>
<p>The questions are written from the Project Gutenberg text of each book (edition cited on every title page) by Octave, the AI assistant of READ FRANCE. A second, independent pass answers every question from the text before looking at the key, and fixes any item with a wrong key or two defensible answers. A script then checks that every quoted line and every line of evidence appears word for word in the chapter it belongs to. No teacher has reviewed these packs yet. If you find a mistake, write to <a href="mailto:${CONTACT}">${CONTACT}</a>: we fix it and send the corrected files to every buyer of the title.</p>
<p>The checks go through READ FRANCE's reading engine, taken from the question workflow first built for the Vread reading app: a one-word checkpoint per part, and a gate that rewrites any question a study-guide summary is enough to answer. Who does what at READ FRANCE (the founders publish, Octave writes) is on <a href="${ABOUT}">our "who and how" page</a> (in French).</p>
</section>

<section class="faq" id="faq">
<h2>Questions teachers ask</h2>
${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('\n')}
</section>

<section id="end">
<p class="cta"><a class="btn" href="${u('free-sample/')}" data-mesure="cta_click">Download Macbeth, free</a> <a class="textlink" href="${u('order/')}">See prices and order</a></p>
</section>

${vread}`,
});

pages.push({
  path: 'free-sample/',
  title: 'Macbeth act checks: free printable quiz pack with answer key (PDF, Canvas, Google Forms)',
  description: `Five Macbeth act checks, ${FREE.questions} questions, answer key with the line of the play that proves each answer, rubric, Canvas QTI and Google Forms files. Free, no e-mail asked.`,
  lastmod: '2026-10-18',
  crumbs: [['Free Macbeth checks']],
  ld: [{ '@type': 'LearningResource', name: 'Macbeth act checks', url: abs('free-sample/'), author: AUTHOR, publisher: { '@id': ORG['@id'] }, isAccessibleForFree: true, inLanguage: 'en-US', educationalLevel: 'Grades 11-12', learningResourceType: 'Quiz', audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' }, about: { '@type': 'Book', name: 'Macbeth', author: { '@type': 'Person', name: 'William Shakespeare' } } }],
  body: `<p class="eyebrow">Free sample, complete title</p>
<h1><i>Macbeth</i> act checks, free</h1>
<p class="lead">All five acts, ${FREE.questions} questions, with the answer key and rubric. No e-mail asked. Use them in class; please do not repost the files.</p>
<div class="downloads">
<a class="btn" href="${u('sample/macbeth/macbeth-chapter-checks.zip')}" data-mesure="free_download" download>Everything (ZIP)</a>
<ul>
<li><a href="${u('sample/macbeth/macbeth-student-checks.pdf')}" data-mesure="free_download">Student checks (PDF)</a></li>
<li><a href="${u('sample/macbeth/macbeth-answer-key.pdf')}" data-mesure="free_download">Answer key and rubrics (PDF)</a></li>
<li><a href="${u('sample/macbeth/macbeth-qti-1.2.zip')}" data-mesure="free_download">Canvas / Schoology (QTI 1.2 ZIP)</a></li>
<li><a href="${u('sample/macbeth/macbeth-questions.csv')}" data-mesure="free_download">Questions (CSV, for Google Forms and quiz tools)</a></li>
<li><a href="${u('sample/macbeth/make-google-form.gs')}" data-mesure="free_download">Google Forms script</a></li>
</ul>
</div>
<div class="previews">
<a href="${u('sample/macbeth/macbeth-student-checks.pdf')}" data-mesure="free_download"><img src="${u('assets/img/macbeth-student-p1.webp')}" width="480" height="621" loading="lazy" decoding="async" alt="Page 1 of the Macbeth student checks: Act 1 check, reading checkpoint and questions 1 to 5."><span>Student check, page 1</span></a>
<a href="${u('sample/macbeth/macbeth-answer-key.pdf')}" data-mesure="free_download"><img src="${u('assets/img/macbeth-key-p2.webp')}" width="480" height="621" loading="lazy" decoding="async" alt="Page 2 of the Macbeth answer key: Act 1 answers with the skill tested, why each answer is right and the line of the play that proves it."><span>Answer key, page 2</span></a>
</div>
<h2>What is inside</h2>
<p>One check per act, eight questions each: three on details, two on inference, two on a quoted line, and one written answer${FREE.samples.checkpoint ? ', opened by a one-word reading checkpoint' : ''}. ${FREE.samples ? 'From Act 1:' : ''}</p>
${checkpointCard(FREE)}
${FREE.samples.questions.map((q, i) => sampleCard(FREE, q, i === 0 ? 1 : 6)).join('')}
<h2>Import it</h2>
<ol>
<li><b>Canvas:</b> Course › Settings › Import Course Content › "QTI .zip file" › macbeth-qti-1.2.zip. Each act becomes a quiz; the written answer is an essay question you grade with the rubric.</li>
<li><b>Google Forms:</b> import the CSV into Google Sheets, open Extensions › Apps Script, paste the script, run <code>createQuizzes</code>. One self-grading quiz per act appears in your Drive.</li>
<li><b>Schoology:</b> it accepts QTI 1.2 files in a question bank. We have not tried it in a live Schoology course yet; tell us if it fails.</li>
</ol>
<p>Text used: Project Gutenberg eBook #1533 (<a href="https://www.gutenberg.org/ebooks/1533" rel="noopener">gutenberg.org/ebooks/1533</a>). Act and scene numbering follows that text.</p>
<p>Planning the unit? The free <a href="${u('study/macbeth/')}"><i>Macbeth</i> reading guide</a> lists what each act check covers, with key passages and their act and scene.</p>
<h2>The same checks for the other titles</h2>
<p>Every paid title has the same layout, files and rubric. Each title page shows its list of checks, its reading checkpoint and two questions; each reading guide shows three more.</p>
<ul class="related">${PAID.map((t) => `<li><a href="${u(`titles/${t.slug}/`)}"><i>${esc(t.title)}</i> chapter checks</a>${STUDY[t.slug] ? ` · <a href="${u(`study/${t.slug}/`)}">reading guide</a>` : ''}</li>`).join('')}</ul>
<p><a class="btn" href="${u('order/')}" data-mesure="cta_click">Get another title, ${priceTitle}</a></p>
${vread}`,
});

for (const t of TITLES) {
  const ready = t.status === 'ready';
  const pd = t.pd_strict
    ? `${esc(t.author)} died in ${t.author_died} and the work was first published in ${esc(t.first_published)}: public domain in the United States, and under the stricter rule we apply for sales abroad (author dead before 1925).`
    : `${esc(t.author)} died in ${t.author_died} and the book was published in ${esc(t.first_published)}: public domain in the United States since January 1, 2021. Because the author died after 1925, we sell this title to US buyers only.`;
  const buy = t.free
    ? `<p><a class="btn" href="${u('free-sample/')}" data-mesure="cta_click">Download free</a></p>`
    : ready
      ? `<p><a class="btn" href="${u(`order/?item=${t.slug}`)}" data-mesure="cta_click">Buy ${esc(t.title)}, ${priceTitle}</a> <a class="textlink" href="${u('order/?item=bundle')}">or all ${TITLES.length} titles for ${usd(P.bundle)}</a></p>`
      : `<p>Release date: <b>${esc(longDate(t.release))}</b>. It is included in the <a href="${u('order/?item=bundle')}">${TITLES.length}-title set (${usd(P.bundle)})</a> and the school licence: buyers receive it by e-mail on that date.</p>`;
  const ld = ready && !t.free
    ? [{ '@type': 'Product', name: `${fullTitle(t)} chapter checks`, description: `${t.checks.length} printable checks, ${t.questions} questions, answer key and rubric, Canvas QTI and Google Forms files.`, brand: { '@type': 'Brand', name: 'Chapter Checks by READ FRANCE' },
        offers: { '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: (P.p5 / 100).toFixed(2), highPrice: (P.p7 / 100).toFixed(2), offerCount: 2, availability: 'https://schema.org/InStock', eligibleRegion: { '@type': 'Country', name: 'US' }, url: abs(`order/?item=${t.slug}`) } }]
    : [{ '@type': 'LearningResource', name: `${fullTitle(t)} ${isPlay(t) ? 'act' : 'chapter'} checks`, url: abs(`titles/${t.slug}/`), author: AUTHOR, publisher: { '@id': ORG['@id'] }, isAccessibleForFree: !!t.free, inLanguage: 'en-US', educationalLevel: 'Grades 11-12', learningResourceType: 'Quiz', about: { '@type': 'Book', name: t.title, author: { '@type': 'Person', name: t.author } } }];
  pages.push({
    path: `titles/${t.slug}/`,
    title: `${fullTitle(t)} chapter quizzes with answer key: printable and LMS-ready checks`,
    description: ready
      ? `${t.checks.length} ${isPlay(t) ? 'act' : 'chapter'} checks on ${fullTitle(t)} by ${t.author}, ${t.questions} questions, answer key with text evidence, rubric, Canvas QTI and Google Forms.${t.free ? ' Free.' : ''}`
      : `${fullTitle(t)} by ${t.author}: chapter checks with answer key and rubric, coming ${longDate(t.release)}. Included in the ${TITLES.length}-title set.`,
    ld,
    crumbs: [[`${t.title} checks`]],
    body: `<p class="eyebrow">${esc(t.author)} · ${ready ? (t.free ? 'free' : 'ready') : 'coming ' + esc(longDate(t.release))}</p>
<h1><i>${esc(t.title)}</i>${t.subtitle ? ` (${esc(t.subtitle)})` : ''}: ${isPlay(t) ? 'act' : 'chapter'} checks</h1>
${ready ? `<p class="lead">${t.checks.length} checks, ${t.questions} questions, answer key with the line of the text behind each answer, and a rubric for each written answer.</p>
${buy}
<h2>Checks</h2>
<ol class="checks">${t.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
<h2>${t.samples.checkpoint ? 'The reading checkpoint and two questions' : 'Two questions'} from ${esc(t.samples.check)}</h2>
${checkpointCard(t)}
${t.samples.questions.map((q, i) => sampleCard(t, q, i + 1)).join('')}` : `<p class="lead">Checks for ${esc(t.checks_planned)}, with answer key and rubric, in the same format as the titles that are ready.</p>
${buy}`}
<h2>What you get</h2>
${packList}
<h2>Edition and public-domain status</h2>
<p>Text used: Project Gutenberg eBook #${t.gutenberg} (<a href="https://www.gutenberg.org/ebooks/${t.gutenberg}" rel="noopener">gutenberg.org/ebooks/${t.gutenberg}</a>). ${pd} Questions refer to ${isPlay(t) ? 'acts and scenes' : 'chapters'}, not pages.</p>
${t.slug === 'frankenstein-1831' ? '<p>This is the revised 1831 text, the one most school editions print. Some classes read the 1818 text, which differs in places (for example, Elizabeth is Victor\'s cousin in 1818 and an adopted orphan in 1831).</p>' : ''}
${STUDY[t.slug] ? `<p>Planning the unit? The free <a href="${u(`study/${t.slug}/`)}">${esc(t.title)} reading guide</a> lists what each check covers, with key passages and their references.</p>\n` : ''}${t.free ? '' : `<p>Want to see a whole pack first? The <a href="${u('free-sample/')}"><i>Macbeth</i> act checks are free</a>, in the same format: student PDF, answer key, rubric, Canvas and Google Forms files.</p>\n`}<p><a href="${u('')}#titles">All ${TITLES.length} Chapter Checks titles</a></p>`,
    lastmod: '2026-10-18',
  });
}

const apCount = (slug) => apLists(slug).length;
const apOrder = READY.slice().sort((a, b) => apCount(b.slug) - apCount(a.slug));
pages.push({
  path: 'ap-literature/',
  lastmod: '2026-10-17',
  crumbs: [['AP Literature question 3 titles']],
  title: 'AP Literature question 3 titles that are in the public domain',
  description: `Which public-domain titles the College Board printed in the ${AP.lists.length} AP English Literature free-response question 3 lists, 2023 to 2026, how often, and checks for each.`,
  ld: [{ '@type': 'Article', headline: 'AP Literature question 3 titles that are in the public domain', author: AUTHOR, publisher: { '@id': ORG['@id'] }, datePublished: '2026-10-14', dateModified: '2026-10-17', inLanguage: 'en-US' }],
  body: `<p class="eyebrow">AP® English Literature</p>
<h1>The public-domain titles that keep coming back in question 3</h1>
<p class="lead">The College Board publishes no AP Literature reading list: the course description says teachers choose their texts locally. But each year the free-response question 3 prints a list of works students may write about, between ${Math.min(...AP.lists.map((l) => l.count))} and ${Math.max(...AP.lists.map((l) => l.count))} titles a list from 2023 to 2026.</p>
<p>We counted the ${AP.lists.length} lists published for 2023 to 2026 (two sets a year from 2023 to 2025, one set so far for 2026). Our eight titles appear this often:</p>
<div class="table-wrap"><table class="titles"><thead><tr><th scope="col">Title</th><th scope="col">Lists (of ${AP.lists.length})</th><th scope="col">Which</th></tr></thead><tbody>
${apOrder.map((t) => `<tr><td><a href="${u(`study/${t.slug}/`)}"><i>${esc(t.title)}</i></a>, ${esc(t.author)}</td><td>${apCount(t.slug)}</td><td>${apLists(t.slug).map(apName).join(', ') || 'none'}</td></tr>`).join('\n')}
</tbody></table></div>
<p><i>Jane Eyre</i>, <i>Frankenstein</i>, <i>Wuthering Heights</i> and <i>The Awakening</i> are the public-domain novels printed most often. Three other works appear five times (<i>Kindred</i>, <i>Ceremony</i>, <i>Fences</i>), but they are in copyright, so we make no checks for them. Every prompt also lets students choose a work "from your own reading", so a title missing from the lists, like <i>Hamlet</i>, can still be used.</p>
<h2>The ${AP.lists.length} lists</h2>
<div class="table-wrap"><table class="titles"><thead><tr><th scope="col">Exam</th><th scope="col">Prompt, in our words</th><th scope="col">Works listed</th></tr></thead><tbody>
${AP.lists.map((l) => `<tr><td><a href="${l.url}" rel="noopener">${apName(l)}</a></td><td>${esc(l.topic)}</td><td>${l.count}</td></tr>`).join('\n')}
</tbody></table></div>
<p class="small">Count by READ FRANCE from the College Board's free-response PDFs, linked from its <a href="${AP.page}" rel="noopener">past exam questions page</a>; each list read again on October 17, 2026. The prompt summaries are ours, not the College Board's wording.</p>
<h2>Checks for these titles</h2>
${titleTable}
<p>Checks test the reading, chapter by chapter. They are not essay prompts and do not reuse any College Board material.</p>`,
});

// Study pages (reading guides for teachers) -------------------------------------------------------------------
const itl = (s) => esc(s).replace(/_([^_]+)_/g, '<i>$1</i>');
const verse = (q) => itl(q).split(' / ').join('<br>');
const num = (n) => n.toLocaleString('en-US');
function studyCard(t, q, n) {
  const opts = q.options.map((o, i) => `<li${'ABCD'[i] === q.answer ? ' class="key"' : ''}><span class="L">${'ABCD'[i]}</span> ${esc(o)}</li>`).join('');
  return `<figure class="qcard">
<figcaption>${esc(t.title)} · ${esc(q.check)} · ${q.skill === 'close' ? 'close reading' : q.skill}</figcaption>
<p class="stem"><span class="n">${n}.</span> ${esc(q.stem)}</p>${q.quote ? `<blockquote>“${esc(q.quote)}”</blockquote>` : ''}
<ol class="opts">${opts}</ol>
<details><summary>Answer key and evidence</summary><p><span class="n">${q.answer}.</span> ${esc(q.why)}</p>${q.evidence.map((e) => `<p class="ev">“${esc(e)}” <span class="muted">(${esc(q.check)})</span></p>`).join('')}</details>
</figure>`;
}
const studyed = READY.filter((t) => STUDY[t.slug]);
for (const t of studyed) {
  const st = STUDY[t.slug];
  const play = isPlay(t);
  const unit = play ? 'act' : 'chapter';
  const words = st.checks.reduce((a, c) => a + c.words, 0);
  const lists = apLists(t.slug);
  const cta = t.free
    ? `<p><a class="btn" href="${u('free-sample/')}" data-mesure="cta_click">Download the ${esc(t.title)} checks, free</a></p>`
    : `<p><a class="btn" href="${u(`order/?item=${t.slug}`)}" data-mesure="cta_click">Buy the ${esc(t.title)} checks, ${priceTitle}</a></p>`;
  const ap = lists.length
    ? `<p><i>${esc(t.title)}</i> is printed in ${lists.length} of the ${AP.lists.length} question-3 lists the College Board published for 2023 to 2026:</p>
<ul>${lists.map((l) => `<li><a href="${l.url}" rel="noopener">${apName(l)}</a>: ${esc(l.topic)} (${l.count} works listed).</li>`).join('')}</ul>
<p>The lists are suggestions: each prompt asks students to choose a work "from your own reading or from the list". A title on the list is one the College Board considers a fit for that year's prompt, nothing more.</p>`
    : `<p><i>${esc(t.title)}</i> is not printed in any of the ${AP.lists.length} question-3 lists the College Board published for 2023 to 2026 (we read each list on October 17, 2026). Students may still write about it: every prompt asks for a work "from your own reading or from the list".</p>`;
  const related = studyed.filter((x) => x.slug !== t.slug);
  pages.push({
    path: `study/${t.slug}/`,
    lastmod: st.updated,
    title: `${fullTitle(t)} reading guide: comprehension questions by ${unit}, key passages, AP Lit`,
    description: `${t.title} ${play ? 'act by act' : 'chapter by chapter'} for teachers: what each of the ${st.checks.length} reading checks covers, ${st.passages.length} key passages with references, 3 sample questions with key, and the AP Lit question 3 lists.`,
    crumbs: [[`${t.title} checks`, `titles/${t.slug}/`], ['Reading guide']],
    ld: [{ '@type': 'Article', headline: `${fullTitle(t)} reading guide for teachers`, author: AUTHOR, publisher: { '@id': ORG['@id'] }, datePublished: st.updated, dateModified: st.updated, inLanguage: 'en-US',
      mainEntityOfPage: abs(`study/${t.slug}/`), about: { '@type': 'Book', name: t.title, author: { '@type': 'Person', name: t.author } }, educationalLevel: 'Grades 11-12', isAccessibleForFree: true },
      ],
    body: `<p class="eyebrow">${esc(t.author)} · reading guide for teachers</p>
<h1><i>${esc(t.title)}</i>${t.subtitle ? ` (${esc(t.subtitle)})` : ''}: comprehension ${play ? 'act by act' : 'chapter by chapter'}</h1>
<p class="lead">${play ? `Five acts, ${num(words)} words` : `${num(words)} words`} in the Project Gutenberg text, cut into ${st.checks.length} reading checks. This page lists what each check covers, ${st.passages.length} key passages with their ${play ? 'act and scene' : 'chapter'}, three questions from the pack with the answer key, and where <i>${esc(t.title)}</i> stands in the AP Literature question 3 lists.</p>
<p class="small">Written by Octave, READ FRANCE's AI assistant, from Project Gutenberg eBook #${t.gutenberg}; published ${esc(longDate(st.updated))}. Names and events were checked against the text; no teacher has reviewed this page yet. Corrections: <a href="mailto:${CONTACT}">${CONTACT}</a>. ${WHO}.</p>
${st.about.map((p) => `<p>${itl(p)}</p>`).join('\n')}

<h2>What each check covers</h2>
<div class="table-wrap"><table class="titles units"><thead><tr><th scope="col">Check</th><th scope="col">Words</th><th scope="col">What happens</th></tr></thead><tbody>
${st.checks.map((c) => `<tr><td>${esc(c.label)}</td><td>${num(c.words)}</td><td>${esc(c.overview)}</td></tr>`).join('\n')}
</tbody></table></div>
<p class="small">Word counts: our count of the Project Gutenberg text, without its header and licence. A check takes 10 to 15 minutes in class and opens with a one-word reading checkpoint on a detail from the middle of the ${play ? 'act' : 'chapters'}.</p>

<h2>Key passages, with references</h2>
${st.passages.map((p) => `<figure class="passage"><blockquote>${verse(p.quote)}</blockquote><figcaption><b>${esc(p.ref)}</b> · ${esc(p.speaker)}</figcaption><p>${esc(p.note)}</p></figure>`).join('\n')}
<p class="small">Quotations are copied from the Project Gutenberg text${play ? '; line breaks follow its verse lines' : ''}. Our script checks that each one appears word for word in the ${unit} it is credited to.</p>

<h2>Three questions from the ${esc(t.title)} pack</h2>
<p>One from the start of the ${play ? 'play' : 'book'}, one from the middle, one from the end, exactly as they appear in the pack, with the key and the line of the text behind it.</p>
${st.samples.map((q, i) => studyCard(t, q, i + 1)).join('\n')}
<p>Why a summary does not pass them: before release, every question in the pack was put to a separate AI reader that held only a study-guide summary of the ${play ? 'act (about 300 words)' : 'chapters (about 150 words a chapter)'}, longer than the overview above. A question that reader could answer was rewritten. Final count for <i>${esc(t.title)}</i>: ${st.qa.pass} of ${st.qa.items} questions passed${st.qa.partial ? `, and ${st.qa.partial} written ${st.qa.partial > 1 ? 'answers' : 'answer'} still earned half marks from the summary alone` : ''}.</p>

<h2>${esc(t.title)} and AP Literature question 3</h2>
${ap}
<p><a href="${u('ap-literature/')}">All ${AP.lists.length} lists and our count</a>.</p>

<section class="buy-box">
<h2>${t.free ? 'The whole pack is free' : 'The whole pack'}</h2>
<p>${st.checks.length} checks, ${t.questions} questions, a one-word reading checkpoint per check, an answer key with the line of the text behind each answer, a 2-1-0 rubric for the written answers, and Canvas QTI, CSV and Google Forms files.${t.free ? ' No e-mail asked.' : ' Card payment in US dollars, files by e-mail within minutes, refund within 14 days.'}</p>
${cta}
</section>

<h2>Other reading guides</h2>
<ul class="related">${related.map((x) => `<li><a href="${u(`study/${x.slug}/`)}"><i>${esc(x.title)}</i></a>, ${esc(x.author)}</li>`).join('')}</ul>
<p><a href="${u(`titles/${t.slug}/`)}">${esc(t.title)} checks: the list of checks and two more sample questions</a>${t.free ? '' : ` · <a href="${u('free-sample/')}">the free <i>Macbeth</i> pack, to see a whole pack first</a>`} · <a href="${u('')}">Chapter Checks: reading checks for ${TITLES.length} AP Literature classics</a></p>`,
  });
}

const traps = [
  ['<i>As I Lay Dying</i> (Faulkner, d. 1962), <i>The Sun Also Rises</i> (Hemingway, d. 1961), <i>Passing</i> (Larsen, d. 1964), <i>The Waste Land</i> (Eliot, d. 1965)', 'Public domain in the US (published before 1931), not in the UK or the EU.'],
  ['<i>1984</i> and <i>Animal Farm</i> (Orwell, d. 1950)', 'Public domain in the UK and the EU, not in the US (published 1949 and 1945).'],
  ['<i>Their Eyes Were Watching God</i>, <i>Kindred</i>, <i>Ceremony</i>, <i>Fences</i>, <i>The Crucible</i>, <i>Of Mice and Men</i>', 'In copyright.'],
  ['<i>The Metamorphosis</i>', 'Kafka is in the public domain, but the usual English translations (1933 and later) are not.'],
];
pages.push({
  path: 'sources/',
  crumbs: [['Sources']],
  title: 'Sources and public-domain status of the Chapter Checks titles',
  description: 'The edition used for each title, the author and publication dates, and why each work is in the public domain in the United States.',
  body: `<h1>Sources and public-domain status</h1>
<p class="lead">Our rule: a work is in the public domain in the United States when it was first published before 1931 (as of January 1, 2026). For any sale outside the US we add a stricter test: the author died before 1925 and no translator is involved. During this launch, we sell to US buyers only.</p>
<div class="table-wrap"><table class="titles"><thead><tr><th scope="col">Title</th><th scope="col">Author died</th><th scope="col">First published</th><th scope="col">US</th><th scope="col">Stricter rule</th><th scope="col">Text used</th></tr></thead><tbody>
${TITLES.map((t) => `<tr><td><i>${esc(fullTitle(t))}</i></td><td>${t.author_died}</td><td>${esc(t.first_published)}</td><td>Yes</td><td>${t.pd_strict ? 'Yes' : 'No (US only)'}</td><td><a href="https://www.gutenberg.org/ebooks/${t.gutenberg}" rel="noopener">Project Gutenberg #${t.gutenberg}</a></td></tr>`).join('\n')}
</tbody></table></div>
<p>We work from the plain-text Project Gutenberg file of each book, with the Project Gutenberg header, licence and footer removed. We do not redistribute the texts: the checks quote short lines only. Project Gutenberg is not involved in, and does not endorse, this product.</p>
<p>Legal sources: the US term for works published before 1931 (<a href="https://cspd.law.duke.edu/publicdomainday/2026" rel="noopener">Duke Center for the Study of the Public Domain</a>, <a href="https://guides.library.cornell.edu/copyright/publicdomain" rel="noopener">Cornell University Library</a>); life plus 70 years in the UK (CDPA s.12) and the EU.</p>
<h2>Titles we leave out, and why</h2>
<ul>${traps.map(([a, b]) => `<li>${a}: ${b}</li>`).join('')}</ul>
<h2>Trademarks</h2>
<p>AP® and Advanced Placement® are trademarks registered by the College Board, which is not affiliated with, and does not endorse, Chapter Checks. We use them only to name the course.</p>`,
});

// Order page --------------------------------------------------------------------------------------------------
const items = [
  ...PAID.map((t) => ({ id: t.slug, label: `${fullTitle(t)}: ${t.checks.length} checks`, kind: 'title', products: t.products })),
  { id: 'bundle', label: SOON.length ? `All ${TITLES.length} titles (${READY.length} now, ${SOON.length} by ${LAST})` : `All ${TITLES.length} titles`, kind: 'bundle', product: CAT.products.bundle, amount: P.bundle },
  { id: 'school', label: `School licence: all titles, every teacher in one school, until June 30, 2027`, kind: 'school', product: CAT.products.school, amount: P.school },
];
const orderCfg = { venture: VENTURE, prices: P, items: items.map((i) => ({ id: i.id, kind: i.kind, products: i.products, product: i.product, amount: i.amount })),
  ...(OG_ENDPOINT ? { endpoint: OG_ENDPOINT, publishableKey: OG_PK } : {}) };
pages.push({
  path: 'order/',
  title: 'Order Chapter Checks: one title, all titles or a school licence',
  lastmod: '2026-10-18',
  crumbs: [['Order']],
  description: `One title ${usd(P.p5)}, all ${TITLES.length} titles ${usd(P.bundle)}, school licence ${usd(P.school)}. Card payment in USD; files by e-mail within minutes.`,
  checkout: true,
  ld: [{ '@type': 'Product', name: `Chapter Checks, all ${TITLES.length} titles`, brand: { '@type': 'Brand', name: 'Chapter Checks by READ FRANCE' }, offers: { '@type': 'Offer', price: (P.bundle / 100).toFixed(2), priceCurrency: 'USD', availability: 'https://schema.org/InStock', eligibleRegion: { '@type': 'Country', name: 'US' }, url: abs('order/?item=bundle') } },
    { '@type': 'Product', name: 'Chapter Checks school licence', brand: { '@type': 'Brand', name: 'Chapter Checks by READ FRANCE' }, offers: { '@type': 'Offer', price: (P.school / 100).toFixed(2), priceCurrency: 'USD', availability: 'https://schema.org/InStock', eligibleRegion: { '@type': 'Country', name: 'US' }, url: abs('order/?item=school') } }],
  body: `<h1>Order chapter checks: one title, all ${TITLES.length}, or your whole school</h1>
<p class="lead">Pick what you need. You pay by card, in US dollars, and the files arrive by e-mail a few minutes later with your receipt: student PDF, answer key and rubric, Canvas QTI ZIP, CSV and the Google Forms script for each title.</p>
<form id="choose" class="choose" aria-label="What you are buying">
<fieldset><legend>One title, ${priceTitle} <span class="muted">· licence: one teacher, all of your classes</span></legend>
${PAID.map((t) => `<label><input type="radio" name="item" value="${t.slug}"> <i>${esc(fullTitle(t))}</i> <span class="muted">${t.checks.length} checks, ${t.questions} questions</span></label>`).join('\n')}
</fieldset>
<fieldset><legend>More than one title</legend>
<p class="muted lic">The set is for one teacher. The school licence covers every teacher in one school.</p>
<label><input type="radio" name="item" value="bundle"> All ${TITLES.length} titles, <b>${usd(P.bundle)}</b> <span class="muted">${SOON.length ? `${READY.length} now (${READY.map((t) => esc(t.title)).join(', ')}), then ${SOON.map((t) => `${esc(t.title)} on ${esc(longDate(t.release))}`).join(', ')}` : `${READY.map((t) => esc(t.title)).join(', ')}: ${totalChecks} checks, all delivered at once`}</span></label>
<label><input type="radio" name="item" value="school"> School licence, <b>${usd(P.school)}</b> <span class="muted">all titles for every English teacher in one school until June 30, 2027; tick "I am buying for a company" and enter the school's name for the invoice</span></label>
</fieldset>
</form>
<p id="picked" class="picked" aria-live="polite"></p>
<div id="buy"></div>
<div class="small">
<p>For teachers and schools in the United States. By paying you accept the <a href="${u('terms/')}">terms</a> (version ${TERMS_VERSION}). Full refund within 14 days: reply to the delivery e-mail. No sales tax is added to the price shown.</p>
<p>Buying for a school that needs a quote or a purchase order first? <a href="${u('quote/')}">Build a printable quote</a>.</p>
</div>
<section class="order-notes" id="before-you-pay">
<h2>Before you pay</h2>
<div class="previews small-previews">
<a href="${u('sample/macbeth/macbeth-student-checks.pdf')}" data-mesure="free_download"><img src="${u('assets/img/macbeth-student-p1.webp')}" width="480" height="621" loading="lazy" decoding="async" alt="Page 1 of the Macbeth student checks."><span>Student check, page 1</span></a>
<a href="${u('sample/macbeth/macbeth-answer-key.pdf')}" data-mesure="free_download"><img src="${u('assets/img/macbeth-key-p2.webp')}" width="480" height="621" loading="lazy" decoding="async" alt="Page 2 of the Macbeth answer key."><span>Answer key, page 2</span></a>
</div>
<p>Every title uses this layout. The whole <i>Macbeth</i> pack is <a href="${u('free-sample/')}">free to download</a>, and ${apListed} of the ${READY.length} titles are printed in the College Board's AP Lit question 3 lists, 2023–2026 (<a href="${u('ap-literature/')}">our count</a>).</p>
<details><summary>Who may use the files?</summary><p>A title or the ${TITLES.length}-title set: one teacher, in all of their classes, on paper and in their own LMS courses. The school licence: every teacher of the school named on the invoice, until June 30, 2027. Posting the files publicly is not allowed (<a href="${u('terms/')}">terms</a>, section 3).</p></details>
<details><summary>What if a question is wrong?</summary><p>Tell us at <a href="mailto:${CONTACT}">${CONTACT}</a>. We fix it and send the corrected files to every buyer of the title.</p></details>
<details><summary>Can I get an invoice in the school's name?</summary><p>Yes: tick "I am buying for a company" and enter the school's name. The invoice comes with the files. Payment on a purchase order with net-30 terms is not available yet; the <a href="${u('quote/')}">quote page</a> explains what we can do.</p></details>
<p class="small">The questions are written by Octave, READ FRANCE's AI assistant, from the Project Gutenberg text, then answered again from the text by a second pass and checked word for word by a script. ${WHO}.</p>
</section>
<script type="application/json" id="order-config">${JSON.stringify(orderCfg).replace(/</g, '\\u003c')}</script>`,
  scripts: `<script src="${u(`og-checkout.js?v=${OG_VERSION}`)}"></script>\n<script src="${u('assets/order.js')}"></script>\n`,
});

// Quote page: a printable quote built in the browser (assets/quote.js); nothing typed is sent anywhere.
const quoteCfg = { contact: CONTACT, orderUrl: abs('order/'), titles: TITLES.length, items: {
  school: { label: `Chapter Checks school licence: all ${TITLES.length} titles (${totalChecks} checks), every teacher of the school named on the invoice, until June 30, 2027`, amount: P.school, max: 1 },
  bundle: { label: `Chapter Checks, all ${TITLES.length} titles (${totalChecks} checks): licence for one teacher, all of their classes`, amount: P.bundle, max: 8 } } };
pages.push({
  path: 'quote/',
  lastmod: '2026-10-18',
  crumbs: [['Quote or purchase order']],
  title: 'Chapter Checks quote for schools: printable quote and purchase order information',
  description: `Build a printable quote for the Chapter Checks school licence (${usd(P.school)}) or the ${TITLES.length}-title set (${usd(P.bundle)} per teacher), with READ FRANCE's details, for your business office.`,
  ld: [{ '@type': 'WebPage', name: 'Chapter Checks quote for schools', url: abs('quote/'), publisher: { '@id': ORG['@id'] }, inLanguage: 'en-US' }],
  body: `<p class="eyebrow">For schools and districts</p>
<h1>Get a printable quote for your school</h1>
<p class="lead">Your business office needs a quote before it can buy? Fill in the form: this page builds a quote with our company details that you can print or save as a PDF, and prepares an e-mail to us. Nothing you type here is sent to us unless you send that e-mail yourself.</p>
<form id="quote-form" class="choose quote-form" aria-label="Quote details">
<fieldset><legend>What the school buys</legend>
<label><input type="radio" name="item" value="school" checked> School licence, <b>${usd(P.school)}</b> <span class="muted">all titles, every teacher in one school, until June 30, 2027</span></label>
<label><input type="radio" name="item" value="bundle"> All ${TITLES.length} titles for named teachers, <b>${usd(P.bundle)} per teacher</b> <span class="muted">one licence per teacher; for 9 teachers or more the school licence costs less</span></label>
<label class="qty">Number of teachers <input type="number" name="qty" min="1" max="8" value="1" inputmode="numeric"></label>
</fieldset>
<fieldset><legend>Who the quote is for</legend>
<label>School or district name <input type="text" name="school" required maxlength="120" autocomplete="organization"></label>
<label>Your name <input type="text" name="name" required maxlength="80" autocomplete="name"></label>
<label>Your school e-mail <input type="email" name="email" required maxlength="120" autocomplete="email"></label>
<label>Billing address <span class="muted">(optional)</span> <textarea name="address" rows="3" maxlength="300" autocomplete="street-address"></textarea></label>
<label>Purchase order number <span class="muted">(optional, if you already have one)</span> <input type="text" name="po" maxlength="40"></label>
</fieldset>
<p><button class="btn" type="submit">Build the quote</button></p>
</form>
<section id="quote-doc" class="quote-doc" hidden aria-live="polite"></section>
<section id="how-to-pay">
<h2>How the school pays</h2>
<ul>
<li><b>Card, on the <a href="${u('order/')}">order page</a>.</b> A school purchasing card works. Tick "I am buying for a company" and enter the school's name: the invoice is made out to the school and arrives with the files, usually within minutes.</li>
<li><b>Purchase order on net-30 terms, check or bank transfer: not available yet.</b> If your school can only pay against a purchase order, e-mail it to <a href="mailto:${CONTACT}">${CONTACT}</a> with this quote, and we will tell you whether we can accept it before you commit to anything.</li>
<li><b>Tax.</b> No French VAT: the files are electronically supplied services to a buyer established outside the European Union (French tax code, art. 259-1°). We do not collect US sales tax.</li>
<li><b>Refund.</b> Full refund within 14 days of delivery, no reason needed (<a href="${u('terms/')}">terms</a>, section 6).</li>
</ul>
<p>Want to look at the material with colleagues first? The <a href="${u('free-sample/')}"><i>Macbeth</i> pack is free</a> and complete, and each <a href="${u('')}#titles">title page</a> shows two of its questions.</p>
</section>
<script type="application/json" id="quote-config">${JSON.stringify(quoteCfg).replace(/</g, '\\u003c')}</script>`,
  scripts: `<script src="${u('assets/quote.js')}"></script>\n`,
});

pages.push({
  path: 'terms/',
  crumbs: [['Terms']],
  title: 'Terms of sale and legal notice: Chapter Checks by READ FRANCE',
  description: 'Terms of sale for Chapter Checks (teachers and schools in the United States): licence, delivery, refunds, taxes, liability, and the legal notice.',
  body: `<h1>Terms of sale and legal notice</h1>
<p class="small">Version ${TERMS_VERSION}, updated ${UPDATED}.</p>
<h2>1. Who sells, and to whom</h2>
<p>Chapter Checks is sold by READ FRANCE SAS, a French simplified joint-stock company with a share capital of €1,000, registered in Paris under number 988 741 773 (RCS Paris), 11 rue Rouvet, 75019 Paris, France. Contact: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
<p>We sell to teachers, schools and school districts in the United States who buy for their teaching. By ordering, you confirm that you buy for professional use. Other countries are not served during this launch.</p>
<h2>2. What you buy</h2>
<p>Digital files: printable PDFs, an answer key, a CSV and a QTI 1.2 package for each title, as described on the order page. Titles marked with a release date are delivered by e-mail on or before that date to buyers of the ${TITLES.length}-title set and of the school licence. If a title is more than 14 days late, you can ask for a full refund and keep the files already received.</p>
<h2>3. Licence</h2>
<ul>
<li><b>Title pack and ${TITLES.length}-title set:</b> one teacher may print and copy the checks for their own students without limit, in any number of classes, and upload them to their own LMS courses or Google account, with access limited to their students.</li>
<li><b>School licence:</b> the same rights for every teacher of the one school named on the invoice, until June 30, 2027.</li>
<li><b>Not allowed:</b> posting the files or answer keys on a public website or a marketplace, sharing them outside the licence, reselling them, or using them to train or test AI models.</li>
</ul>
<p>The literary works are in the public domain; the questions, keys and rubrics are © 2026 READ FRANCE SAS.</p>
<h2>4. Price, payment, receipt</h2>
<p>Prices are in US dollars and are shown on the order page before payment. Payment is by card, processed by Stripe for READ FRANCE SAS. You receive a receipt, or an invoice when you give a school or company name, numbered G-YYYY-NNNN. No French VAT applies: these are electronically supplied services to a buyer established outside the European Union (French tax code, art. 259 B, or art. 259-1° for a business or institution). We do not collect US sales tax; any use tax due by the buyer is the buyer's.</p>
<h2>5. Delivery</h2>
<p>The files are attached to an e-mail sent to the address you give, usually within minutes, and at the latest within one hour. If nothing arrives, check your spam folder, then write to us.</p>
<h2>6. Refunds and corrections</h2>
<p>If the files do not suit you, reply to the delivery e-mail within 14 days for a full refund; no reason needed. If you find a mistake in a question or a key, tell us: we correct it and send the new files to every buyer of the title.</p>
<h2>7. Liability</h2>
<p>The checks are teaching material. You remain in charge of how you use them and of the grades you give. Our total liability for an order is limited to the amount paid for it, except where the law does not allow such a limit.</p>
<h2>8. Personal data</h2>
<p>See the <a href="${u('privacy/')}">privacy page</a>. We never receive student data.</p>
<h2>9. Law and disputes</h2>
<p>These terms are governed by French law. Before any claim, write to us so we can try to settle it. Failing that, the courts of Paris have jurisdiction, unless a mandatory rule of your state says otherwise.</p>
<h2>10. Not affiliated</h2>
<p>Chapter Checks is not affiliated with the College Board, Project Gutenberg or any publisher. AP® is a trademark registered by the College Board.</p>
<h2>Legal notice</h2>
<p>Publisher: READ FRANCE SAS, 11 rue Rouvet, 75019 Paris, France; RCS Paris 988 741 773; publication director: the company's president. Host: GitHub Pages, GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA. Payment: Stripe Payments Europe, Ltd. Order e-mails and receipts: Google Workspace services of READ FRANCE.</p>`,
});

pages.push({
  path: 'privacy/',
  crumbs: [['Privacy']],
  title: 'Privacy: Chapter Checks by READ FRANCE',
  description: 'What Chapter Checks collects: buyer details for orders, aggregate visit counts without cookies, and no student data.',
  body: `<h1>Privacy</h1>
<p class="small">Updated ${UPDATED}. Controller: READ FRANCE SAS, 11 rue Rouvet, 75019 Paris, France, <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
<h2>No student data</h2>
<p>Chapter Checks has no student accounts and receives nothing from your students. The checks are used on paper, in your LMS or in your own Google account. When you run the Google Forms script, it works inside your account and sends nothing to us.</p>
<h2>When you buy</h2>
<p>We receive your e-mail address, name, country and, if you give them, your school or company name and tax ID. Stripe receives your card details directly; we never see them. We use these details to deliver the files, send the receipt or invoice, answer you and handle refunds. They are kept in our order register (Google Sheets) and in Stripe for 10 years, as French accounting law requires. Legal basis: performing the sale and our accounting obligations.</p>
<h2>Visit counts, without cookies</h2>
<p>We count visits in aggregate: page viewed, site that sent the visitor, mobile or desktop, clicks on buttons, downloads, how far a page is scrolled, and which price variant a browser tab was shown. Each count is added to a daily total. We set no cookie, store no IP address and use no identifier, so no visitor can be followed from one page or day to the next. Nothing is counted when your browser sends Do Not Track or Global Privacy Control. The price variant is kept in your browser's session storage until you close the tab.</p>
<p>The payment form also counts, in aggregate, how many times it was opened and started, with the same rules.</p>
<h2>Who processes data for us</h2>
<p>Stripe (payment), Google (order register, e-mails, the counting script), GitHub (hosting of this site, which may keep technical logs). We do not sell or share personal information, and we show no ads.</p>
<h2>Your rights</h2>
<p>You can ask to see, correct or delete your data, or object to a use of it, by writing to <a href="mailto:${CONTACT}">${CONTACT}</a>. We answer within one month. Data we must keep for accounting is kept until the legal period ends. You may also complain to the French data protection authority (CNIL, cnil.fr). California residents: we do not sell or share personal information as defined by the CCPA.</p>`,
});

pages.push({
  path: '404.html',
  title: 'Page not found: Chapter Checks',
  description: 'This page does not exist. The Chapter Checks titles, the free Macbeth checks and the prices are one click away.',
  noindex: true,
  body: `<h1>Page not found</h1><p><a href="${u('')}">Back to the titles</a>.</p>`,
});

// ------------------------------------------------------------------------------------------------------------
// Write
// ------------------------------------------------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const pg of pages) write(pg.path, layout(pg));
cpSync(join(ROOT, 'src/assets'), join(OUT, 'assets'), { recursive: true });
cpSync(join(ROOT, 'src/sample'), join(OUT, 'sample'), { recursive: true });
for (const f of ['mesure.js', 'cro.js', 'og-checkout.js']) cpSync(join(ROOT, 'src/vendor', f), join(OUT, f));
const indexable = pages.filter((p) => !p.noindex);
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((p) => `<url><loc>${abs(p.path)}</loc><lastmod>${p.lastmod || DEFAULT_LASTMOD}</lastmod></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${abs('sitemap.xml')}\n`);
for (const f of readdirSync(join(ROOT, 'src')).filter((f) => /^[a-f0-9]{32}\.txt$/.test(f))) cpSync(join(ROOT, 'src', f), join(OUT, f));
const count = (d) => readdirSync(d).reduce((n, f) => n + (statSync(join(d, f)).isDirectory() ? count(join(d, f)) : 1), 0);
console.log(`dist: ${pages.length} pages, ${count(OUT)} files, base ${BASE}`);
