// Applies the saved theme before the page paints (prevents a light flash in dark mode).
// Loaded as an external file because the server's Content-Security-Policy blocks inline scripts.
(function () {
  var pref = 'system';
  try { pref = localStorage.getItem('propbot_theme') || 'system'; } catch (e) { /* storage unavailable */ }
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
