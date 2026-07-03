import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { metaTags } from "../tools/meta.mjs";

// theme-toggle.js locates the two <meta name="theme-color"> tags by their stable
// data-scheme attribute ("light"/"dark"), then keeps each tag's `media` attribute
// in sync as the toggle forces a scheme. Those selectors must match metas that
// index.html actually declares: rename or drop the attribute on one side and
// querySelector returns null, the guarded per-meta `if (lightMeta)` lookup
// silently skips that meta's tint update, and nothing else notices — no error,
// no failing test.
// This binds the selectors back to the metas so that drift fails the build. The
// inline pre-paint guard in index.html uses the same data-scheme lookup;
// test/themeGuard.test.js binds its copy to the shipping markup.

const repoFile = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));

const html = readFileSync(repoFile("index.html"), "utf8");
const toggle = readFileSync(repoFile("js/theme-toggle.js"), "utf8");

// The data-scheme value each <meta name="theme-color"> declares. Reuse
// tools/meta.mjs to find the tags rather than re-deriving a private <meta> regex
// here, so this inherits its comment-skipping (a commented-out sample meta won't
// be counted) and attribute-boundary anchoring. Attribute order varies, so read
// the data-scheme off each matched tag independently.
function metaSchemes() {
  const schemes = new Set();
  for (const { attrs } of metaTags(html, { name: "theme-color" })) {
    const scheme = attrs.get("data-scheme");
    if (scheme) schemes.add(scheme.toLowerCase());
  }
  return schemes;
}

// The data-scheme values theme-toggle.js hardcodes into its
// meta[name="theme-color"][data-scheme="..."] selectors, in source order.
function selectorSchemes() {
  const re = /meta\[name=["']theme-color["']\]\[data-scheme=["'](\w+)["']\]/gi;
  return [...toggle.matchAll(re)].map((m) => m[1].toLowerCase());
}

// Guard the derivation itself: if a refactor changes how theme-toggle.js selects
// the metas so the regex matches nothing, the binding checks below would pass
// vacuously — fail loudly instead so this guard gets revisited.
test("theme-toggle.js selects the theme-color metas by exactly two data-scheme values", () => {
  assert.equal(
    selectorSchemes().length,
    2,
    'expected two meta[name="theme-color"][data-scheme="..."] selectors in theme-toggle.js',
  );
});

test("index.html declares a light and a dark theme-color meta with data-scheme", () => {
  const schemes = metaSchemes();
  assert.ok(
    schemes.has("light"),
    'index.html is missing a data-scheme="light" theme-color meta',
  );
  assert.ok(
    schemes.has("dark"),
    'index.html is missing a data-scheme="dark" theme-color meta',
  );
});

test("every theme-toggle.js selector matches a theme-color meta, and vice versa", () => {
  const selectors = selectorSchemes();
  const metas = metaSchemes();

  // Each meta the toggle must keep in sync has a selector that finds it.
  for (const scheme of metas) {
    assert.ok(
      selectors.includes(scheme),
      `no theme-toggle.js selector targets the theme-color meta data-scheme=${scheme}`,
    );
  }

  // No selector points at a data-scheme that no theme-color meta declares (which
  // would resolve to null at runtime and silently skip the tint update).
  for (const scheme of selectors) {
    assert.ok(
      metas.has(scheme),
      `theme-toggle.js selects data-scheme=${scheme}, but no theme-color meta declares it`,
    );
  }
});
