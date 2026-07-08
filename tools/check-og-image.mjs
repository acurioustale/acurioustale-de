// Guard the Open Graph share image against the most common drift: a wrong-size
// or missing share image. Both the file AND its expected dimensions come from
// the markup — the path from the og:image URL, the size from the
// og:image:width/height metas — so the guard always checks the image the page
// actually advertises, with no hardcoded copy of the name or the size to drift
// from. Reads the PNG IHDR chunk directly (no image library) and fails on a
// mismatch. Run from validate.sh and deploy.yml.
//
// This does NOT catch content drift (editing og-image.src.svg without
// re-rendering the PNG) — that stays a manual step, see the README.
import { open, readFile } from "node:fs/promises";
import { findTags } from "./html-tags.mjs";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

// The dimension the page declares for the OG image, read from the meta tag so
// the guard and the markup can't disagree about the intended size. Returns the
// parsed integer, or undefined after reporting a specific failure: a missing tag
// and a present-but-unparseable value (e.g. content="1200px") are distinct
// errors, so the message points at the real problem instead of always blaming a
// missing tag when the tag is actually there.
function ogDimension(property) {
  // The first live <meta property=…>, read the same way the CSP guard reads its
  // meta (`const [cspMeta] = findTags(…)`): a browser enforces the first, so
  // validating it can't miss a later one. A missing tag and a present-but-
  // unparseable value are distinct errors.
  const [tag] = findTags(html, "meta", { property });
  if (!tag) {
    console.error(
      `check-og-image: index.html declares no ${property} to check against`,
    );
    process.exitCode = 1;
    return undefined;
  }
  const content = tag.attrs.get("content") ?? "";
  if (/^\d+$/.test(content.trim())) return Number(content.trim());
  console.error(
    `check-og-image: index.html ${property} is "${content}", not a bare integer`,
  );
  process.exitCode = 1;
  return undefined;
}

// The local file og:image points at, derived from the meta so the guard checks
// the image the markup actually advertises. Hardcoding "assets/og-image.png"
// meant repointing og:image left the guard validating the stale file (and the
// newly-advertised one unchecked). og:image is an absolute URL per the OG spec;
// take its path (tolerating a relative value) and resolve it under the repo
// root. Returns { url, rel } or undefined after reporting a missing tag.
function ogImageTarget() {
  const [tag] = findTags(html, "meta", { property: "og:image" });
  const content = tag?.attrs.get("content");
  if (!content) {
    console.error("check-og-image: index.html declares no og:image to check");
    process.exitCode = 1;
    return undefined;
  }
  let path;
  try {
    path = new URL(content).pathname; // absolute URL → its path
  } catch {
    path = content; // already a relative path
  }
  const rel = path.replace(/^\//, "");
  return { url: new URL(`../${rel}`, import.meta.url), rel };
}

const width = ogDimension("og:image:width");
const height = ogDimension("og:image:height");
const target = ogImageTarget();

if (width !== undefined && height !== undefined && target !== undefined) {
  const { url: path, rel } = target;

  // A repointed og:image whose file does not exist reports a clean error rather
  // than crashing on the open (the guard exists to catch exactly this drift).
  let file;
  try {
    file = await open(path, "r");
  } catch {
    console.error(
      `check-og-image: og:image points to ${rel}, which does not exist`,
    );
    process.exitCode = 1;
  }
  if (file) {
    const buf = Buffer.alloc(24);
    let bytesRead;
    try {
      ({ bytesRead } = await file.read(buf, 0, 24, 0));
    } finally {
      await file.close();
    }

    // PNG: 8-byte signature, then the IHDR chunk (length+type) with width and
    // height as big-endian uint32 at byte offsets 16 and 20.
    const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytesRead < 24 || !buf.subarray(0, 8).equals(SIGNATURE)) {
      console.error(`check-og-image: ${rel} is not a valid PNG`);
      process.exitCode = 1;
    } else if (buf.subarray(12, 16).toString("ascii") !== "IHDR") {
      console.error(`check-og-image: ${rel} missing IHDR chunk`);
      process.exitCode = 1;
    } else {
      const actualWidth = buf.readUInt32BE(16);
      const actualHeight = buf.readUInt32BE(20);

      if (actualWidth !== width || actualHeight !== height) {
        console.error(
          `check-og-image: ${rel} is ${actualWidth}x${actualHeight}, but index.html declares ${width}x${height}`,
        );
        process.exitCode = 1;
      } else {
        console.log(
          `check-og-image: ${rel} matches the declared ${width}x${height}`,
        );
      }
    }
  }
}
