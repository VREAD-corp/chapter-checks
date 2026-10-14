/* Chapter Checks A/B test (read by cro.js, which must load after this file): price of one title pack,
 * USD 5 (p5) or USD 7 (p7), drawn once per browser tab (sessionStorage, gone when the tab closes).
 * ?prix=p7 forces a variant. The order page sells the product of the tab's variant. */
window.OCTAVE_XP = [{
  id: 'cc-prix',
  variants: ['p5', 'p7'],
  param: 'prix',
  swap: { p7: [['[data-price-title]', 'text', '$7']] },
}];
