// Guard that every local asset the shipped markup, stylesheets and manifest
// reference actually exists as a tracked file. Before this, only
// assets/og-image.png was bound to the markup (tools/check-og-image.mjs opens
// it); every other referenced image, stylesheet or module — the favicons, the
// apple-touch icon, the manifest icons, css/style.css, the js/ modules — had no
// existence check. Renaming assets/icon-192.png without updating the reference
// passed the whole gate (the renamed file still ships and classifies) yet 404s
// in the browser / on install.
//
// What counts as a reference lives in tools/shared/asset-refs.mjs (with its own test),
// not in a private regex here: <link>/<script>/<img>/<source>/<video>/<audio>
// URL attributes including srcset lists, the share-image metas (og:image,
// twitter:image — absolute, same-origin URLs, which an attribute-only scan
// missed entirely), url() targets in each linked stylesheet, and the manifest's
// icons and screenshots. Run from validate.sh and deploy.yml.
//
// Dependency-free on purpose: the shared scanners plus JSON.parse over our own
// two files, and git ls-files for the tracked set the deploy actually ships (a
// file present on disk but untracked would not ship, so tracked is the right bar
// — the same one tools/check-deploy-assets.mjs uses).
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findTags } from "./shared/html-tags.mjs";
import {
  cssRefs,
  declaredOrigins,
  htmlRefs,
  localPath,
  manifestRefs,
} from "./shared/asset-refs.mjs";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const manifestText = await readFile(
  new URL("manifest.webmanifest", root),
  "utf8",
);

const origins = declaredOrigins(html);

// Every local reference to check, with a human-readable source for the error.
const refs = [
  ...htmlRefs(html, origins),
  ...manifestRefs(manifestText, origins),
];

// Stylesheets the page links get scanned too, so a url() pointing at a renamed
// image fails here rather than in the browser. One level deep: the site links a
// single stylesheet that @imports nothing, and a guard that silently recursed
// would need cycle handling it has no input for. A stylesheet that cannot be
// read is not skipped — it is already reported as a missing reference above.
for (const link of findTags(html, "link", { rel: "stylesheet" })) {
  const path = localPath(link.attrs.get("href"), { origins });
  if (!path) continue;
  let css;
  try {
    css = await readFile(new URL(path, root), "utf8");
  } catch {
    continue;
  }
  refs.push(...cssRefs(css, path, origins));
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
