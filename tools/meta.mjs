// Scan the <meta> tags of an HTML document by attribute. Several guards read a
// <meta> and pull a value off it — check-og-image.mjs the og:image dimensions,
// test/themeColor.test.js the per-scheme theme-color, test/themeToggleMeta.test.js
// the data-scheme metas. This is a thin <meta>-specific façade over the shared
// scanner in tools/html-tags.mjs, which does the quote-aware matching,
// comment-skipping and attribute parsing once for every tag type — so those
// rules live in one place instead of a private <meta> regex here.
import { findTags } from "./html-tags.mjs";

// Yield { raw, attrs } for each <meta> tag whose attributes include every
// name/value pair in `query`, in document order (attribute order within a tag is
// irrelevant; values compare case-insensitively). `attrs` is a
// Map(lower-cased-name → value); read a value with `attrs.get("content")`. A
// <meta> inside an HTML comment is skipped — see tools/html-tags.mjs.
export function metaTags(html, query) {
  return findTags(html, "meta", query);
}
