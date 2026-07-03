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
      // Unwrap only a genuinely quoted token — one that both opens and closes
      // with the same quote. A value that merely starts with a quote but never
      // closes it (a malformed `foo="bar`) falls through the regex to the
      // bare-run branch; slicing that as if it were quoted would chop its last
      // character too, so keep it verbatim instead.
      const q = raw[0];
      const quoted =
        (q === '"' || q === "'") && raw.length >= 2 && raw.at(-1) === q;
      value = quoted ? raw.slice(1, -1) : raw;
    }
    attrs.set(name.toLowerCase(), value);
  }
  return attrs;
}

// A tag-name boundary: whitespace, `/` or `>` — the only things that can end an
// element name in HTML — as a zero-width lookahead. It rejects both a longer word
// name (`<metadata>`, which a `\b` also rejected) and a hyphenated custom element
// (`<meta-data>`, which a `\b` wrongly accepted since `-` is a word boundary). One
// home for the rule, so the open-tag, close-tag and opener scans can't drift.
const NAME_BOUNDARY = "(?=[\\s/>])";

// The open-tag pattern for `name`: `<name` at a name boundary, through the closing
// `>`, consuming quoted spans whole so a `>` inside a quoted value doesn't end the
// tag. A balanced span is tried before the trailing `["']` fallback, so an
// unbalanced stray quote in an unquoted value (`content=12"00`) is taken as a
// literal char — as a browser tokenizes it — instead of opening a span that hunts
// for its close past the tag's own `>` and swallows the following tag. Balanced
// markup never reaches the fallback, so real (fully-quoted) tags are unaffected.
// Capture group 1 is the attribute text. `name` is always a literal element name
// from our own callers, so it needs no regex escaping.
function openTag(name) {
  return `<${name}${NAME_BOUNDARY}((?:[^>"']|"[^"]*"|'[^']*'|["'])*)>`;
}

// The close tag for a raw-text element: `</name`, name-boundary anchored, then
// trailing junk before `>` (`</script >`, `</script/>`) as browsers tolerate.
// Shared by rawTextElements (to bound a body) and countRawTextOpeners (to skip
// one), so the two agree on where an element ends.
function closeTag(name) {
  return `</${name}${NAME_BOUNDARY}[^>]*>`;
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
// yields `body`, the text between the open and close tags. The close tag anchors
// its name to a boundary char, so `</script-oops>` (or `</scriptx>`) is not read
// as the close — a browser keeps the element open there. Comments are NOT skipped
// here, matching the script enumeration the CSP guard depends on.
export function* rawTextElements(html, name) {
  const re = new RegExp(`${openTag(name)}([\\s\\S]*?)${closeTag(name)}`, "gi");
  for (const m of html.matchAll(re)) {
    yield { raw: m[0], attrs: parseAttrs(m[1]), body: m[2] };
  }
}

// How many `<name` start-tag openers `html` contains, counted on the same basis
// rawTextElements consumes them: after each opener its raw-text body (everything
// up to the next close tag) is skipped before the next opener is sought. So a
// `<name` sitting inside another element's body — a `<script>` literal in a
// JSON-LD block or in another script's source — is not miscounted as its own
// opener, and neither is one a body scan swallows from inside a comment or an
// attribute value. This shares the boundary and close-tag rules above, so a guard
// can assert "every opener parsed into an element" without re-deriving the `<name`
// regex and drifting from it. An opener whose start tag is malformed (an
// unbalanced quote leaves its `>` unmatchable) is still counted here but dropped
// by rawTextElements — exactly the divergence a fail-closed guard wants to catch.
export function countRawTextOpeners(html, name) {
  const opener = new RegExp(`<${name}${NAME_BOUNDARY}`, "gi");
  const close = new RegExp(closeTag(name), "gi");
  let count = 0;
  let pos = 0;
  for (;;) {
    opener.lastIndex = pos;
    const m = opener.exec(html);
    if (!m) break;
    count += 1;
    // Raw text ends at the next close tag (a browser closes a raw-text element at
    // the first `</name`), so seek the next opener past it; no close → EOF.
    close.lastIndex = m.index + m[0].length;
    const c = close.exec(html);
    pos = c ? close.lastIndex : html.length;
  }
  return count;
}
