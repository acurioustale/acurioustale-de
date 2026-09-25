import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The README and CLAUDE.md each spell out the deploy set in prose, and
// deploy.sh's DEPLOY_ASSETS array is what actually ships. The prose drifted once
// already (CLAUDE.md left out `.well-known/` after security.txt started
// shipping), so bind each listing to the array rather than trusting a reader to
// notice. tools/check-deploy-assets.mjs binds the array to the tracked files;
// this binds the docs to the array.

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

// The same anchored single-array read check-deploy-assets.mjs does, so a
// commented-out example above the real array is not taken for it.
function deployAssets() {
  const match = read("deploy.sh").match(/^\s*DEPLOY_ASSETS=\(([^)]*)\)/m);
  assert.ok(match, "expected a DEPLOY_ASSETS=( ... ) array in deploy.sh");
  return match[1].replace(/#.*$/gm, "").split(/\s+/).filter(Boolean).sort();
}

// The code spans of the prose listing that follows "extracts the deploy set",
// up to where it says "from `HEAD`", with a directory's trailing slash dropped
// to compare against the array's bare names.
function documentedSet(doc) {
  const text = read(doc).replace(/\s+/g, " ");
  const match = text.match(/extracts the deploy set(.*?)from `HEAD`/);
  assert.ok(match, `expected a deploy-set listing in ${doc}`);
  return [...match[1].matchAll(/`([^`]+)`/g)]
    .map((m) => m[1].replace(/\/$/, ""))
    .sort();
}

for (const doc of ["README.md", "CLAUDE.md"]) {
  test(`${doc} lists exactly the deploy set deploy.sh ships`, () => {
    assert.deepEqual(documentedSet(doc), deployAssets());
  });
}
