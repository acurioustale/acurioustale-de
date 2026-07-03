// Shared HTML tag/attribute scanner. Several guards and tests need to find a tag
// by name and read an attribute off it — the CSP guard reads the meta CSP and
// each inline script's type, check-og-image reads the og:image dimensions, the
// theme tests read the theme-color content/media/data-scheme. Each used to
// re-derive its own `<tag …>` regex plus a per-attribute `attr=["']…["']`
// extraction, so the quoting, comment and attribute-boundary rules lived in many
// places and drifted (a `>` inside a value truncating a tag, `data-name`
// satisfying a query for `name`, a `<meta` boundary matching `<metadata>`). This
// parses each tag's attributes once, correctly, so those rules have one home.
//
// Dependency-free on purpose: a small scan over our own well-formed markup, not
// a general HTML parser. Comment-skipping is shared with tools/html-comments.mjs.
import { isCommented } from "./html-comments.mjs";

// A tag's attribute text as Map(lower-cased name → value). A value is unwrapped
// from its quotes (single or double, and may span newlines); an unquoted value
// is taken verbatim; a boolean attribute with no value maps to "". Because the
// names are tokenised, `data-name` becomes the key "data-name" and can never be
// read as "name" — the attribute-boundary bug is structurally impossible here.
export function parseAttrs(attrText) {
  const attrs = new Map();
  // name, then an optional `= value` where value is double-quoted, single-quoted
  // or a bare run. The name class excludes whitespace, `=` and the `/` of a
  // self-closing `/>`, so a lone `/` yields no spurious attribute.
  const ATTR = /([^\s/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]*))?/g;
  for (const [, name, raw] of attrText.matchAll(ATTR)) {
    let value = "";
    if (raw !== undefined) {
      value = raw[0] === '"' || raw[0] === "'" ? raw.slice(1, -1) : raw;
    }
    attrs.set(name.toLowerCase(), value);
  }
  return attrs;
}

// The open-tag pattern for `name`: `<name` at a word boundary (so `<meta` can't
// match `<metadata>`) through the closing `>`, consuming quoted spans whole so a
// `>` inside a quoted value doesn't end the tag. Capture group 1 is the
// attribute text. `name` is always a literal element name from our own callers,
// so it needs no regex escaping.
function openTag(name) {
  return `<${name}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`;
}

// Every <name …> tag in `html`, in document order, as { raw, attrs }. A tag
// inside an HTML comment (a stale example kept for reference) is skipped, so a
// caller reading the first match binds to the live tag.
export function* htmlTags(html, name) {
  for (const m of html.matchAll(new RegExp(openTag(name), "gi"))) {
    if (isCommented(html, m.index)) continue;
    yield { raw: m[0], attrs: parseAttrs(m[1]) };
  }
}

// htmlTags narrowed to tags whose attributes include every name/value pair in
// `query`, compared case-insensitively (HTML attribute matching is not
// case-sensitive, and no regex escaping is needed since parsed values compare as
// literal strings). An empty query yields every <name> tag.
export function* findTags(html, name, query = {}) {
  const wanted = Object.entries(query).map(([k, v]) => [
    k.toLowerCase(),
    v.toLowerCase(),
  ]);
  for (const tag of htmlTags(html, name)) {
    if (wanted.every(([k, v]) => tag.attrs.get(k)?.toLowerCase() === v)) {
      yield tag;
    }
  }
}

// Like htmlTags but for a raw-text element that carries a body (script): also
// yields `body`, the text between the open and close tags. The close tag
// tolerates trailing whitespace or junk before its `>` (`</script >`,
// `</script/>`) as browsers do. Comments are NOT skipped here, matching the
// script enumeration the CSP guard depends on.
export function* rawTextElements(html, name) {
  const re = new RegExp(`${openTag(name)}([\\s\\S]*?)</${name}\\b[^>]*>`, "gi");
  for (const m of html.matchAll(re)) {
    yield { raw: m[0], attrs: parseAttrs(m[1]), body: m[2] };
  }
}
