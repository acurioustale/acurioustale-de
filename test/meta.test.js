import { test } from "node:test";
import assert from "node:assert/strict";
import { metaTags } from "../tools/meta.mjs";

// metaTags is a <meta>-specific façade over tools/html-tags.mjs: it yields
// { raw, attrs } for each <meta> whose attributes include every pair in the
// query. The quoting/comment/boundary rules are html-tags' job and are covered
// in test/htmlTags.test.js; these tests check the façade wires them to <meta>.

const html = `
  <meta charset="utf-8">
  <meta name="theme-color" content="#111" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#eee" media="(prefers-color-scheme: light)">
  <meta property="og:image:width" content="1200">
`;

test("metaTags yields { raw, attrs } for each matching <meta>, in document order", () => {
  const tags = [...metaTags(html, { name: "theme-color" })];
  assert.equal(tags.length, 2);
  assert.equal(tags[0].attrs.get("content"), "#111");
  assert.equal(tags[1].attrs.get("content"), "#eee");
  assert.match(tags[0].raw, /theme-color/);
});

test("metaTags matches regardless of attribute position and reads any attribute", () => {
  const [tag] = [...metaTags(html, { property: "og:image:width" })];
  assert.equal(tag.attrs.get("content"), "1200");
});

test("metaTags requires every attribute in the query to be present", () => {
  assert.deepEqual(
    [...metaTags(html, { name: "theme-color", property: "og:image:width" })],
    [],
  );
});

test("metaTags delegates comment-skipping to html-tags", () => {
  const withComment = `
    <!-- <meta property="og:image:width" content="800"> -->
    <meta property="og:image:width" content="1200">
  `;
  const [tag, ...rest] = [
    ...metaTags(withComment, { property: "og:image:width" }),
  ];
  assert.equal(rest.length, 0);
  assert.equal(tag.attrs.get("content"), "1200");
});
