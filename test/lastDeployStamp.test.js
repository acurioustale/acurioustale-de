import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Bind deploy.sh's LAST_DEPLOY stamping regex to js/commands.js's declaration so
// the two can't drift silently. On every deploy, deploy.sh rewrites the staged
// js/commands.js by regex-replacing the LAST_DEPLOY assignment (so `uptime`
// counts from the live deploy). Nothing in the gate exercised that regex:
// refactoring the declaration (e.g. `export const` -> `export let`, or
// reformatting it) passed lint, tests and the whole validate gate, and only
// broke later when deploy.sh ran on push to main — its `after === before` guard
// exits 1 and the auto-deploy fails. This test pulls the ACTUAL regex out of
// deploy.sh (owning no copy of its own, so it stays a true binding of the two
// files) and asserts it still matches the declaration exactly once.

const root = new URL("../", import.meta.url);
const deploySh = await readFile(new URL("deploy.sh", root), "utf8");
const commands = await readFile(new URL("js/commands.js", root), "utf8");

// The regex source between `before.replace(/` and the distinctive replacement
// literal `/, "export const LAST_DEPLOY = "`. Non-greedy, and that literal
// appears once, so the capture is exactly deploy.sh's pattern body — including
// its escaped `\/\/` comment handling.
const STAMP_REGEX_IN_DEPLOY =
  /before\.replace\(\/(.*?)\/, "export const LAST_DEPLOY = "/;

test("deploy.sh still carries a LAST_DEPLOY stamping regex", () => {
  assert.match(
    deploySh,
    STAMP_REGEX_IN_DEPLOY,
    "deploy.sh no longer stamps LAST_DEPLOY the way this test expects — if the\n" +
      "stamping was intentionally reshaped, update the anchor here to match.",
  );
});

test("deploy.sh's stamping regex matches js/commands.js exactly once", () => {
  const [, body] = deploySh.match(STAMP_REGEX_IN_DEPLOY);
  // Reconstruct deploy.sh's own pattern (global, so we can count matches) and
  // apply it to the real declaration. A refactor of the LAST_DEPLOY line that
  // deploy.sh's regex no longer matches fails here, at gate time, instead of
  // aborting the deploy after merge.
  const stampRegex = new RegExp(body, "g");
  const matches = commands.match(stampRegex) ?? [];
  assert.equal(
    matches.length,
    1,
    `deploy.sh's LAST_DEPLOY regex matched ${matches.length} time(s) in ` +
      "js/commands.js (expected exactly 1) — the stamp would " +
      (matches.length === 0 ? "fail the deploy" : "be ambiguous") +
      ". Keep the declaration in the `export const LAST_DEPLOY = <int>; // <ISO>` form.",
  );
});
