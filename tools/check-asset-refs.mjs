// Guard that every local asset the shipped markup and manifest reference actually
// exists as a tracked file. Before this, only assets/og-image.png was bound to
// the markup (tools/check-og-image.mjs opens it); every other referenced image,
// stylesheet or module — the favicons, the apple-touch icon, the manifest icons,
// css/style.css, the js/ modules — had no existence check. Renaming
// assets/icon-192.png without updating the reference passed the whole gate (the
// renamed file still ships and classifies) yet 404s in the browser / on install.
// This closes that gap for every <link href>, <script src> and manifest icon src.
// Run from validate.sh and deploy.yml.
//
// Dependency-free on purpose: the shared HTML scanner plus JSON.parse over our
// own two files, and git ls-files for the tracked set the deploy actually ships
// (a file present on disk but untracked would not ship, so tracked is the right
// bar — the same one tools/check-deploy-assets.mjs uses).
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findTags } from "./html-tags.mjs";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const manifestText = await readFile(
  new URL("manifest.webmanifest", root),
  "utf8",
);

// The repo-relative path a reference points at, or undefined when it is not a
// local file this repo ships: an absolute/scheme URL (https:, mailto:, tel:) or
// a protocol-relative one points off-repo; a fragment is in-page; a bare root or
// a directory path resolves to a listing, not a file. A leading "/" (absolute
// from the web root) is normalised to a repo-relative path.
function localPath(ref) {
  if (!ref) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith("//"))
    return undefined;
  if (ref.startsWith("#")) return undefined;
  const path = ref.split(/[?#]/)[0].replace(/^\//, "");
  if (path === "" || path.endsWith("/")) return undefined;
  return path;
}

// Every local reference to check, with a human-readable source for the error.
const refs = [];
for (const link of findTags(html, "link")) {
  const href = link.attrs.get("href");
  const path = localPath(href);
  if (path) refs.push({ path, where: `index.html <link href="${href}">` });
}
for (const script of findTags(html, "script")) {
  const src = script.attrs.get("src");
  const path = localPath(src);
  if (path) refs.push({ path, where: `index.html <script src="${src}">` });
}
for (const icon of JSON.parse(manifestText).icons ?? []) {
  const path = localPath(icon.src);
  if (path)
    refs.push({ path, where: `manifest.webmanifest icon src="${icon.src}"` });
}

// Tracked files, straight from git (NUL-delimited so a path with a space or
// non-ASCII byte is not C-quoted), matching how deploy.sh enumerates the set.
const tracked = new Set(
  execFileSync("git", ["ls-files", "-z"], {
    cwd: fileURLToPath(root),
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean),
);

let failed = false;
for (const { path, where } of refs) {
  if (!tracked.has(path)) {
    failed = true;
    console.error(
      `check-asset-refs: ${where} → "${path}" is not a tracked file (missing, renamed, or untracked?)`,
    );
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(
    `check-asset-refs: all ${refs.length} referenced local assets exist and are tracked`,
  );
}
