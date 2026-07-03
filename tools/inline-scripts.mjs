// Shared inline-<script> extractor. The CSP guard (tools/check-csp.mjs) and the
// theme-guard test (test/themeGuard.test.js) both pull the inline scripts out of
// index.html, and must agree on exactly which scripts exist — so the fiddly
// matcher lives here once instead of being copy-pasted into both.
//
// Dependency-free on purpose: a small regex over our own well-formatted markup,
// not a general HTML parser.

// The end tag can carry trailing whitespace or attribute-like junk before the
// `>` (e.g. `</script >`, `</script/>` or `</script\n foo>`), all of which
// browsers still treat as a close — so match `</script\b[^>]*>` rather than a
// bare `</script>` that would skip such an element and let an unhashed inline
// script slip past enumeration. The `\b` keeps it from matching a different tag
// like `</scriptx>`, mirroring the opening-tag pattern (CodeQL js/bad-tag-filter).
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi;

// Every <script> element in the given HTML, in document order, as { attrs, body }
// objects (attrs is the opening tag's attribute text, body its contents).
export function scriptElements(html) {
  return [...html.matchAll(SCRIPT_RE)].map(([, attrs, body]) => ({
    attrs,
    body,
  }));
}

// Inline scripts only — those with no src attribute. External scripts carry no
// inline body to hash or inspect and are covered by script-src 'self'.
//
// Anchor the match to the start of an attribute (string start or whitespace):
// `\bsrc=` would also fire on `data-src=` / `x-src=` (the `-` is a word
// boundary), misclassifying an inline `<script data-src="…">…</script>` as
// external and dropping it from enumeration — so its body would ship unhashed,
// exactly the miss this module exists to prevent. Allow optional whitespace
// around `=` as the HTML tokenizer does.
//
// Blank out quoted attribute values first: a whitespace-preceded `src=` sitting
// inside another attribute's value (e.g. `<script data-tpl="<img src=x">…`)
// would otherwise satisfy the test and drop a genuine inline script, the same
// miss in a subtler form. An unquoted value can't contain whitespace, so a real
// `src` attribute always survives the blanking.
export function inlineScripts(html) {
  return scriptElements(html).filter(({ attrs }) => {
    const bare = attrs
      .replace(/=\s*"[^"]*"/g, "=")
      .replace(/=\s*'[^']*'/g, "=");
    return !/(?:^|\s)src\s*=/i.test(bare);
  });
}
