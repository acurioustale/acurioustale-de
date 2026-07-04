import {
  nextTheme,
  normalizeMode,
  metaMediaFor,
  PREFERS_LIGHT,
} from "./theme.js";

// Inject the theme toggle as progressive enhancement: without JS the OS
// preference still drives light/dark via CSS, and no dead control shows.
// The toggle cycles through auto, light and dark; "auto" clears the override
// and hands control back to the OS preference.
const root = document.documentElement;
const bar = document.querySelector(".titlebar");
if (bar) {
  const GLYPH = { auto: "◐", light: "☼", dark: "☾" };

  // The OS scheme drives both the cycle order and the live label, so query it
  // once and reuse the same MediaQueryList for reads and the change listener.
  const prefersLight = window.matchMedia(PREFERS_LIGHT);

  // The current explicit override, or "auto" when none is set.
  function mode() {
    return normalizeMode(root.getAttribute("data-theme"));
  }

  // The next theme in the cycle, with the order derived from the OS preference
  // so the unavoidable colour-neutral step lands on the wrap back to auto.
  function next(m) {
    return nextTheme(m, prefersLight.matches);
  }

  // Force the colour scheme: set (or clear) the data-theme override and keep the
  // two <meta name="theme-color"> media attributes in sync. Pure DOM, no persist,
  // so it can be reused to reflect an already-stored choice (on load, or from
  // another tab) without a redundant write back to localStorage.
  function setScheme(to) {
    if (to === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", to);

    // Sync each meta independently: a missing or renamed one must not stop the
    // other from tracking the forced scheme (a combined `light && dark` guard
    // would skip both and silently desync the chrome tint from the page). The
    // two metas differ only by data-scheme, so pair each concrete selector with
    // its media string and run the locate-guard-set once instead of twice.
    const media = metaMediaFor(to);
    const metas = [
      ['meta[name="theme-color"][data-scheme="light"]', media.light],
      ['meta[name="theme-color"][data-scheme="dark"]', media.dark],
    ];
    for (const [selector, value] of metas) {
      const meta = document.querySelector(selector);
      if (meta) meta.setAttribute("media", value);
    }
  }

  // Persist the choice: "auto" clears the override, light/dark store it.
  function persist(to) {
    try {
      if (to === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", to);
    } catch {}
  }

  // Apply a user choice: persist it and force the scheme.
  function apply(to) {
    persist(to);
    setScheme(to);
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "theme-toggle";

  function render() {
    const m = mode();
    const label = "Theme: " + m + " — switch to " + next(m);
    btn.textContent = GLYPH[m];
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }

  btn.addEventListener("click", function () {
    apply(next(mode()));
    render();
  });

  // The label's "switch to" target is derived from the OS preference (it sets
  // the cycle order), so re-render on every OS change in any mode — not just
  // auto, where the glyph also follows the OS. Prefer addEventListener; fall
  // back to the deprecated addListener for Safari ≤13, whose MediaQueryList
  // predates it — an unguarded call there throws and aborts the whole toggle
  // (the button is never appended), the same class of API the terminal guards.
  if (prefersLight.addEventListener) {
    prefersLight.addEventListener("change", render);
  } else if (prefersLight.addListener) {
    prefersLight.addListener(render);
  }

  bar.appendChild(btn);

  // A stored override is already in localStorage (the inline guard applied it
  // pre-paint); sync the metas to match without re-persisting the same value.
  const initialMode = mode();
  if (initialMode !== "auto") {
    setScheme(initialMode);
  }
  render();

  // When another tab changes the theme, mirror it here via setScheme so the
  // <meta name="theme-color"> tags stay in sync too, not just data-theme. The
  // originating tab already persisted the value, so we only reflect it — no
  // write back, no cross-tab storage-event loop.
  window.addEventListener("storage", function (e) {
    // key === null means the whole store was cleared (localStorage.clear());
    // its newValue is null too, so it normalises to auto — hand control back to
    // the OS, same as another tab choosing auto.
    if (e.key === "theme" || e.key === null) {
      setScheme(normalizeMode(e.newValue));
      render();
    }
  });

  // A page restored from the back/forward cache never saw the storage events
  // fired while it was frozen, so its theme can lag another tab's change (and
  // the next toggle would then cycle from a stale mode). Re-read localStorage
  // and re-apply on bfcache restore; a normal load (persisted false) is already
  // handled above, so skip it.
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    let stored = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {}
    setScheme(normalizeMode(stored));
    render();
  });
}
