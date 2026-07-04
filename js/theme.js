// Pure theme-cycle logic, extracted so it can be unit-tested without a DOM
// (see test/theme.test.js). The DOM wiring lives in theme-toggle.js.

// The persisted theme is honoured only if it's one of the three modes; anything
// else (absent, stale, tampered) means "auto" — hand control back to the OS.
// The single source of truth for what counts as a valid override, shared by the
// toggle. (The inline pre-paint guard in index.html duplicates this check by
// hand because it must run before any module can load.)
export function normalizeMode(value) {
  return value === "light" || value === "dark" ? value : "auto";
}

// The next theme in the three-way cycle. "auto" looks identical to the OS
// preference, so one step of a three-way cycle is always colour-neutral.
// Visiting the theme that matches the OS last puts that neutral step on the
// wrap back to auto, so every other click visibly flips the colour (no dead
// first click). The cycle order is therefore derived from the OS preference.
export function nextTheme(current, osPrefersLight) {
  const order = osPrefersLight
    ? ["auto", "dark", "light"]
    : ["auto", "light", "dark"];
  return order[(order.indexOf(current) + 1) % order.length];
}

// The prefers-color-scheme media queries. Exported so theme-toggle.js runs its
// runtime matchMedia() off the very string the auto-mode meta media attribute
// carries: the toggle's cycle order (derived from the runtime match) and the
// chrome tint (from these attributes) must agree, and a second hand-written copy
// of the query could drift from this one with no test to catch it.
export const PREFERS_LIGHT = "(prefers-color-scheme: light)";
export const PREFERS_DARK = "(prefers-color-scheme: dark)";

// The `media` attribute each <meta name="theme-color"> must carry for a given
// mode, returned as { light, dark } for the light- and dark-palette metas. In
// "auto" both keep their prefers-color-scheme queries so the OS drives the tint;
// a forced light/dark makes the matching meta apply to all media and the other
// to none. Extracted from theme-toggle.js's setScheme so the all/"not all"
// mapping — easy to invert — is unit-tested. See test/theme.test.js.
export function metaMediaFor(mode) {
  if (mode === "auto") {
    return {
      light: PREFERS_LIGHT,
      dark: PREFERS_DARK,
    };
  }
  return {
    light: mode === "light" ? "all" : "not all",
    dark: mode === "dark" ? "all" : "not all",
  };
}
