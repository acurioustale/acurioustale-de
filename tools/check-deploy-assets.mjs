// Bind deploy.sh's DEPLOY_ASSETS array to the tracked deploy set so the two can't
// drift. deploy.sh stages exactly DEPLOY_ASSETS and mirrors that directory with
// `rsync --delete`, so a site file forgotten from the array is never shipped (and
// if it once shipped, --delete prunes it from the live web root) — with nothing
// to catch it. This guard forces every tracked file to be classified exactly
// once: either it ships (covered by a DEPLOY_ASSETS entry) or it is explicitly
// dev-only. A file that is neither fails the build, so adding a new asset means
// consciously deciding ship-or-not rather than silently defaulting to "not
// shipped". Run from validate.sh and deploy.yml.
//
// Dependency-free on purpose: it parses the array straight out of deploy.sh (the
// one source of truth the deploy itself reads) and lists tracked files via git,
// rather than hardcoding a second copy of the set here.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);

const deploySh = await readFile(new URL("deploy.sh", root), "utf8");

// This parser reads exactly one `DEPLOY_ASSETS=( ... )` literal. If deploy.sh
// ever grows a second assignment or an append (`DEPLOY_ASSETS+=( ... )`), the
// single match below would cover only part of the shipped set and the
// completeness check would then pass on a partial list — silently. Assert the
// single-array assumption up front so any such refactor is a loud failure that
// sends the maintainer here to extend the parser, rather than under-verifying.
const mutations = deploySh.match(/^\s*DEPLOY_ASSETS\s*\+?=\(/gm) ?? [];
if (mutations.length > 1 || mutations.some((m) => m.includes("+="))) {
  console.error(
    "check-deploy-assets: expected exactly one `DEPLOY_ASSETS=( ... )` array in\n" +
      "  deploy.sh, but found a second assignment or a `+=` append this parser\n" +
      "  does not read. Extend the parser so it covers the whole shipped set.",
  );
  process.exit(1);
}

// Pull the entries out of the `DEPLOY_ASSETS=( ... )` array. Whitespace-separated
// tokens (the array spans a single line in deploy.sh) with any inline comment
// stripped, so this reads the same list the deploy stages.
const arrayMatch = deploySh.match(/DEPLOY_ASSETS=\(([^)]*)\)/);
if (!arrayMatch) {
  console.error(
    "check-deploy-assets: could not find a DEPLOY_ASSETS=( ... ) array in deploy.sh",
  );
  process.exit(1);
}
const entries = arrayMatch[1]
  .replace(/#.*$/gm, "")
  .split(/\s+/)
  .filter(Boolean);

// Tracked files, straight from git — the same enumeration validate.sh uses for
// the shell and SVG checks, so a newly committed file is seen here too.
const tracked = execFileSync("git", ["ls-files"], {
  cwd: fileURLToPath(root),
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

// A path ships when it equals a DEPLOY_ASSETS entry or lives under one of the
// directory entries (deploy.sh stages the tracked files under those via
// `git ls-files`).
function isShipped(path) {
  return entries.some(
    (entry) => path === entry || path.startsWith(entry + "/"),
  );
}

// Everything the site does NOT ship: tooling, tests, docs and config. Kept as an
// explicit allowlist so adding a genuinely new kind of top-level file trips the
// guard and forces a ship-or-not decision, while the common case (another test,
// tool or doc) is already covered by a directory or extension rule and needs no
// edit here.
const DEV_ONLY_DIRS = [
  ".claude/",
  ".github/",
  "e2e/",
  "ops/",
  "test/",
  "tools/",
];
const DEV_ONLY_EXTENSIONS = [".md"];
const DEV_ONLY_FILES = new Set([
  ".editorconfig",
  ".git-blame-ignore-revs",
  ".gitignore",
  ".markdownlint-cli2.jsonc",
  ".prettierignore",
  ".stylelintrc.json",
  ".tool-versions",
  "LICENSE",
  "deploy.sh",
  "eslint.config.mjs",
  "lychee.toml",
  "og-image.src.svg",
  "package-lock.json",
  "package.json",
  "playwright.config.js",
  "svgo.config.mjs",
  "validate.sh",
]);

function isDevOnly(path) {
  return (
    DEV_ONLY_DIRS.some((dir) => path.startsWith(dir)) ||
    DEV_ONLY_EXTENSIONS.some((ext) => path.endsWith(ext)) ||
    DEV_ONLY_FILES.has(path)
  );
}

let failed = false;

// Every DEPLOY_ASSETS entry must actually exist (a rename or typo would otherwise
// abort the deploy's `cp -R` with a less obvious error, or silently stop shipping).
const missingEntries = entries.filter(
  (entry) => !tracked.some((f) => f === entry || f.startsWith(entry + "/")),
);
if (missingEntries.length) {
  failed = true;
  console.error(
    "check-deploy-assets: DEPLOY_ASSETS lists entries git does not track:",
  );
  for (const entry of missingEntries) console.error(`  ${entry}`);
}

// A file marked both shipped and dev-only means the dev-only allowlist is hiding
// a file the deploy actually ships — a classification bug worth surfacing.
const conflicting = tracked.filter((f) => isShipped(f) && isDevOnly(f));
if (conflicting.length) {
  failed = true;
  console.error(
    "check-deploy-assets: files are both shipped and marked dev-only (fix the dev-only list):",
  );
  for (const f of conflicting) console.error(`  ${f}`);
}

// The core check: no tracked file may be left unclassified.
const unclassified = tracked.filter((f) => !isShipped(f) && !isDevOnly(f));
if (unclassified.length) {
  failed = true;
  console.error(
    "check-deploy-assets: tracked files are neither shipped nor marked dev-only.\n" +
      "  Add each to DEPLOY_ASSETS in deploy.sh (to ship it) or to the dev-only\n" +
      "  lists in tools/check-deploy-assets.mjs (to exclude it):",
  );
  for (const f of unclassified) console.error(`  ${f}`);
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(
    `check-deploy-assets: DEPLOY_ASSETS covers every shipped file (${tracked.length} tracked files classified)`,
  );
}
