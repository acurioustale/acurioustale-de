import { test } from "node:test";
import assert from "node:assert/strict";
import * as fc from "fast-check";

import { nextTheme, normalizeMode, metaMediaFor } from "../js/theme.js";

// Property-based coverage for js/theme.js. The example-based tests in
// test/theme.test.js pin the specific cases that are easy to get wrong; these
// assert the invariants hold across the whole input space, so a regression that
// slips past a hand-picked example still fails the build. fast-check is dev-only
// (like jsdom and Playwright) and ships nothing to the site.

const MODE = fc.constantFrom("auto", "light", "dark");
const MODES = ["auto", "light", "dark"];

// nextTheme is a closed three-way cycle whose order is chosen so the one colour-
// neutral step lands on the wrap back to auto.
test("nextTheme stays in the three modes and closes a three-step loop", () => {
  fc.assert(
    fc.property(MODE, fc.boolean(), (start, osLight) => {
      const step = (m) => nextTheme(m, osLight);
      assert.ok(MODES.includes(step(start)));
      // Three clicks return to the start.
      assert.equal(step(step(step(start))), start);
      // Those three clicks visit each mode exactly once.
      const visited = [step(start), step(step(start)), step(step(step(start)))];
      assert.deepEqual(new Set(visited), new Set(MODES));
    }),
  );
});

// The whole reason the order is derived from the OS preference: leaving auto
// must visibly flip the colour, so the first click is never a no-op.
test("nextTheme off auto always flips away from the OS colour", () => {
  fc.assert(
    fc.property(fc.boolean(), (osLight) => {
      assert.equal(nextTheme("auto", osLight), osLight ? "dark" : "light");
    }),
  );
});

// normalizeMode is the single source of truth for a valid override: only the two
// explicit strings survive, everything else collapses to auto.
test("normalizeMode maps only light/dark through, anything else to auto", () => {
  const anyValue = fc.oneof(
    fc.string(),
    fc.constantFrom(null, undefined, 0, 1, false, true, "AUTO", "Light"),
    fc.integer(),
  );
  fc.assert(
    fc.property(anyValue, (v) => {
      const r = normalizeMode(v);
      assert.ok(MODES.includes(r));
      if (v === "light") assert.equal(r, "light");
      else if (v === "dark") assert.equal(r, "dark");
      else assert.equal(r, "auto");
    }),
  );
});

// metaMediaFor drives the two <meta name="theme-color"> media attributes; a
// forced scheme must apply exactly one meta ("all") and mute the other.
test("metaMediaFor applies exactly one forced meta, both queries in auto", () => {
  fc.assert(
    fc.property(MODE, (mode) => {
      const r = metaMediaFor(mode);
      if (mode === "auto") {
        assert.deepEqual(r, {
          light: "(prefers-color-scheme: light)",
          dark: "(prefers-color-scheme: dark)",
        });
      } else {
        assert.equal(r.light, mode === "light" ? "all" : "not all");
        assert.equal(r.dark, mode === "dark" ? "all" : "not all");
        assert.equal([r.light, r.dark].filter((m) => m === "all").length, 1);
      }
    }),
  );
});
