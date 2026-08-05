/* ============================================================================
   theme-switcher.js — tiny footer light/dark switch (NON-PRODUCTION only)
   ----------------------------------------------------------------------------
   A very small light/dark toggle rendered at the bottom of the footer, à la
   Vercel. Purpose: keep dark mode exercised and debuggable while the site is
   light-first. It is gated OFF on production domains (hypertrack.com/.ai/.io),
   so production always renders light and never shows the control. It DOES show
   on localhost + the *.cloudfront.net main/staging previews.

   Choice persists in localStorage ('ht-theme'); default is light. Toggling adds
   / removes the `dark` class on <html> (Tailwind darkMode: 'class').
   Add to any page with: <script src="js/theme-switcher.js" defer></script>
   (use ../js/ from a subdirectory).
   ============================================================================ */
(function () {
  var host = location.hostname || '';
  // Production: light-only, no switch injected.
  if (/(^|\.)hypertrack\.(com|ai|io)$/i.test(host)) return;

  // Apply persisted preference early (default light).
  try {
    if (localStorage.getItem('ht-theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}

  var SUN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  var MOON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

  function build() {
    var footer = document.querySelector('footer');
    if (!footer || footer.querySelector('[data-ht-theme-switch]')) return;

    var wrap = document.createElement('div');
    wrap.setAttribute('data-ht-theme-switch', '');
    wrap.style.cssText = 'display:flex;justify-content:center;padding:0 16px 20px;';

    var btnBase = 'display:inline-flex;width:26px;height:26px;align-items:center;justify-content:center;border:0;border-radius:9999px;cursor:pointer;transition:background-color .15s ease,color .15s ease;';
    wrap.innerHTML =
      '<div role="group" aria-label="Color theme (preview only)" ' +
      'style="display:inline-flex;align-items:center;gap:2px;border:1px solid var(--line-solid,#ebebec);' +
      'border-radius:9999px;padding:3px;background:var(--marker-fill,#fff);">' +
      '<button type="button" data-set="light" aria-label="Light theme" title="Light" style="' + btnBase + '">' + SUN + '</button>' +
      '<button type="button" data-set="dark" aria-label="Dark theme" title="Dark" style="' + btnBase + '">' + MOON + '</button>' +
      '</div>';
    footer.appendChild(wrap);

    var lightBtn = wrap.querySelector('[data-set="light"]');
    var darkBtn = wrap.querySelector('[data-set="dark"]');

    function refresh() {
      var dark = document.documentElement.classList.contains('dark');
      var idle = 'background:transparent;color:' + (dark ? '#84827e' : '#a1a2a4') + ';';
      var active = 'background:' + (dark ? '#32302c' : '#ffffff') + ';color:' + (dark ? '#ffffff' : '#1c1b18') + ';box-shadow:0 1px 2px rgba(0,0,0,.10);';
      lightBtn.style.cssText = btnBase + (dark ? idle : active);
      darkBtn.style.cssText = btnBase + (dark ? active : idle);
    }
    function set(dark) {
      document.documentElement.classList.toggle('dark', dark);
      try { localStorage.setItem('ht-theme', dark ? 'dark' : 'light'); } catch (e) {}
      refresh();
    }
    lightBtn.addEventListener('click', function () { set(false); });
    darkBtn.addEventListener('click', function () { set(true); });
    refresh();
  }

  if (document.readyState !== 'loading') build();
  else document.addEventListener('DOMContentLoaded', build);
})();
