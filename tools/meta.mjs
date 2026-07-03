// Scan the <meta> tags of an HTML document by attribute. Several guards need to
// find a meta and read something off it — check-og-image.mjs pulls the declared
// og:image dimensions, test/themeColor.test.js reads the per-scheme theme-color —
// and each was re-implementing the same "match every <meta>, test an attribute
// regardless of attribute order, then extract" loop. This centralises that core.
// (check-csp.mjs keeps its own <meta> scan: it also needs the http-equiv match
// and a backreferenced content= extraction this generic helper doesn't provide.
// It shares the comment-skipping rule through tools/html-comments.mjs.)
import { isCommented } from "./html-comments.mjs";

// Escape a string for literal use inside a RegExp. The name/value pairs are
// interpolated into an attribute matcher below, so a value carrying a regex
// metacharacter (`og:image` is safe, but a `.` would match any char and a `(`
// or `[` would throw on an unbalanced group) must be treated as literal text,
// not as pattern syntax.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Yield the raw source of each <meta> tag in `html` whose attributes include
// every name/value pair in `attrs`, in document order. Attribute order within a
// tag is irrelevant; each value is matched as `name="value"` (or single-quoted).
//
// A <meta> inside an HTML comment (e.g. an old value kept for reference above
// the live tag) is skipped, so a caller that reads the first match — like
// check-og-image.mjs pulling the og:image dimensions — can't bind to a stale
// commented value.
export function* metaTags(html, attrs) {
  const pairs = Object.entries(attrs);
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (isCommented(html, match.index)) continue;
    const tag = match[0];
    if (
      pairs.every(([k, v]) =>
        new RegExp(`${escapeRegExp(k)}=["']${escapeRegExp(v)}["']`, "i").test(
          tag,
        ),
      )
    ) {
      yield tag;
    }
  }
}
