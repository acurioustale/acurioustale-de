// Bind deploy.sh's DEPLOY_ASSETS array to the tracked deploy set so the two can't
// drift. deploy.sh stages exactly DEPLOY_ASSETS and mirrors that directory with
// `rsync --delete`, so a site file forgotten from the array is never shipped (and
// if it once shipped, --delete prunes it from the live web root) — with nothing
// to catch it. This guard forces every tracked file to be classified exactly
// once: either it ships (covered by a DEPLOY_ASSETS entry) or it is explicitly
// dev-only. A file that is neither fails the build, so adding a new asset means
// consciously deciding ship-or-not rather than silently defaulting to "not
// shipped". On top of that it binds deploy.yml's `paths-ignore` (the list that
// skips a needless redeploy on dev-only changes) to the same classification, so
// that list can't drift into skipping a real deploy or redeploying for nothing.
// Run from validate.sh and deploy.yml.
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
// stripped, so this reads the same list the deploy stages. Anchored to the start
// of a line (like the single-assignment guard above), so a `# DEPLOY_ASSETS=(…)`
// example in a comment or docstring above the real array is not grabbed as the
// list — an unanchored match would read the first occurrence anywhere, and the
// two parses would then disagree about which line is authoritative.
const arrayMatch = deploySh.match(/^\s*DEPLOY_ASSETS=\(([^)]*)\)/m);
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

// Tracked files, straight from git. NUL-delimited (`-z`) like deploy.sh's own
// staging: without it git C-quotes any path with a space or non-ASCII byte
// (`"assets/caf\303\251.png"`), which then matches neither a ship rule nor a
// dev-only rule and fails the build spuriously on a file that genuinely ships.
const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: fileURLToPath(root),
  encoding: "utf8",
})
  .split("\0")
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

// ── Bind deploy.yml's paths-ignore to the same dev-only classification ──
// deploy.yml skips the post-merge redeploy (and its LAST_DEPLOY re-stamp, which
// resets the terminal's `uptime`) when a push to main touches only files the site
// never ships, via an `on.push.paths-ignore` list. That YAML list can't be
// computed from the classification above, so it drifts: a dev-only file missing
// from it needlessly redeploys, and — worse — a shipped file wrongly listed there
// would SKIP a real deploy. Bind the two so neither can happen: every tracked
// file must be ignored by the workflow exactly when it is dev-only.
const workflow = await readFile(
  new URL(".github/workflows/deploy.yml", root),
  "utf8",
);

// Exactly one `paths-ignore:` block is expected (under on.push). More than one
// means the layout changed and this single-block read would cover only part of
// it, so fail loudly rather than under-checking (like the DEPLOY_ASSETS
// single-assignment guard above).
const ignoreBlocks = workflow.match(/^\s*paths-ignore:\s*$/gm) ?? [];
if (ignoreBlocks.length !== 1) {
  console.error(
    "check-deploy-assets: expected exactly one `paths-ignore:` block in\n" +
      `  .github/workflows/deploy.yml, found ${ignoreBlocks.length}. Extend the\n` +
      "  parser to read them all before trusting this check.",
  );
  process.exit(1);
}

// The list items following `paths-ignore:` — each `- "<glob>"` line, quotes
// stripped — up to the first line that is not a list item (the next YAML key).
// Comment lines inside the block are skipped.
const ignorePatterns = [];
let inIgnoreBlock = false;
for (const line of workflow.split("\n")) {
  if (/^\s*paths-ignore:\s*$/.test(line)) {
    inIgnoreBlock = true;
    continue;
  }
  if (!inIgnoreBlock) continue;
  if (/^\s*#/.test(line)) continue; // a comment inside the block
  const item = line.match(/^\s*-\s*(.+?)\s*$/);
  if (!item) break; // first non-item line ends the block
  ignorePatterns.push(item[1].replace(/^["']|["']$/g, ""));
}

// Translate a paths-ignore glob to a predicate over a repo-relative path, for the
// three shapes this workflow uses: a trailing `/**` directory prefix, a leading
// `**.<ext>` suffix, and an exact file path. Each mirrors how the classification
// above matches (DEV_ONLY_DIRS by prefix, DEV_ONLY_EXTENSIONS by suffix,
// DEV_ONLY_FILES exactly). An unfamiliar shape is a hard error rather than a
// silently-wrong match.
function ignoreMatcher(pattern) {
  if (pattern.endsWith("/**")) {
    const dir = pattern.slice(0, -"/**".length);
    return (path) => path.startsWith(dir + "/");
  }
  if (pattern.startsWith("**.")) {
    const suffix = pattern.slice("**".length); // ".md"
    return (path) => path.endsWith(suffix);
  }
  if (!/[*?[\]]/.test(pattern)) {
    return (path) => path === pattern;
  }
  console.error(
    `check-deploy-assets: unsupported paths-ignore pattern "${pattern}" in\n` +
      "  .github/workflows/deploy.yml — extend ignoreMatcher to translate it.",
  );
  process.exit(1);
}
const ignoreMatchers = ignorePatterns.map(ignoreMatcher);
const ignoredByWorkflow = (path) => ignoreMatchers.some((m) => m(path));

// Every tracked file must be ignored by the workflow exactly when it is dev-only.
const deployDrift = tracked.filter(
  (f) => ignoredByWorkflow(f) !== isDevOnly(f),
);
if (deployDrift.length) {
  failed = true;
  console.error(
    "check-deploy-assets: deploy.yml paths-ignore has drifted from the dev-only\n" +
      "  classification. A shipped file listed there would SKIP a real deploy; a\n" +
      "  dev-only file missing there needlessly redeploys and resets `uptime`:",
  );
  for (const f of deployDrift) {
    console.error(
      isDevOnly(f)
        ? `  ${f}: dev-only but NOT ignored — add it to deploy.yml paths-ignore`
        : `  ${f}: shipped but IGNORED — remove it from deploy.yml paths-ignore`,
    );
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(
    `check-deploy-assets: DEPLOY_ASSETS and deploy.yml paths-ignore both match the dev-only split (${tracked.length} tracked files classified)`,
  );
}
