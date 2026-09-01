(function () {
  const KEY = "kinolin-theme";
  const saved = localStorage.getItem(KEY);
  const dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
  syncThemeColor(dark);

  function syncThemeColor(isDark) {
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute("content", isDark ? "#0f0f0f" : "#ffffff");
  }

  window.toggleTheme = function () {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(KEY, next ? "dark" : "light");
    syncThemeColor(next);
  };
})();
