import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Bind deploy.sh's "Last login" banner stamping regex to index.html's login line
// so the two can't drift silently. On every deploy, deploy.sh rewrites the staged
// index.html by regex-replacing the "Last login: … on console" banner with the
// deploy instant, so the banner shows the same moment the uptime LAST_DEPLOY
// drives (the two would otherwise diverge — uptime is re-stamped every deploy, a
// hardcoded banner is not). Nothing else in the gate exercises that regex:
// reshaping the login markup (a reworded banner, a different suffix) passes lint,
// tests and the whole validate gate, and only breaks later when deploy.sh runs on
// push to main — its `afterHtml === beforeHtml` guard exits 1 and the auto-deploy
// fails. This test pulls the ACTUAL regex out of deploy.sh (owning no copy of its
// own, so it stays a true binding of the two files) and asserts it still matches
// the banner exactly once. Mirrors test/lastDeployStamp.test.js for the
// LAST_DEPLOY stamp.

const root = new URL("../", import.meta.url);
const deploySh = await readFile(new URL("deploy.sh", root), "utf8");
const html = await readFile(new URL("index.html", root), "utf8");

// The regex source between `beforeHtml.replace(/` and the distinctive replacement
// literal `/, "Last login: " + login`. Non-greedy, and that literal appears once,
// so the capture is exactly deploy.sh's banner pattern.
const STAMP_REGEX_IN_DEPLOY =
  /beforeHtml\.replace\(\/(.*?)\/, "Last login: " \+ login/;

test("deploy.sh still carries a Last login banner stamping regex", () => {
  assert.match(
    deploySh,
    STAMP_REGEX_IN_DEPLOY,
    "deploy.sh no longer stamps the Last login banner the way this test expects —\n" +
      "if the stamping was intentionally reshaped, update the anchor here to match.",
  );
});

test("deploy.sh's banner regex matches index.html exactly once", () => {
  const [, body] = deploySh.match(STAMP_REGEX_IN_DEPLOY);
  // Reconstruct deploy.sh's own pattern (global, so we can count matches) and
  // apply it to the real markup. A reshaped login line that deploy.sh's regex no
  // longer matches fails here, at gate time, instead of aborting the deploy after
  // merge.
  const stampRegex = new RegExp(body, "g");
  const matches = html.match(stampRegex) ?? [];
  assert.equal(
    matches.length,
    1,
    `deploy.sh's Last login regex matched ${matches.length} time(s) in ` +
      "index.html (expected exactly 1) — the stamp would " +
      (matches.length === 0 ? "fail the deploy" : "be ambiguous") +
      ". Keep the banner in the `Last login: <when> on console` form.",
  );
});
