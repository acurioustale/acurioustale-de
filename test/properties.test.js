import { test } from "node:test";
import assert from "node:assert/strict";
import * as fc from "fast-check";

import { nextTheme, normalizeMode, metaMediaFor } from "../js/theme.js";
import { formatUptime } from "../js/commands.js";
import { capLimit, recallHistory, shouldRefit } from "../js/terminal-ui.js";

// Property-based coverage for the extracted pure logic. The example-based tests
// pin the specific cases that are easy to get wrong; these assert the invariants
// hold across the whole input space, so a regression that slips past a hand-
// picked example still fails the build. fast-check is dev-only (like jsdom and
// Playwright) and ships nothing to the site.

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

// Reconstruct the total minutes from a formatted uptime string, or null if it
// doesn't match any of the shapes formatUptime is allowed to produce.
function parseUptime(s) {
  const m = s.match(/^up (?:(\d+) days?, )?(?:(\d+):(\d{2})|(\d+) min)$/);
  if (!m) return null;
  const [, days, hours, mm, minsOnly] = m;
  const dayMins = (days ? Number(days) : 0) * 1440;
  if (minsOnly !== undefined) return dayMins + Number(minsOnly);
  return dayMins + Number(hours) * 60 + Number(mm);
}

// formatUptime must never surface a negative (a backwards clock or a checkout
// whose LAST_DEPLOY is still in the future) and must round-trip to the elapsed
// whole minutes for every finite input.
test("formatUptime is non-negative and round-trips to elapsed minutes", () => {
  fc.assert(
    fc.property(fc.integer(), (ms) => {
      const out = formatUptime(ms);
      assert.ok(out.startsWith("up "));
      assert.ok(!out.includes("-"));
      const expectedMins = Math.max(0, Math.floor(ms / 60000));
      assert.equal(parseUptime(out), expectedMins);
    }),
  );
});

// capLimit computes how many leading nodes to drop to hold the log at `max`: a
// strict, non-negative bound that only removes past the cap.
test("capLimit is a non-negative bound that only trims above max", () => {
  fc.assert(
    fc.property(fc.nat(), fc.nat(), (count, max) => {
      const drop = capLimit(count, max);
      assert.ok(drop >= 0);
      assert.ok(count - drop <= max);
      assert.equal(drop, count <= max ? 0 : count - max);
    }),
  );
});

// Fold an arbitrary sequence of ↑/↓ (and invalid) keys through recallHistory and
// assert the index never leaves [0, entries.length] and the value stays a string
// — the two invariants the input arithmetic must preserve.
test("recallHistory keeps its index in bounds across any key sequence", () => {
  const DIRECTION = fc.constantFrom("up", "down", "left");
  fc.assert(
    fc.property(
      fc.array(fc.string()),
      fc.string(),
      fc.array(DIRECTION),
      (entries, current, directions) => {
        let index = entries.length;
        let drafts = {};
        let value = current;
        for (const direction of directions) {
          const next = recallHistory(entries, index, drafts, value, direction);
          if (next === null) continue;
          assert.ok(next.index >= 0 && next.index <= entries.length);
          assert.equal(typeof next.value, "string");
          ({ index, drafts, value } = next);
        }
      },
    ),
  );
});

// shouldRefit is exactly a width-change predicate: reflow only when the width
// actually moved, so a height-only resize is a no-op.
test("shouldRefit is true iff the width changed", () => {
  fc.assert(
    fc.property(fc.integer(), fc.integer(), (a, b) => {
      assert.equal(shouldRefit(a, b), a !== b);
      assert.equal(shouldRefit(a, a), false);
    }),
  );
});
