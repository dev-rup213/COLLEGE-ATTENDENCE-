/* ============================================================
   app.js — shared shell behaviour used on every page
   ============================================================ */

const App = (() => {
  function initTheme() {
    const settings = Storage.getSettings();
    const theme = settings.theme || "light";
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.textContent = theme === "dark" ? "☀ Light mode" : "● Dark mode";
      btn.addEventListener("click", () => {
        const s = Storage.getSettings();
        const next = (document.documentElement.getAttribute("data-theme") === "dark") ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        s.theme = next;
        Storage.saveSettings(s);
        btn.textContent = next === "dark" ? "☀ Light mode" : "● Dark mode";
      });
    });
  }

  function markActiveNav() {
    const page = document.body.getAttribute("data-page");
    document.querySelectorAll("[data-nav]").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("data-nav") === page);
    });
  }

  function toast(message) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function guardNoRoutine(routine, containerEl) {
    if (routine) return false;
    containerEl.innerHTML = `
      <div class="sheet empty-note">
        No routine has been configured. Add your routine to start recording attendance.
        <br><br>
        <a class="btn btn-primary" href="routine.html">Set up routine</a>
      </div>`;
    return true;
  }

  // Scripts are loaded at the end of <body>, so the DOM is already
  // in place — run immediately rather than waiting for
  // DOMContentLoaded, which avoids a flash of the wrong theme.
  initTheme();
  markActiveNav();

  return { toast, guardNoRoutine };
})();
