// The `on.push.paths-ignore` list out of a workflow file.
//
// deploy.yml uses that list to skip a redeploy when a push touches only files
// the site never ships, and tools/check-deploy-assets.mjs binds it to the same
// dev-only classification it checks DEPLOY_ASSETS against. Reading it is a
// parsing rule with its own edge cases, so it lives here with a test rather
// than as a private regex inside that guard.
//
// This is a deliberately small reader, not a YAML parser: it knows the one
// shape our workflows write (a block scalar key, then `- "<glob>"` items) and
// leaves anything else to fail loudly at the call site.

// Matches the `paths-ignore:` key line itself — the key alone on its line, with
// no inline value, which is what introduces the block form we read below.
const KEY = /^\s*paths-ignore:\s*$/;

// How many `paths-ignore:` blocks the workflow declares.
//
// The reader below covers exactly one. A caller that finds another number must
// stop rather than read part of the list, so expose the count instead of
// letting each caller re-derive the key pattern.
export function countPathsIgnoreBlocks(workflow) {
  return (workflow.match(new RegExp(KEY.source, "gm")) ?? []).length;
}

// The globs listed under the first `paths-ignore:` key, quotes stripped.
//
// The block runs to the first line that is neither a list item nor skippable —
// in practice the next YAML key, which ends it. Comments and blank lines are
// skipped rather than ending it: YAML allows both between items, and treating
// either as the end would return a truncated list, which reads at the call site
// as every entry below the gap being absent from the workflow.
export function parsePathsIgnore(workflow) {
  const patterns = [];
  let inBlock = false;
  for (const line of workflow.split("\n")) {
    if (KEY.test(line)) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    if (/^\s*#/.test(line)) continue; // a comment inside the block
    if (/^\s*$/.test(line)) continue; // a blank line between items
    const item = line.match(/^\s*-\s*(.+?)\s*$/);
    if (!item) break; // first non-item line ends the block
    patterns.push(item[1].replace(/^["']|["']$/g, ""));
  }
  return patterns;
}
