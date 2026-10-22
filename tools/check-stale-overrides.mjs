// Answer one question about every entry in package.json's `overrides`: is it
// still doing the job it was added for?
//
// An override is how you escape a transitive advisory when the only alternative
// npm offers is a semver-major downgrade of the package that pulls it in. That
// makes it a fix with no natural end: upstream eventually repins or releases,
// the advisory stops applying, and the override stays behind — silently holding
// a package back, long after the thing it was protecting against is gone. The
// repo's own rule says to keep an override only while it is still raising the
// floor; this is what checks that, instead of it being re-derived by hand.
//
// How it decides, and why not a semver comparison: the question is not "does
// this override change the resolved version". A stale pin very much does — that
// is exactly how it holds a major back. The question is whether removing it
// lets in an advisory the tree is free of today. So resolve the current tree
// once and audit it, then for each override in turn resolve a lockfile with that
// single entry removed, audit that, and compare. Nothing new means upstream has
// caught up and the entry can go; anything new is named as the advisory still
// keeping it alive. Comparing against the current tree rather than demanding a
// clean audit is what keeps an unrelated, unfixable advisory elsewhere in the
// tree from making every pin look load-bearing.
//
// Reports only, and exits zero either way: a stale override is untidy, never
// urgent. Run from the non-gating `audit` workflow, never from validate.sh or
// the gate — it costs a resolution and a registry round-trip per override.
//
// The decisions that don't need a subprocess live in tools/shared/overrides.mjs, with a
// test; this file is the part that has to shell out.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withoutOverride,
  parseAudit,
  introducedAdvisories,
  report,
  isAdvisoryFailure,
} from "./shared/overrides.mjs";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const names = Object.keys(pkg.overrides ?? {});

if (names.length === 0) {
  console.log("check-stale-overrides: no overrides declared, nothing to check");
  process.exit(0);
}

// Resolve a lockfile for `manifest` and audit it, as parseAudit's Map of
// advisories.
//
// --package-lock-only keeps this to a resolution plus a registry query: nothing
// is installed and no node_modules is ever written. It runs in a temp directory
// so the repo's own lockfile is never touched — and so the current tree is
// resolved the same way as every trimmed one, rather than read from a lockfile
// that may be older than a fresh resolution, which would show up as a
// difference that has nothing to do with the override.
function auditTree(manifest) {
  const dir = mkdtempSync(join(tmpdir(), "stale-override-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2));
    execFileSync("npm", ["install", "--package-lock-only", "--silent"], {
      cwd: dir,
      stdio: "ignore",
    });
    let stdout;
    try {
      stdout = execFileSync("npm", ["audit", "--json"], {
        cwd: dir,
        stdio: "pipe",
      });
    } catch (err) {
      // Advisories are a result rather than a failure; anything else (a
      // resolution error, a registry outage, npm missing) is rethrown, so a
      // broken check can never read as a verdict. Which is which is
      // isAdvisoryFailure's call, and parseAudit's for the `--json` error
      // report that gets past it — see there for why both matter.
      if (!isAdvisoryFailure(err)) throw err;
      stdout = err.stdout;
    }
    return parseAudit(stdout.toString());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("check-stale-overrides: testing each override without itself\n");
const current = auditTree(pkg);
console.log(
  report(
    names.map((name) => ({
      name,
      introduced: introducedAdvisories(
        current,
        auditTree(withoutOverride(pkg, name)),
      ),
    })),
  ),
);
