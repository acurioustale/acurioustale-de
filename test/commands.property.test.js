import { test } from "node:test";
import assert from "node:assert/strict";
import * as fc from "fast-check";

import {
  formatUptime,
  reply,
  blockFor,
  STATIC_BLOCKS,
  HANDLERS,
} from "../js/commands.js";

// Property-based coverage for js/commands.js. The example-based tests in
// test/commands.test.js pin the specific cases that are easy to get wrong;
// these assert the invariants hold across the whole input space, so a regression
// that slips past a hand-picked example still fails the build.

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

// A single argv token: any non-empty string with its whitespace substituted out,
// so the separators below are the only whitespace in the generated line.
const TOKEN = fc.oneof(
  fc.constantFrom(...Object.keys(HANDLERS), "su", "chmod", "whoami", "./x.sh"),
  fc.string({ minLength: 1 }).map((s) => s.replace(/\s/g, "x")),
);
const SPACE = fc
  .array(fc.constantFrom(" ", "\t", "\n"), { minLength: 1 })
  .map((cs) => cs.join(""));

// reply() splits its line on /\s+/ after trimming, so the amount and kind of
// whitespace around and between the operands must not reach any handler: the
// same tokens always answer the same way. `date` and `uptime` read the clock, so
// they are the one family whose output is allowed to differ between two calls.
test("reply depends only on the tokens, never on the whitespace between them", () => {
  fc.assert(
    fc.property(
      fc
        .array(TOKEN, { minLength: 1 })
        .filter((argv) => !["date", "uptime"].includes(argv[0])),
      fc.array(SPACE, { minLength: 1 }),
      SPACE,
      SPACE,
      (argv, gaps, lead, trail) => {
        const canonical = argv.join(" ");
        const spaced = argv
          .map((tok, i) => (i === 0 ? tok : gaps[i % gaps.length] + tok))
          .join("");
        const out = reply(canonical);
        assert.equal(typeof out, "string");
        assert.equal(reply(lead + spaced + trail), out);
      },
    ),
  );
});

// blockFor is total over arbitrary command lines: it answers with one of the
// static block selectors or undefined, never an inherited Object member.
const BLOCKS = Object.values(STATIC_BLOCKS);
test("blockFor answers a static block or undefined for any line", () => {
  fc.assert(
    fc.property(fc.oneof(fc.string(), TOKEN), (cmd) => {
      const r = blockFor(cmd);
      assert.ok(r === undefined || BLOCKS.includes(r));
    }),
  );
});

// The trailing-slash rule is idempotent on the `ls ` listing form — one slash or
// twenty name the same directory — and applies to no other form, where a slash
// makes the operand a different (missing) path.
test("blockFor strips any run of trailing slashes, but only after `ls `", () => {
  fc.assert(
    fc.property(fc.nat({ max: 20 }), (n) => {
      const slashes = "/".repeat(n);
      assert.equal(blockFor("ls projects" + slashes), ".projects");
      assert.equal(
        blockFor("./whoami.sh" + slashes),
        n === 0 ? ".whoami" : undefined,
      );
    }),
  );
});
