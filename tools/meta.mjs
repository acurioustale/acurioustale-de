// Scan the <meta> tags of an HTML document by attribute. Several guards need to
// find a meta and read something off it — check-og-image.mjs pulls the declared
// og:image dimensions, test/themeColor.test.js reads the per-scheme theme-color —
// and each was re-implementing the same "match every <meta>, test an attribute
// regardless of attribute order, then extract" loop. This centralises that core.
// (check-csp.mjs keeps its own <meta> scan: it also needs the http-equiv match
// and a backreferenced content= extraction this generic helper doesn't provide.
// It shares the comment-skipping rule below by hand rather than through here.)

// Yield the raw source of each <meta> tag in `html` whose attributes include
// every name/value pair in `attrs`, in document order. Attribute order within a
// tag is irrelevant; each value is matched as `name="value"` (or single-quoted).
//
// A <meta> inside an HTML comment (e.g. an old value kept for reference above
// the live tag) is skipped, so a caller that reads the first match — like
// check-og-image.mjs pulling the og:image dimensions — can't bind to a stale
// commented value. Comment membership is decided by position, exactly as
// check-csp.mjs does it: the tag is commented when the nearest `<!--` before it
// is still open (sits after the last `-->`). A single regex pass can't strip
// nested comment markers safely, so this positional test is used instead.
export function* metaTags(html, attrs) {
  const pairs = Object.entries(attrs);
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const before = html.slice(0, match.index);
    if (before.lastIndexOf("<!--") > before.lastIndexOf("-->")) continue;
    const tag = match[0];
    if (
      pairs.every(([k, v]) => new RegExp(`${k}=["']${v}["']`, "i").test(tag))
    ) {
      yield tag;
    }
  }
}
