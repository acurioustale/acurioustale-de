import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { JSDOM } from "jsdom";

import { normalizeMode, metaMediaFor } from "../js/theme.js";
import { inlineScripts } from "../tools/inline-scripts.mjs";

// The pre-paint theme guard in index.html runs before any module can load, so it
// can't import normalizeMode() and instead hand-duplicates its accept/reject rule
// ("light"/"dark" are honoured as an override, everything else falls back to
// auto). Nothing else binds the two copies. This runs the real inline guard from
// index.html against the same inputs as normalizeMode() and asserts they agree:
// a divergence (a third mode added on one side only, or a tightened guard) would
// flash or revert the theme on the next reload, with no other check to notice.

const html = readFileSync(
  fileURLToPath(new URL("../index.html", import.meta.url)),
  "utf8",
);

// The guard is the one inline <script> (no src) that reads localStorage; the
// other inline block is JSON-LD data, which never touches it.
const inlineGuards = inlineScripts(html).filter(({ body }) =>
  /localStorage/.test(body),
);

test("index.html has exactly one inline localStorage theme guard", () => {
  assert.equal(inlineGuards.length, 1);
});

const guardSource = inlineGuards[0].body;

// Execute the extracted guard with a fake localStorage holding `stored` and a
// fake document that records any data-theme it sets. Returns the applied
// override, or undefined when the guard leaves the attribute unset (= auto).
function guardOverride(stored) {
  let applied;
  vm.runInNewContext(guardSource, {
    localStorage: { getItem: (key) => (key === "theme" ? stored : null) },
    document: {
      documentElement: {
        setAttribute: (name, value) => {
          if (name === "data-theme") applied = value;
        },
      },
      querySelector: () => null,
    },
  });
  return applied;
}

// The two valid overrides plus a spread of values that must all fall back to
// auto: absent, wrong case, and unknown modes.
const candidates = [
  "light",
  "dark",
  "auto",
  "Light",
  "DARK",
  "sepia",
  "system",
  "",
  "0",
  null,
  undefined,
];

test("the inline guard applies an override iff normalizeMode() does, with the same value", () => {
  for (const value of candidates) {
    const override = guardOverride(value);
    const normalized = normalizeMode(value);
    if (normalized === "auto") {
      // auto = no explicit override: the guard must leave data-theme unset.
      assert.equal(
        override,
        undefined,
        `guard set data-theme for ${JSON.stringify(value)}, normalizeMode says auto`,
      );
    } else {
      assert.equal(
        override,
        normalized,
        `guard and normalizeMode disagree for ${JSON.stringify(value)}`,
      );
    }
  }
});

// The guard must also point the two theme-color metas at the forced scheme so
// the browser-chrome tint matches from first paint (theme-toggle.js only fixes
// this up once it loads). Run the real guard against a DOM built from the
// shipping index.html and check the actual metas — this also binds the guard's
// data-scheme meta selectors to the shipping markup: if either stops matching,
// the media would stay on its prefers query and these fail. The expected media
// come from metaMediaFor(), the same function theme-toggle.js's setScheme() uses,
// so the guard's hand-copied all/"not all" mapping is bound to that one source
// of truth rather than to independent literals here.
function runGuardInDom(stored) {
  const { window } = new JSDOM(html);
  vm.runInNewContext(guardSource, {
    localStorage: { getItem: (key) => (key === "theme" ? stored : null) },
    document: window.document,
  });
  return window.document;
}

const lightMeta = 'meta[name="theme-color"][data-scheme="light"]';
const darkMeta = 'meta[name="theme-color"][data-scheme="dark"]';

test("the inline guard points the theme-color metas at a forced scheme", () => {
  for (const stored of ["dark", "light"]) {
    const expected = metaMediaFor(stored);
    const doc = runGuardInDom(stored);
    assert.equal(doc.documentElement.getAttribute("data-theme"), stored);
    assert.equal(
      doc.querySelector(lightMeta).getAttribute("media"),
      expected.light,
    );
    assert.equal(
      doc.querySelector(darkMeta).getAttribute("media"),
      expected.dark,
    );
  }
});

test("with no override the guard leaves the metas on prefers-color-scheme", () => {
  const expected = metaMediaFor("auto");
  const doc = runGuardInDom(null);
  assert.equal(doc.documentElement.hasAttribute("data-theme"), false);
  assert.equal(
    doc.querySelector(lightMeta).getAttribute("media"),
    expected.light,
  );
  assert.equal(
    doc.querySelector(darkMeta).getAttribute("media"),
    expected.dark,
  );
});
