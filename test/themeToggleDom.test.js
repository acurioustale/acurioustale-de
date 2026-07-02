import { test } from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/dom.js";

// The pure cycle order (nextTheme) and the meta media mapping (metaMediaFor) are
// unit-tested in theme.test.js. These cover the wiring in theme-toggle.js: that a
// click, an OS change or a cross-tab storage event actually mutates the DOM,
// localStorage and the theme-color metas the way it should.

test("injects a theme toggle button into the titlebar", async () => {
  const { document } = await loadModule("js/theme-toggle.js");
  const btn = document.querySelector(".titlebar .theme-toggle");
  assert.ok(btn, "expected a .theme-toggle button in the titlebar");
  assert.equal(btn.getAttribute("type"), "button");
  assert.match(btn.getAttribute("aria-label"), /^Theme: auto/);
});

test("still injects the toggle when the MediaQueryList lacks addEventListener (Safari ≤13)", async () => {
  const { document } = await loadModule("js/theme-toggle.js", {
    legacyMatchMedia: true,
  });
  const btn = document.querySelector(".titlebar .theme-toggle");
  assert.ok(
    btn,
    "the toggle must still be injected when only the deprecated addListener exists",
  );
});

test("clicking cycles auto → light → dark → auto and persists each step", async () => {
  const { document, window } = await loadModule("js/theme-toggle.js", {
    prefersLight: false,
  });
  const root = document.documentElement;
  const btn = document.querySelector(".theme-toggle");

  assert.equal(root.hasAttribute("data-theme"), false); // auto: no override

  btn.click();
  assert.equal(root.getAttribute("data-theme"), "light");
  assert.equal(window.localStorage.getItem("theme"), "light");

  btn.click();
  assert.equal(root.getAttribute("data-theme"), "dark");
  assert.equal(window.localStorage.getItem("theme"), "dark");

  btn.click();
  assert.equal(root.hasAttribute("data-theme"), false); // back to auto
  assert.equal(window.localStorage.getItem("theme"), null); // override cleared
});

test("clicking keeps the two theme-color metas in sync", async () => {
  const { document } = await loadModule("js/theme-toggle.js", {
    prefersLight: false,
  });
  const light = document.querySelector(
    'meta[name="theme-color"][data-scheme="light"]',
  );
  const dark = document.querySelector(
    'meta[name="theme-color"][data-scheme="dark"]',
  );
  const btn = document.querySelector(".theme-toggle");

  btn.click(); // → light
  assert.equal(light.getAttribute("media"), "all");
  assert.equal(dark.getAttribute("media"), "not all");

  btn.click(); // → dark
  assert.equal(light.getAttribute("media"), "not all");
  assert.equal(dark.getAttribute("media"), "all");

  btn.click(); // → auto: back to the prefers-color-scheme queries
  assert.equal(light.getAttribute("media"), "(prefers-color-scheme: light)");
  assert.equal(dark.getAttribute("media"), "(prefers-color-scheme: dark)");
});

test("a bfcache restore re-syncs the theme from localStorage", async () => {
  const { document, window } = await loadModule("js/theme-toggle.js");
  const root = document.documentElement;
  assert.equal(root.hasAttribute("data-theme"), false); // starts on auto

  // Another tab set "dark" while this page was frozen in the bfcache, so no
  // storage event reached it — localStorage is ahead of the DOM.
  window.localStorage.setItem("theme", "dark");

  const pageshow = new window.Event("pageshow");
  Object.defineProperty(pageshow, "persisted", { value: true });
  window.dispatchEvent(pageshow);

  assert.equal(
    root.getAttribute("data-theme"),
    "dark",
    "restore re-syncs data-theme",
  );
  assert.match(
    document.querySelector(".theme-toggle").getAttribute("aria-label"),
    /^Theme: dark/,
  );
});

test("a normal load (pageshow not persisted) does not clobber the current theme", async () => {
  const { document, window } = await loadModule("js/theme-toggle.js");
  const root = document.documentElement;
  document.querySelector(".theme-toggle").click(); // → light (persisted)
  assert.equal(root.getAttribute("data-theme"), "light");

  // A non-persisted pageshow (ordinary navigation) must be a no-op here.
  const pageshow = new window.Event("pageshow");
  Object.defineProperty(pageshow, "persisted", { value: false });
  window.dispatchEvent(pageshow);
  assert.equal(root.getAttribute("data-theme"), "light");
});

test("a storage event from another tab mirrors the scheme without writing back", async () => {
  const { document, window } = await loadModule("js/theme-toggle.js");
  const root = document.documentElement;

  // Another tab persisted "dark"; this tab only reflects it.
  window.dispatchEvent(
    new window.StorageEvent("storage", { key: "theme", newValue: "dark" }),
  );
  assert.equal(root.getAttribute("data-theme"), "dark");
  assert.equal(
    window.localStorage.getItem("theme"),
    null,
    "mirroring must not re-persist the value",
  );
  assert.match(
    document.querySelector(".theme-toggle").getAttribute("aria-label"),
    /^Theme: dark/,
  );

  // A cleared key (another tab chose auto) hands control back to the OS.
  window.dispatchEvent(
    new window.StorageEvent("storage", { key: "theme", newValue: null }),
  );
  assert.equal(root.hasAttribute("data-theme"), false);
});

test("clearing site storage in another tab (key null) resets to auto", async () => {
  const { document, window } = await loadModule("js/theme-toggle.js");
  const root = document.documentElement;

  // Mirror a dark override first.
  window.dispatchEvent(
    new window.StorageEvent("storage", { key: "theme", newValue: "dark" }),
  );
  assert.equal(root.getAttribute("data-theme"), "dark");

  // localStorage.clear() in another tab fires a storage event with key === null
  // (not "theme"), so the handler must still reset rather than ignore it.
  window.dispatchEvent(
    new window.StorageEvent("storage", { key: null, newValue: null }),
  );
  assert.equal(
    root.hasAttribute("data-theme"),
    false,
    "clear() must hand control back to the OS",
  );
});
