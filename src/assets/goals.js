/* Chapter Checks A/B goal 'sample' (read by cro.js): a click on any link to the free Macbeth pack or its files.
 * octaveCro.goal counts it at most once per tab, only for experiments the tab was exposed to (POOLED-READING-01). */
document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest && e.target.closest('a[href]');
  if (!a || !window.octaveCro) return;
  var p = a.pathname || '';
  if (/\/chapter-checks\/(free-sample\/|sample\/macbeth\/)/.test(p)) window.octaveCro.goal('sample');
}, true);
