import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withoutOverride,
  advisorySummary,
  report,
} from "../tools/overrides.mjs";

test("withoutOverride drops the named entry and keeps the rest", () => {
  const pkg = {
    name: "site",
    overrides: { "markdown-it": "^14.2.0", "smol-toml": "^1.7.1" },
  };
  assert.deepEqual(withoutOverride(pkg, "markdown-it"), {
    name: "site",
    overrides: { "smol-toml": "^1.7.1" },
  });
});

test("withoutOverride does not mutate the manifest it is given", () => {
  // The check loops over every override, so a mutating trim would make each
  // pass inherit the last one's removal and audit the wrong tree.
  const pkg = { overrides: { a: "1", b: "2" } };
  withoutOverride(pkg, "a");
  assert.deepEqual(pkg.overrides, { a: "1", b: "2" });
});

test("withoutOverride removes the overrides key when the entry was the last", () => {
  // npm reads a declared-but-empty `overrides` differently from an absent one,
  // and the tree we mean to test is the one with the override gone.
  const trimmed = withoutOverride({ name: "site", overrides: { a: "1" } }, "a");
  assert.equal("overrides" in trimmed, false);
  assert.deepEqual(trimmed, { name: "site" });
});

test("withoutOverride tolerates a manifest with no overrides at all", () => {
  assert.deepEqual(withoutOverride({ name: "site" }, "a"), { name: "site" });
});

test("advisorySummary returns npm's count line, trimmed", () => {
  const output = "\nfixed 0 of 3\n\n2 high severity vulnerabilities  \n";
  assert.equal(advisorySummary(output), "2 high severity vulnerabilities");
});

test("advisorySummary matches the singular npm prints for one advisory", () => {
  assert.equal(
    advisorySummary("1 moderate severity vulnerability"),
    "1 moderate severity vulnerability",
  );
});

test("advisorySummary reads the count line whatever its case", () => {
  assert.equal(
    advisorySummary("FOUND 2 VULNERABILITIES"),
    "FOUND 2 VULNERABILITIES",
  );
});

test("advisorySummary is undefined when no line states a count", () => {
  assert.equal(advisorySummary("up to date, audited 1 package"), undefined);
});

test("report calls an override stale when its tree audits clean", () => {
  const out = report([{ name: "markdown-it", advisories: null }]);
  assert.match(out, /markdown-it: STALE - the tree is clean without it\./);
  assert.match(out, /Remove this override from package\.json/);
  assert.match(out, /markdown-it\.$/);
});

test("report quotes the remaining advisories for a load-bearing override", () => {
  const out = report([
    { name: "smol-toml", advisories: "\n2 high severity vulnerabilities\n" },
  ]);
  assert.match(out, /smol-toml: still load-bearing - 2 high severity/);
  assert.match(out, /Every override is still earning its place\./);
});

test("report falls back when the audit output states no count", () => {
  // A dirty tree whose output we could not summarise is still load-bearing —
  // the exit status decided that, not the string — so say so rather than
  // printing an empty reason.
  const out = report([{ name: "smol-toml", advisories: "something else" }]);
  assert.match(out, /smol-toml: still load-bearing - advisories remain/);
});

test("report pluralises the removal line for more than one stale override", () => {
  const out = report([
    { name: "a", advisories: null },
    { name: "b", advisories: "1 low severity vulnerability" },
    { name: "c", advisories: null },
  ]);
  assert.match(
    out,
    /Remove these overrides from package\.json and run npm install: a, c\./,
  );
});

test("report says so when there is nothing to remove", () => {
  assert.match(report([]), /Every override is still earning its place\./);
});
