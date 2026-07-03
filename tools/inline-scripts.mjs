// Shared inline-<script> extractor. The CSP guard (tools/check-csp.mjs) and the
// theme-guard test (test/themeGuard.test.js) both pull the inline scripts out of
// index.html, and must agree on exactly which scripts exist — so the selection
// lives here once instead of being copy-pasted into both.
//
// Built on the shared scanner in tools/html-tags.mjs: it finds the <script>
// elements (quote-aware, tolerating close-tag junk) and parses each one's
// attributes, so the fiddly tag/attribute rules live in one place.
import { rawTextElements } from "./html-tags.mjs";

// Every <script> element in the given HTML, in document order, as
// { raw, attrs, body }: attrs is the parsed attribute Map, body its contents.
export function scriptElements(html) {
  return [...rawTextElements(html, "script")];
}

// Inline scripts only — those with no src attribute. External scripts carry no
// inline body to hash or inspect and are covered by script-src 'self'.
//
// Presence of the parsed `src` key is the whole test: a `src=` sitting inside
// another attribute's value can't be mistaken for one (it isn't a top-level
// attribute), and `data-src`/`x-src` are distinct keys — so a genuine inline
// script is never dropped from enumeration and shipped unhashed. A valueless
// `<script src>` (which fetches the current page rather than executing inline)
// counts as external too, same as `src=""`.
export function inlineScripts(html) {
  return scriptElements(html).filter(({ attrs }) => !attrs.has("src"));
}
