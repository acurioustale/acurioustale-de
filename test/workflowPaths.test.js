import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  countPathsIgnoreBlocks,
  parsePathsIgnore,
} from "../tools/workflow-paths.mjs";

const root = new URL("../", import.meta.url);

test("counts the paths-ignore blocks a workflow declares", () => {
  assert.equal(countPathsIgnoreBlocks("on:\n  push:\n    branches:\n"), 0);
  assert.equal(countPathsIgnoreBlocks("    paths-ignore:\n      - a\n"), 1);
  assert.equal(
    countPathsIgnoreBlocks("    paths-ignore:\n      - a\n    paths-ignore:\n"),
    2,
  );
});

test("an inline value is not the block form this reader covers", () => {
  // `paths-ignore: [a, b]` is a flow sequence, which parsePathsIgnore would
  // read as an empty block. Neither half may mistake it for the form it knows.
  const flow = "    paths-ignore: ['**.md']\n";
  assert.equal(countPathsIgnoreBlocks(flow), 0);
  assert.deepEqual(parsePathsIgnore(flow), []);
});

test("reads the list items, stripping either quote style", () => {
  const workflow = [
    "on:",
    "  push:",
    "    paths-ignore:",
    '      - "**.md"',
    "      - 'test/**'",
    "      - tools/**",
    "jobs:",
  ].join("\n");
  assert.deepEqual(parsePathsIgnore(workflow), [
    "**.md",
    "test/**",
    "tools/**",
  ]);
});

test("skips comments and blank lines between items", () => {
  // The regression: a blank line is legal between items, and ending the block
  // there returned a truncated list whose absent entries the guard then
  // reported as missing from the workflow.
  const workflow = [
    "    paths-ignore:",
    "      # never shipped",
    '      - "**.md"',
    "",
    "      # nor is the test suite",
    "      - test/**",
    "    branches: [main]",
  ].join("\n");
  assert.deepEqual(parsePathsIgnore(workflow), ["**.md", "test/**"]);
});

test("the first non-item line ends the block", () => {
  const workflow = [
    "    paths-ignore:",
    "      - test/**",
    "    branches:",
    "      - main",
  ].join("\n");
  // `- main` belongs to `branches:`, not to the list we asked for.
  assert.deepEqual(parsePathsIgnore(workflow), ["test/**"]);
});

test("lines before the key are not read as items", () => {
  const workflow = [
    "on:",
    "  push:",
    "    - stray",
    "    paths-ignore:",
    "      - test/**",
  ].join("\n");
  assert.deepEqual(parsePathsIgnore(workflow), ["test/**"]);
});

test("a workflow with no paths-ignore yields no patterns", () => {
  assert.deepEqual(
    parsePathsIgnore("on:\n  push:\n    branches: [main]\n"),
    [],
  );
});

test("reads the real deploy.yml as a single block with entries", async () => {
  // Binds the helper to the file it exists to read, so a layout change in the
  // workflow fails here rather than silently shrinking the guard's list.
  const workflow = await readFile(
    new URL(".github/workflows/deploy.yml", root),
    "utf8",
  );
  assert.equal(countPathsIgnoreBlocks(workflow), 1);
  const patterns = parsePathsIgnore(workflow);
  assert.ok(
    patterns.length > 0,
    "deploy.yml should ignore some dev-only paths",
  );
  assert.ok(
    patterns.every((p) => p === p.trim() && !/^["']|["']$/.test(p)),
    "patterns should come back trimmed and unquoted",
  );
});
