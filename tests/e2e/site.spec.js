// Runs against the local build (scripts/serve.mjs) or the live site (BASE_URL=https://outils.vread.fr/chapter-checks/).
// Every visit carries ?octave_notrack=1, so nothing is counted as a visit.
import { test, expect } from '@playwright/test';

const nt = (p) => p + (p.includes('?') ? '&' : '?') + 'octave_notrack=1';

for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`home, title, sources and legal pages render without horizontal scroll at ${vp.width}px`, async ({ page }) => {
    await page.setViewportSize(vp);
    for (const p of ['', 'free-sample/', 'titles/frankenstein-1831/', 'titles/jane-eyre/', 'ap-literature/', 'sources/', 'terms/', 'privacy/']) {
      const r = await page.goto(nt(p));
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
