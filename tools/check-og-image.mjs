// Guard the Open Graph share image against the most common drift: a wrong-size
// or missing assets/og-image.png. The expected dimensions are read from the
// page's own og:image:width/height meta tags, so the file is tied to what the
// markup declares — there is no second hardcoded copy of the size to drift from.
// Reads the PNG IHDR chunk directly (no image library) and fails on a mismatch.
// Run from validate.sh and deploy.yml.
//
// This does NOT catch content drift (editing og-image.src.svg without
// re-rendering the PNG) — that stays a manual step, see the README.
import { open, readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

// The dimension the page declares for the OG image, read from the meta tag so
// the guard and the markup can't disagree about the intended size. Returns the
// parsed integer, or undefined after reporting a specific failure: a missing tag
// and a present-but-unparseable value (e.g. content="1200px") are distinct
// errors, so the message points at the real problem instead of always blaming a
// missing tag when the tag is actually there.
function ogDimension(property) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!new RegExp(`property=["']${property}["']`, "i").test(tag)) continue;
    const match = tag.match(/content=["']([^"']*)["']/i);
    const value = match ? match[1].trim() : "";
    if (/^\d+$/.test(value)) return Number(value);
    console.error(
      `check-og-image: index.html ${property} is "${match ? match[1] : ""}", not a bare integer`,
    );
    process.exitCode = 1;
    return undefined;
  }
  console.error(
    `check-og-image: index.html declares no ${property} to check against`,
  );
  process.exitCode = 1;
  return undefined;
}

const width = ogDimension("og:image:width");
const height = ogDimension("og:image:height");

if (width !== undefined && height !== undefined) {
  const path = new URL("../assets/og-image.png", import.meta.url);

  const file = await open(path, "r");
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
    console.error("check-og-image: assets/og-image.png is not a valid PNG");
    process.exitCode = 1;
  } else if (buf.subarray(12, 16).toString("ascii") !== "IHDR") {
    console.error("check-og-image: assets/og-image.png missing IHDR chunk");
    process.exitCode = 1;
  } else {
    const actualWidth = buf.readUInt32BE(16);
    const actualHeight = buf.readUInt32BE(20);

    if (actualWidth !== width || actualHeight !== height) {
      console.error(
        `check-og-image: assets/og-image.png is ${actualWidth}x${actualHeight}, but index.html declares ${width}x${height}`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `check-og-image: assets/og-image.png matches the declared ${width}x${height}`,
      );
    }
  }
}
