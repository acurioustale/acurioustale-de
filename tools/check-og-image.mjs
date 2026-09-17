// Guard the Open Graph share image against the most common drift: a wrong-size
// or missing share image. Both the file AND its expected dimensions come from
// the markup — the path from the og:image URL, the size from the
// og:image:width/height metas — so the guard always checks the image the page
// actually advertises, with no hardcoded copy of the name or the size to drift
// from. A guard holding its own 1200x630, or its own filename, is a second
// declaration: repoint the meta and it passes while asserting the old one.
//
// The reading is in tools/shared/og-dimensions.mjs (tested there, and mirrored
// to the sibling repo) rather than inline here, PNG header included — a binary
// header parse earns a test at least as much as a regex does.
//
// This does NOT catch content drift (editing og-image.src.svg without
// re-rendering the PNG) — that stays a manual step, see the README.
import { readFile } from "node:fs/promises";
import {
  declaredOgDimension,
  ogImagePath,
  pngDimensions,
} from "./shared/og-dimensions.mjs";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

// The dimension the page declares, read from the meta so the guard and the
// markup can't disagree about the intended size. Returns the parsed integer, or
// undefined after reporting a specific failure: a missing tag and a present-but-
// unparseable value (e.g. content="1200px") are distinct errors, so the message
// points at the real problem instead of always blaming a missing tag when the
// tag is actually there.
function ogDimension(property) {
  const { present, raw, value } = declaredOgDimension(html, property);
  if (value !== undefined) return value;
  console.error(
    present
      ? `check-og-image: index.html ${property} is "${raw}", not a bare integer`
      : `check-og-image: index.html declares no ${property} to check against`,
  );
  process.exitCode = 1;
  return undefined;
}

const width = ogDimension("og:image:width");
const height = ogDimension("og:image:height");

// The local file og:image points at, resolved under the repo root.
const rel = ogImagePath(html);
if (rel === undefined) {
  console.error("check-og-image: index.html declares no og:image to check");
  process.exitCode = 1;
}

if (width !== undefined && height !== undefined && rel !== undefined) {
  // A repointed og:image whose file does not exist reports a clean error rather
  // than crashing on the read (the guard exists to catch exactly this drift).
  let buf;
  try {
    buf = await readFile(new URL(`../${rel}`, import.meta.url));
  } catch {
    console.error(
      `check-og-image: og:image points to ${rel}, which does not exist`,
    );
    process.exitCode = 1;
  }

  if (buf) {
    let actual;
    try {
      actual = pngDimensions(buf);
    } catch (err) {
      console.error(`check-og-image: ${rel} is ${err.message}`);
      process.exitCode = 1;
    }

    if (actual) {
      if (actual.width !== width || actual.height !== height) {
        console.error(
          `check-og-image: ${rel} is ${actual.width}x${actual.height}, but index.html declares ${width}x${height}`,
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
