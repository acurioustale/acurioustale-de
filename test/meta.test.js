import { test } from "node:test";
import assert from "node:assert/strict";
import { metaTags } from "../tools/meta.mjs";

const html = `
  <meta charset="utf-8">
  <meta name="theme-color" content="#111" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#eee" media="(prefers-color-scheme: light)">
  <meta property="og:image:width" content="1200">
`;

test("metaTags yields every tag matching a single attribute, in document order", () => {
  const tags = [...metaTags(html, { name: "theme-color" })];
  assert.equal(tags.length, 2);
  assert.match(tags[0], /#111/);
  assert.match(tags[1], /#eee/);
});

test("metaTags matches regardless of the attribute's position in the tag", () => {
  // `property` sits first here; `content` second — still found.
  const [tag] = [...metaTags(html, { property: "og:image:width" })];
  assert.match(tag, /content=["']1200["']/);
});

test("metaTags requires every attribute in the query to be present", () => {
  // The tag has name=theme-color but no property, so the two-attribute query
  // rejects it — exercises the `.every` short-circuit on a later pair.
  assert.deepEqual(
    [...metaTags(html, { name: "theme-color", property: "og:image:width" })],
    [],
  );
});

test("metaTags yields nothing when no tag matches", () => {
  assert.deepEqual([...metaTags(html, { name: "nope" })], []);
});
