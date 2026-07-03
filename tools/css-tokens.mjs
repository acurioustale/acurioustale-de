// Parse the palette's `--token: light-dark(<light>, <dark>)` custom properties
// out of a stylesheet. css/style.css defines every colour once this way, so the
// guards that bind other surfaces to it — the two <meta name="theme-color"> tags
// (test/themeColor.test.js), the web-app manifest (test/manifestColor.test.js)
// and the older-browser fallback palette (test/themeFallback.test.js) — read
// their expected values from here rather than each re-deriving the same regex.

// A CSS hex colour, and only a valid length: #rgb, #rgba, #rrggbb, #rrggbbaa.
// `{3,8}` would also accept 5- and 7-digit hex, so a typo like `#12345` (a
// dropped digit) would parse as a valid token and propagate to the drift guards
// as the intended colour. Longest length first so a too-long run can't
// partial-match a shorter valid prefix; an invalid length then fails to match
// here and is caught by the completeness check below.
const HEX = "#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})";

const LIGHT_DARK = new RegExp(
  `--([\\w-]+):\\s*light-dark\\(\\s*(${HEX})\\s*,\\s*(${HEX})\\s*\\)`,
  "g",
);

// The start of a `--token: light-dark(` custom-property declaration, whatever the
// value form. Used only to detect a declaration the hex pattern above can't
// parse — see the completeness check below. (`color: light-dark(...)` inside an
// `@supports` test isn't a custom property, so the `--` prefix skips it.)
const LIGHT_DARK_DECL = /--([\w-]+):\s*light-dark\(/g;

// Map(token → { light, dark }) for every light-dark() custom property in `css`,
// with the hex values lower-cased so callers can compare without re-normalising.
//
// The palette is written entirely in hex on purpose, so the pattern only parses
// two hex colours. But a value the pattern doesn't recognise (an `rgb()`/`hsl()`
// or a named colour) would otherwise be dropped silently, and the drift guards
// that read this map — the theme-color, manifest and fallback-palette tests —
// would then stop checking that token without any signal, green-lighting real
// drift. So refuse to skip quietly: any `--x: light-dark(...)` declaration that
// didn't parse is a hard error telling the maintainer to extend the parser.
export function lightDarkTokens(css) {
  // Strip CSS comments first so a commented-out palette line — an old value kept
  // for reference — is neither parsed into the map nor tripped over by the
  // completeness check below (a commented `--x: light-dark(white, black)` would
  // otherwise hard-fail the build). CSS comments don't nest, so a non-greedy
  // body ends each at its first `*/`, exactly as the CSS tokenizer does. The
  // HTML guards skip comments the same way via tools/html-comments.mjs.
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map();
  for (const m of src.matchAll(LIGHT_DARK)) {
    tokens.set(m[1], { light: m[2].toLowerCase(), dark: m[3].toLowerCase() });
  }
  for (const m of src.matchAll(LIGHT_DARK_DECL)) {
    if (!tokens.has(m[1])) {
      throw new Error(
        `css-tokens: --${m[1]} uses a light-dark() value that is not two hex ` +
          `colours; extend lightDarkTokens to parse it so the palette guards ` +
          `keep checking that token instead of silently skipping it`,
      );
    }
  }
  return tokens;
}
