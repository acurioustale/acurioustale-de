import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The PWA manifest's background_color and theme_color drive the installed app's
// splash screen and OS chrome. Both are the dark page background, so — like the
// two <meta name="theme-color"> tags (test/themeColor.test.js) — they must track
// the CSS --page-bg the page actually paints, or the installed-app chrome drifts
// from the site with nothing else in the gate to notice. A manifest carries a
// single colour (it can't express both schemes), and the site picks the dark
// side, so this reads the dark value of the one light-dark() token and binds
// both manifest colours to it.

const repoFile = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));

const css = readFileSync(repoFile("css/style.css"), "utf8");
const manifest = JSON.parse(
  readFileSync(repoFile("manifest.webmanifest"), "utf8"),
);

// --page-bg: light-dark(<light>, <dark>); — the dark value drives the manifest.
const pageBg = css.match(
  /--page-bg:\s*light-dark\(\s*(#[0-9a-fA-F]{3,8})\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/,
);

test("the CSS exposes a --page-bg light-dark() token", () => {
  assert.ok(
    pageBg,
    "expected --page-bg: light-dark(<light>, <dark>) in style.css",
  );
});

test("the manifest background_color matches the CSS dark background", () => {
  assert.equal(
    manifest.background_color?.toLowerCase(),
    pageBg[2].toLowerCase(),
  );
});

test("the manifest theme_color matches the CSS dark background", () => {
  assert.equal(manifest.theme_color?.toLowerCase(), pageBg[2].toLowerCase());
});
