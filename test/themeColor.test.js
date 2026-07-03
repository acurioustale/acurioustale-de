import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lightDarkTokens } from "../tools/css-tokens.mjs";
import { metaTags } from "../tools/meta.mjs";

// The browser-chrome tint is set by two <meta name="theme-color"> tags, one per
// prefers-color-scheme, and must match the page background the CSS actually
// paints — otherwise the address-bar colour and the page disagree, and there is
// nothing else in the gate that would notice the two drifting apart. The CSS
// background is a single light-dark() token, so this reads both values from one
// place and asserts each theme-color meta equals the matching side.

const repoFile = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));

const html = readFileSync(repoFile("index.html"), "utf8");
const css = readFileSync(repoFile("css/style.css"), "utf8");

const pageBg = lightDarkTokens(css).get("page-bg");

// The theme-color for one prefers-color-scheme. Attribute order varies, so
// metaTags finds the tags by name and the media/content are read per tag.
function themeColor(scheme) {
  for (const tag of metaTags(html, { name: "theme-color" })) {
    if (!new RegExp(`prefers-color-scheme:\\s*${scheme}`).test(tag)) continue;
    const content = tag.match(/content=["'](#[0-9a-fA-F]{3,8})["']/);
    return content && content[1];
  }
  return null;
}

test("the CSS exposes a --page-bg light-dark() token", () => {
  assert.ok(
    pageBg,
    "expected --page-bg: light-dark(<light>, <dark>) in style.css",
  );
});

test("the light theme-color meta matches the CSS light background", () => {
  assert.equal(themeColor("light")?.toLowerCase(), pageBg.light);
});

test("the dark theme-color meta matches the CSS dark background", () => {
  assert.equal(themeColor("dark")?.toLowerCase(), pageBg.dark);
});
