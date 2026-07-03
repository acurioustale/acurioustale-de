// Parse the palette's `--token: light-dark(<light>, <dark>)` custom properties
// out of a stylesheet. css/style.css defines every colour once this way, so the
// guards that bind other surfaces to it — the two <meta name="theme-color"> tags
// (test/themeColor.test.js), the web-app manifest (test/manifestColor.test.js)
// and the older-browser fallback palette (test/themeFallback.test.js) — read
// their expected values from here rather than each re-deriving the same regex.

const LIGHT_DARK =
  /--([\w-]+):\s*light-dark\(\s*(#[0-9a-fA-F]{3,8})\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g;

// Map(token → { light, dark }) for every light-dark() custom property in `css`,
// with the hex values lower-cased so callers can compare without re-normalising.
export function lightDarkTokens(css) {
  const tokens = new Map();
  for (const m of css.matchAll(LIGHT_DARK)) {
    tokens.set(m[1], { light: m[2].toLowerCase(), dark: m[3].toLowerCase() });
  }
  return tokens;
}
