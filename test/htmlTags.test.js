import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseAttrs,
  htmlTags,
  findTags,
  rawTextElements,
} from "../tools/html-tags.mjs";

// --- parseAttrs -------------------------------------------------------------

test("parseAttrs reads double-, single- and unquoted values plus boolean attrs", () => {
  const attrs = parseAttrs(
    ` name="theme-color" data-scheme='light' charset=utf-8 defer`,
  );
  assert.equal(attrs.get("name"), "theme-color"); // double-quoted
  assert.equal(attrs.get("data-scheme"), "light"); // single-quoted
  assert.equal(attrs.get("charset"), "utf-8"); // unquoted
  assert.equal(attrs.get("defer"), ""); // boolean → ""
  assert.equal(attrs.size, 4);
});

test("parseAttrs lower-cases names, preserves value case, keeps : and - in names", () => {
  const attrs = parseAttrs(
    `PROPERTY="OG:Image" http-equiv="Content-Security-Policy"`,
  );
  assert.equal(attrs.get("property"), "OG:Image");
  assert.equal(attrs.get("http-equiv"), "Content-Security-Policy");
});

test("parseAttrs unwraps a value containing the other quote and newlines", () => {
  const attrs = parseAttrs(
    `content="default-src 'none';\n  script-src 'self'"`,
  );
  assert.equal(
    attrs.get("content"),
    "default-src 'none';\n  script-src 'self'",
  );
});

test("parseAttrs ignores the / of a self-closing tag", () => {
  const attrs = parseAttrs(` name="x" /`);
  assert.equal(attrs.get("name"), "x");
  assert.equal(attrs.has("/"), false);
  assert.equal(attrs.size, 1);
});

// --- htmlTags ---------------------------------------------------------------

test("htmlTags yields each tag as { raw, attrs } in document order", () => {
  const html = `<meta charset="utf-8"><meta name="theme-color" content="#111">`;
  const tags = [...htmlTags(html, "meta")];
  assert.equal(tags.length, 2);
  assert.equal(tags[0].attrs.get("charset"), "utf-8");
  assert.equal(tags[1].attrs.get("content"), "#111");
  assert.match(tags[1].raw, /theme-color/);
});

test("htmlTags is quote-aware and anchors the tag name to a boundary", () => {
  // `>` inside a value must not end the tag; <metadata> is not a <meta>.
  const html = `<metadata name="x"><meta data-note="a>b" content="1200">`;
  const tags = [...htmlTags(html, "meta")];
  assert.equal(tags.length, 1);
  assert.equal(tags[0].attrs.get("data-note"), "a>b");
  assert.equal(tags[0].attrs.get("content"), "1200");
});

test("htmlTags skips a tag inside an HTML comment", () => {
  const html =
    `<!-- <meta name="theme-color" content="#stale"> -->` +
    `<meta name="theme-color" content="#live">`;
  const tags = [...htmlTags(html, "meta")];
  assert.equal(tags.length, 1);
  assert.equal(tags[0].attrs.get("content"), "#live");
});

// --- findTags ---------------------------------------------------------------

test("findTags narrows to tags matching every query pair, case-insensitively", () => {
  const html =
    `<meta name="theme-color" content="#111">` +
    `<meta property="og:image" content="x">`;
  const [tag, ...rest] = [...findTags(html, "meta", { NAME: "Theme-Color" })];
  assert.equal(rest.length, 0);
  assert.equal(tag.attrs.get("content"), "#111");
});

test("findTags rejects a tag missing a queried attribute", () => {
  const html = `<meta name="theme-color" content="#111">`;
  assert.deepEqual([...findTags(html, "meta", { property: "og:image" })], []);
});

test("findTags with no query yields every tag", () => {
  const html = `<meta charset="utf-8"><meta name="x">`;
  assert.equal([...findTags(html, "meta")].length, 2);
});

// --- rawTextElements --------------------------------------------------------

test("rawTextElements yields { raw, attrs, body } for a script element", () => {
  const html = `<script type="module" src="a.js">let x = 1;</script>`;
  const [el, ...rest] = [...rawTextElements(html, "script")];
  assert.equal(rest.length, 0);
  assert.equal(el.attrs.get("type"), "module");
  assert.equal(el.attrs.get("src"), "a.js");
  assert.equal(el.body, "let x = 1;");
});

test("rawTextElements tolerates close-tag junk and ignores </scriptx>", () => {
  const [el] = [...rawTextElements("<script>a</scriptx>b</script >", "script")];
  assert.equal(el.body, "a</scriptx>b");
});
