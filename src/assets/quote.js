/* Chapter Checks quote page: builds a printable quote in the browser from the form, plus a mailto: link to
 * octave@vread.fr. Nothing typed is sent anywhere by this script (no fetch, no storage). The reference is random
 * (not an invoice number); the invoice is issued by the checkout after payment. */
(function () {
  'use strict';
  var cfg = JSON.parse(document.getElementById('quote-config').textContent);
  var form = document.getElementById('quote-form');
  var doc = document.getElementById('quote-doc');
  var qty = form.querySelector('input[name="qty"]');
  function usd(c) { return '$' + (c % 100 ? (c / 100).toFixed(2) : (c / 100).toLocaleString('en-US')); }
  function longDate(d) { return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function item() { return (form.querySelector('input[name="item"]:checked') || {}).value || 'school'; }
  function syncQty() {
    var it = cfg.items[item()];
    qty.max = String(it.max);
    if (item() === 'school') qty.value = '1';
    qty.disabled = item() === 'school';
    qty.parentNode.hidden = item() === 'school';
  }
  form.addEventListener('change', syncQty);
  syncQty();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    var f = new FormData(form);
    var id = item(), it = cfg.items[id];
    var n = id === 'school' ? 1 : Math.max(1, Math.min(it.max, parseInt(f.get('qty'), 10) || 1));
    var total = it.amount * n;
    var now = new Date();
    var until = new Date(now.getTime() + 30 * 864e5);
    var ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
    var ref = 'CC-Q-' + ymd + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    var school = String(f.get('school')).trim(), name = String(f.get('name')).trim(), email = String(f.get('email')).trim();
    var address = String(f.get('address') || '').trim(), po = String(f.get('po') || '').trim();
    var payUrl = cfg.orderUrl + '?item=' + id;

    doc.textContent = '';
    doc.appendChild(el('div', { class: 'quote-head' }, [
      el('div', {}, [el('p', { class: 'eyebrow', text: 'Quote' }), el('h2', { text: 'Chapter Checks by READ FRANCE' }),
        el('p', { text: 'Reference ' + ref + ' · issued ' + longDate(now) + ' · prices valid until ' + longDate(until) })]),
    ]));
    doc.appendChild(el('div', { class: 'quote-parties' }, [
      el('div', {}, [el('h3', { text: 'Seller' }), el('p', { text: 'READ FRANCE SAS, 11 rue Rouvet, 75019 Paris, France' }),
        el('p', { text: 'RCS Paris 988 741 773 · share capital €1,000' }), el('p', { text: cfg.contact })]),
      el('div', {}, [el('h3', { text: 'Prepared for' }), el('p', { text: school }), el('p', { text: name + ' · ' + email }),
        address ? el('p', { class: 'pre', text: address }) : null, po ? el('p', { text: 'Purchase order: ' + po }) : null]),
    ]));
    var table = el('table', { class: 'titles' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Item' }), el('th', { text: 'Qty' }), el('th', { text: 'Unit price' }), el('th', { text: 'Amount' })])]),
      el('tbody', {}, [el('tr', {}, [el('td', { text: it.label }), el('td', { text: String(n) }), el('td', { text: usd(it.amount) }), el('td', { text: usd(total) })]),
        el('tr', { class: 'total' }, [el('td', { text: 'Total (USD)' }), el('td'), el('td'), el('td', { text: usd(total) })])]),
    ]);
    doc.appendChild(el('div', { class: 'table-wrap' }, [table]));
    doc.appendChild(el('ul', { class: 'quote-terms' }, [
      el('li', { text: 'No French VAT: electronically supplied services to a buyer established outside the European Union (French tax code, art. 259-1°). US sales tax is not collected.' }),
      el('li', { text: 'Delivery: the files (student PDFs, answer keys with rubrics, Canvas QTI, CSV, Google Forms script) are e-mailed after payment, usually within minutes.' }),
      el('li', { text: 'Payment: by card at ' + payUrl + (n > 1 ? ' (one payment per teacher licence)' : '') + '. Tick "I am buying for a company" for an invoice in the school\'s name. Purchase orders on net-30 terms, checks and bank transfers are not accepted yet: e-mail us your purchase order and we will tell you whether we can accept it.' }),
      el('li', { text: 'Refund: full refund within 14 days of delivery, no reason needed. Terms: ' + cfg.orderUrl.replace(/order\/$/, 'terms/') }),
      el('li', { text: 'This is a quote, not an invoice. The invoice is issued after payment.' }),
    ]));
    var body = ['Hello,', '', 'Please find our quote request below.', '', 'Quote reference: ' + ref, 'Item: ' + it.label, 'Quantity: ' + n,
      'Total: ' + usd(total) + ' (USD)', 'School or district: ' + school, 'Contact: ' + name + ', ' + email]
      .concat(address ? ['Billing address: ' + address.replace(/\s*\n\s*/g, ', ')] : [])
      .concat(po ? ['Purchase order number: ' + po] : []).concat(['', '(Attach the printed quote or our purchase order if you have one.)']).join('\n');
    var mail = 'mailto:' + cfg.contact + '?subject=' + encodeURIComponent('Quote ' + ref + ': Chapter Checks for ' + school) + '&body=' + encodeURIComponent(body);
    var printBtn = el('button', { class: 'btn', type: 'button', text: 'Print or save as PDF' });
    printBtn.addEventListener('click', function () { window.print(); });
    doc.appendChild(el('p', { class: 'cta no-print' }, [printBtn, el('a', { class: 'textlink', href: mail, text: 'E-mail it to us' }), el('a', { class: 'textlink', href: payUrl, text: 'Pay by card now' })]));
    doc.hidden = false;
    doc.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
