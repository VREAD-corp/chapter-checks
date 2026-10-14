/* Chapter Checks order page: the buyer picks a title, the set or the school licence; the octave-global-checkout
 * module (og-checkout.js) is mounted for the matching product. The title price is the tab's A/B variant
 * (cro.js: octaveCro.v('cc-prix'), p5 by default). US buyers only: the server refuses other countries too. */
(function () {
  'use strict';
  var cfg = JSON.parse(document.getElementById('order-config').textContent);
  var form = document.getElementById('choose');
  var picked = document.getElementById('picked');
  var variant = (window.octaveCro && window.octaveCro.v && window.octaveCro.v('cc-prix')) || 'p5';
  if (!cfg.prices[variant]) variant = 'p5';
  var byId = {};
  cfg.items.forEach(function (i) { byId[i.id] = i; });
  function usd(c) { return '$' + (c % 100 ? (c / 100).toFixed(2) : c / 100); }
  function choose(id) {
    var it = byId[id];
    if (!it) return;
    var product = it.kind === 'title' ? it.products[variant] : it.product;
    var amount = it.kind === 'title' ? cfg.prices[variant] : it.amount;
    var label = form.querySelector('input[value="' + id + '"]').parentNode.textContent.replace(/\s+/g, ' ').trim();
    picked.textContent = 'You are buying: ' + label + ' (' + usd(amount) + ')';
    picked.setAttribute('data-product', product);
    var opts = { product: product, amount: amount, currency: 'usd', venture: cfg.venture, lang: 'en', country: 'US', countries: ['US'],
      returnUrl: location.origin + location.pathname + '?item=' + encodeURIComponent(id) };
    if (cfg.endpoint) { opts.endpoint = cfg.endpoint; opts.publishableKey = cfg.publishableKey; }
    window.OctaveCheckout.mount('#buy', opts);
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'item') choose(e.target.value); });
  var q = new URLSearchParams(location.search).get('item');
  var first = byId[q] ? q : (cfg.items[0] && cfg.items[0].id);
  // After a 3-D Secure redirect the module finishes the order from the URL: mount the same product again.
  if (first) {
    var input = form.querySelector('input[value="' + first + '"]');
    if (input) input.checked = true;
    choose(first);
  }
})();
