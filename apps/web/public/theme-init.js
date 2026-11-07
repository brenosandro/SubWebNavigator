// Tema antes do primeiro paint (evita flash claro). Arquivo externo: a CSP do shell não permite script inline.
(function () {
  try {
    var raw = localStorage.getItem('@swn:theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    var t = null;
    if (raw) {
      var p = JSON.parse(raw);
      t = p && p.state && p.state.theme;
    }
    if (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) t = 'dark';
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      if (meta) meta.setAttribute('content', '#121212');
    }
  } catch (e) {}
})();
