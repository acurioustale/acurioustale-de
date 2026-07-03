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

test("metaTags treats regex metacharacters in the query value literally", () => {
  // Unescaped, `.` in the value would match any char, so `ogximage` would match
  // a query for `og.image` too. The value must be compared as literal text.
  const html2 = `
    <meta property="og.image" content="x">
    <meta property="ogximage" content="y">
  `;
  const tags = [...metaTags(html2, { property: "og.image" })];
  assert.equal(tags.length, 1);
  assert.match(tags[0], /content=["']x["']/);
});

test("metaTags does not match an attribute that merely ends in the queried name", () => {
  // `data-name`/`itemprop-name` end in `name` but are different attributes; a
  // `{ name: ... }` query must not bind to them, or a caller reading the first
  // match could pick the wrong tag.
  const html2 = `
    <meta itemprop-name="theme-color" content="wrong">
    <meta data-name="theme-color" content="alsowrong">
    <meta name="theme-color" content="#right">
  `;
  const tags = [...metaTags(html2, { name: "theme-color" })];
  assert.equal(tags.length, 1);
  assert.match(tags[0], /content=["']#right["']/);
});

test("metaTags skips a <meta> inside an HTML comment and yields the live one", () => {
  // A stale value kept for reference above the live tag must not be matched,
  // so a first-match caller (check-og-image) binds to the live 1200, not 800.
  const withComment = `
    <!-- <meta property="og:image:width" content="800"> -->
    <meta property="og:image:width" content="1200">
  `;
  const tags = [...metaTags(withComment, { property: "og:image:width" })];
  assert.equal(tags.length, 1);
  assert.match(tags[0], /content=["']1200["']/);
});

test("metaTags resumes matching after a comment closes", () => {
  // The `-->` reopens live markup: a tag after it is yielded, exercising the
  // false side of the still-open-comment test.
  const html2 = `<!-- note --> <meta name="theme-color" content="#abc">`;
  const [tag] = [...metaTags(html2, { name: "theme-color" })];
  assert.match(tag, /#abc/);
});
