/* Chapter Checks A/B tests (read by cro.js, which must load after this file).
 * cc-prix: price of one title pack, USD 5 (p5) or USD 7 (p7), drawn once per browser tab (sessionStorage, gone when
 *   the tab closes). ?prix=p7 forces a variant. The order page sells the product of the tab's variant.
 * rd-hero: POOLED-READING-01 (2026-10-19): hero a = current, b = first screen shows a real excerpt of the deliverable.
 *   Same id on the 7 reading sites, pooled analysis in vread-revenue-lab. ?hero=b forces b. Home page only; b shows
 *   the top of page 1 of the free Macbeth student PDF in place of the HTML question card (style.css, data-xp-rd-hero). */
window.OCTAVE_XP = [{
  id: 'cc-prix',
  variants: ['p5', 'p7'],
  param: 'prix',
  swap: { p7: [['[data-price-title]', 'text', '$7']] },
}, {
  id: 'rd-hero',
  variants: ['a', 'b'],
  mode: 'tab',
  param: 'hero',
  pages: '^/chapter-checks/$',
}];
