// Theme toggle — persists choice in localStorage, applies data-theme on <html>
(function () {
  const STORAGE_KEY = "typingTheme";

  // Read saved preference (defaults to light)
  function readSavedTheme() {
    try { return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  }

  // Persist theme choice
  function saveTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }

  // Apply theme attribute and update toggle button aria state
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const btn = document.getElementById("themeToggle");
    if (btn) {
      const isDark = theme === "dark";
      btn.setAttribute("aria-pressed", isDark);
      const label = isDark ? "Switch to light theme" : "Switch to dark theme";
      btn.setAttribute("title", label);
      btn.setAttribute("aria-label", label);
    }
  }

  // Toggle between light and dark
  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    saveTheme(next);
  }

  // Build the sun/moon SVG toggle button
  function buildButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "themeToggle";
    btn.className = "theme-toggle";
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML =
      '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>' +
      '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
    btn.addEventListener("click", toggleTheme);
    return btn;
  }

  // Inject button into topbar-account or as fixed float
  function injectButton() {
    const btn = buildButton();
    const topbar = document.querySelector(".topbar-account");
    if (topbar) { topbar.insertBefore(btn, topbar.firstChild); }
    else { btn.classList.add("theme-toggle--fixed"); document.body.appendChild(btn); }
  }

  // Init: apply saved theme, inject button when DOM ready
  applyTheme(readSavedTheme());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectButton);
  } else { injectButton(); }
})();
