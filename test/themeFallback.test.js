import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lightDarkTokens } from "../tools/css-tokens.mjs";

// The colour palette lives once as `--token: light-dark(<light>, <dark>)`, but
// browsers without light-dark() support get a fallback: the plain `:root` block
// (the light side) plus an `@supports not (...)` block (the dark side, applied
// both by prefers-color-scheme and by the forced data-theme="dark"). Those
// fallback values are hand-copied from the light-dark() tokens, so they can
// silently drift if a colour is changed in one place but not the others, and
// nothing else in the gate reads the fallback blocks. This binds every fallback
// value back to its light-dark() token so a drift fails the build.

// Strip CSS comments first, so a token, hex or `@supports not` mention inside a
// comment can't be parsed as a real declaration or rule.
const css = readFileSync(
  fileURLToPath(new URL("../css/style.css", import.meta.url)),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

// --token: light-dark(<light>, <dark>);  →  Map(token → { light, dark })
const lightDark = lightDarkTokens(css);

// Plain `--token: #hex;` declarations in a chunk of CSS  →  Map(token → hex).
function hexVars(chunk) {
  const vars = new Map();
  for (const m of chunk.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    vars.set(m[1], m[2].toLowerCase());
  }
  return vars;
}

// The text inside the first `{...}` that follows a marker, brace-matched so
// nested rules (the @media and :root rules inside @supports not) are included.
function blockAfter(text, marker) {
  const start = text.indexOf(marker);
  if (start === -1) return null;
  const open = text.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

// The plain :root fallback is the first `:root { ... }` (it has no nested
// braces, so a non-greedy match to the first `}` is exact).
const rootFallback = hexVars(css.match(/:root\s*\{([\s\S]*?)\}/)[1]);

// The dark fallback rules live inside `@supports not (...)`; each innermost
// `{...}` there is one activation rule carrying the dark palette.
const notBlock = blockAfter(css, "@supports not");
const darkRules = [...(notBlock ?? "").matchAll(/\{([^{}]*)\}/g)].map((m) =>
  hexVars(m[1]),
);

test("style.css defines the colour palette as light-dark() tokens", () => {
  assert.ok(
    lightDark.size >= 10,
    `expected the light-dark() token palette, found ${lightDark.size}`,
  );
});

test("the plain :root fallback equals the light side of every light-dark() token", () => {
  for (const [name, { light }] of lightDark) {
    assert.equal(
      rootFallback.get(name),
      light,
      `--${name}: plain :root fallback ${rootFallback.get(name)} must equal the light-dark() light side ${light}`,
    );
  }
});

test("each @supports-not rule equals the dark side of every light-dark() token", () => {
  assert.ok(
    darkRules.length >= 1,
    "expected dark fallback rules in @supports not",
  );
  for (const rule of darkRules) {
    for (const [name, { dark }] of lightDark) {
      assert.equal(
        rule.get(name),
        dark,
        `--${name}: dark fallback ${rule.get(name)} must equal the light-dark() dark side ${dark}`,
      );
    }
  }
});

test("the @supports-not dark fallback rules are identical to each other", () => {
  for (const other of darkRules.slice(1)) {
    for (const name of lightDark.keys()) {
      assert.equal(
        other.get(name),
        darkRules[0].get(name),
        `--${name} differs between the two @supports-not dark fallback rules`,
      );
    }
  }
});
