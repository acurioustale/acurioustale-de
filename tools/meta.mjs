// Scan the <meta> tags of an HTML document by attribute. Several guards need to
// find a meta and read something off it — check-og-image.mjs pulls the declared
// og:image dimensions, test/themeColor.test.js reads the per-scheme theme-color —
// and each was re-implementing the same "match every <meta>, test an attribute
// regardless of attribute order, then extract" loop. This centralises that core.
// (check-csp.mjs keeps its own scan: it must skip commented-out <meta> CSPs by
// position, a concern this generic helper deliberately does not model.)

// Yield the raw source of each <meta> tag in `html` whose attributes include
// every name/value pair in `attrs`, in document order. Attribute order within a
// tag is irrelevant; each value is matched as `name="value"` (or single-quoted).
export function* metaTags(html, attrs) {
  const pairs = Object.entries(attrs);
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (
      pairs.every(([k, v]) => new RegExp(`${k}=["']${v}["']`, "i").test(tag))
    ) {
      yield tag;
    }
  }
}
