import { test } from "node:test";
import assert from "node:assert/strict";
import * as fc from "fast-check";

import { capLimit, recallHistory, shouldRefit } from "../js/terminal-ui.js";

// Property-based coverage for js/terminal-ui.js. The example-based tests in
// test/terminalUi.test.js pin the specific cases that are easy to get wrong;
// these assert the invariants hold across the whole input space, so a regression
// that slips past a hand-picked example still fails the build.

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
