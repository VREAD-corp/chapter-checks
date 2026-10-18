// Runs against the local build (scripts/serve.mjs) or the live site (BASE_URL=https://outils.vread.fr/chapter-checks/).
// Every visit carries ?octave_notrack=1, so nothing is counted as a visit.
import { test, expect } from '@playwright/test';

const nt = (p) => p + (p.includes('?') ? '&' : '?') + 'octave_notrack=1';

for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`home, title, sources and legal pages render without horizontal scroll at ${vp.width}px`, async ({ page }) => {
    await page.setViewportSize(vp);
    for (const p of ['', '?hero=b', 'free-sample/', 'titles/frankenstein-1831/', 'titles/jane-eyre/', 'ap-literature/', 'sources/', 'terms/', 'privacy/', 'order/', 'quote/']) {
      const r = await page.goto(nt(p), { waitUntil: 'domcontentloaded' });
      expect(r.status(), p).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), p).toBeLessThanOrEqual(vp.width);
    }
  });
}

test('the free Macbeth files download (PDFs, CSV, QTI ZIP, script, full ZIP)', async ({ page, request }) => {
  await page.goto(nt('free-sample/'));
  const hrefs = await page.$$eval('.downloads a', (as) => as.map((a) => a.href));
  expect(hrefs).toHaveLength(6);
  for (const h of hrefs) {
    const r = await request.get(h);
    expect(r.status(), h).toBe(200);
    const b = await r.body();
    if (h.endsWith('.pdf')) expect(b.subarray(0, 5).toString()).toBe('%PDF-');
    if (h.endsWith('.zip')) expect(b.subarray(0, 2).toString()).toBe('PK');
    if (h.endsWith('.csv')) expect(b.toString('utf8')).toContain('correct_letter');
  }
});

test('answer key reveal and the A/B price swap ($5 by default, $7 with ?prix=p7)', async ({ page }) => {
  await page.goto(nt('?prix=p7'));
  await expect(page.locator('[data-price-title]').first()).toHaveText('$7');
  await page.goto(nt('titles/great-gatsby/?prix=p5'));
  await expect(page.locator('[data-price-title]').first()).toHaveText('$5');
  const d = page.locator('.qcard details').first();
  await d.locator('summary').click();
  await expect(d.locator('p')).toBeVisible();
});

test('the four titles released ahead of their dates are on sale: title page, then the checkout for that title', async ({ page }) => {
  for (const slug of ['hamlet', 'scarlet-letter', 'wuthering-heights', 'jane-eyre']) {
    await page.goto(nt(`titles/${slug}/?prix=p5`));
    await expect(page.locator('.eyebrow').first()).toContainText('ready');
    await expect(page.locator('ol.checks li').first()).toBeVisible();
    await page.locator(`a.btn[href$="order/?item=${slug}"]`).click();
    await expect(page.locator('#picked')).toHaveAttribute('data-product', `cc-${slug}-5-usd`);
  }
  await page.waitForSelector('#ogc-pay', { timeout: 30000 });
  await expect(page.locator('#ogc-pay')).toContainText('$5.00');
});

test('order page: the checkout mounts for the chosen item with the US as the only country', async ({ page }) => {
  await page.goto(nt('order/?item=bundle'));
  await expect(page.locator('#picked')).toHaveAttribute('data-product', 'cc-bundle-29-usd');
  await page.waitForSelector('#ogc-country', { timeout: 30000 });
  expect(await page.$$eval('#ogc-country option', (os) => os.map((o) => o.value).filter(Boolean))).toEqual(['US']);
  await page.check('input[value="school"]');
  await expect(page.locator('#picked')).toHaveAttribute('data-product', 'cc-school-249-usd');
  await expect(page.locator('#ogc-pay')).toContainText('$249.00');
});

test('reading checkpoints: one-word checkpoint card on the free sample and the title pages, in the free CSV', async ({ page, request }) => {
  await page.goto(nt('free-sample/'));
  await expect(page.locator('.qcard.cp')).toHaveCount(1);
  await expect(page.locator('.qcard.cp figcaption')).toContainText('reading checkpoint');
  await page.goto(nt('titles/jane-eyre/'));
  await expect(page.locator('.qcard.cp')).toHaveCount(1);
  await page.goto(nt('free-sample/'));
  const csv = await page.$eval('.downloads a[href$=".csv"]', (a) => a.href);
  const body = (await (await request.get(csv)).body()).toString('utf8');
  expect(body.split('\n').filter((l) => l.includes(',one_word,')).length).toBe(5);
});

for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`study pages render without horizontal scroll at ${vp.width}px, with the key reveal and one buy button`, async ({ page }) => {
    await page.setViewportSize(vp);
    for (const slug of ['macbeth', 'great-gatsby', 'frankenstein-1831', 'the-awakening', 'hamlet', 'scarlet-letter', 'wuthering-heights', 'jane-eyre']) {
      const r = await page.goto(nt(`study/${slug}/`));
      expect(r.status(), slug).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('.qcard')).toHaveCount(3);
      await expect(page.locator('a.btn')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), slug).toBeLessThanOrEqual(vp.width);
    }
    const d = page.locator('.qcard details').first();
    await d.locator('summary').click();
    await expect(d.locator('p.ev').first()).toBeVisible();
  });
}

test('study page buy button opens the checkout for that title', async ({ page }) => {
  await page.goto(nt('study/the-awakening/?prix=p5'));
  await page.locator('a.btn[href$="order/?item=the-awakening"]').click();
  await expect(page.locator('#picked')).toHaveAttribute('data-product', 'cc-awakening-5-usd');
});

test('POOLED-READING-01 rd-hero: ?hero=a keeps the HTML question card, ?hero=b shows the real PDF excerpt; the CTA stays in the first screen on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(nt('?hero=a'));
  await expect(page.locator('html')).toHaveAttribute('data-xp-rd-hero', 'a');
  await expect(page.locator('[data-hero-excerpt]')).toBeHidden();
  await expect(page.locator('.hero > .qcard')).toBeVisible();
  await page.goto(nt('?hero=b'));
  await expect(page.locator('html')).toHaveAttribute('data-xp-rd-hero', 'b');
  await expect(page.locator('[data-hero-excerpt]')).toBeVisible();
  await expect(page.locator('.hero > .qcard')).toBeHidden();
  await expect(page.locator('[data-hero-excerpt] img')).toHaveJSProperty('complete', true, { timeout: 10000 });
  const box = await page.locator('.hero .cta a.btn').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(667);
  await page.goto(nt('titles/macbeth/?hero=b'));
  await expect(page.locator('html')).toHaveAttribute('data-xp-rd-hero', 'b');
});

test('quote page: builds a printable quote with the seller details and a mailto link, nothing sent', async ({ page }) => {
  const posts = [];
  page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.goto(nt('quote/'));
  await expect(page.locator('#quote-doc')).toBeHidden();
  await page.fill('input[name="school"]', 'Test High School');
  await page.fill('input[name="name"]', 'Pat Test');
  await page.fill('input[name="email"]', 'pat@example.org');
  await page.fill('input[name="po"]', 'PO-123');
  await page.click('#quote-form button[type="submit"]');
  const doc = page.locator('#quote-doc');
  await expect(doc).toBeVisible();
  await expect(doc).toContainText('READ FRANCE SAS');
  await expect(doc).toContainText('988 741 773');
  await expect(doc).toContainText('$249');
  await expect(doc).toContainText('Purchase order: PO-123');
  await expect(doc).toContainText(/CC-Q-\d{8}-[A-Z0-9]{4}/);
  const mail = await doc.locator('a[href^="mailto:"]').getAttribute('href');
  expect(mail).toMatch(/^mailto:octave@vread\.fr\?subject=/);
  await page.check('input[value="bundle"]');
  await page.fill('input[name="qty"]', '3');
  await page.click('#quote-form button[type="submit"]');
  await expect(doc).toContainText('$87');
  expect(posts).toEqual([]);
});

test('breadcrumbs start at outils.vread.fr on inner pages; the footer links the who-and-how page', async ({ page }) => {
  for (const p of ['titles/hamlet/', 'study/hamlet/', 'free-sample/', 'order/', 'quote/']) {
    await page.goto(nt(p));
    await expect(page.locator('nav.crumbs a').first()).toHaveAttribute('href', 'https://outils.vread.fr/');
    await expect(page.locator('footer a[href="https://outils.vread.fr/a-propos/"]')).toHaveCount(1);
  }
});
