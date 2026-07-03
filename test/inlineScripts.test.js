import { test } from "node:test";
import assert from "node:assert/strict";

import { scriptElements, inlineScripts } from "../tools/inline-scripts.mjs";

// The CSP guard trusts this extractor to see every inline <script>: one it skips
// ships unhashed and would slip past the guard. So the end-tag match must accept
// every form a browser treats as a close, not just the canonical `</script>`.

test("extracts the body of a canonical script element", () => {
  assert.deepEqual(scriptElements("<script>x=1</script>"), [
    { attrs: "", body: "x=1" },
  ]);
});

test("matches end tags carrying whitespace or junk before the close", () => {
  // Every one of these is a valid close per the HTML tokenizer; a bare
  // `</script>` pattern would miss them and skip the element.
  for (const end of [
    "</script>",
    "</script >",
    "</script/>",
    "</script\n x>",
  ]) {
    const [match] = scriptElements(
      `<script>body</script>`.replace("</script>", end),
    );
    assert.equal(match?.body, "body", `end tag ${JSON.stringify(end)}`);
  }
});

test("does not treat a different tag like </scriptx> as a close", () => {
  // `\b` guards against matching a longer tag name; the real close still wins.
  const [match] = scriptElements("<script>a</scriptx>b</script>");
  assert.equal(match.body, "a</scriptx>b");
});

test("inlineScripts drops elements with a src attribute", () => {
  const html = '<script src="a.js"></script><script>inline</script>';
  assert.deepEqual(inlineScripts(html), [{ attrs: "", body: "inline" }]);
});

test("inlineScripts keeps an inline script whose attr merely ends in -src", () => {
  // `data-src` / `x-src` are not the `src` attribute; a `\bsrc=` test would
  // wrongly treat these as external and skip hashing their inline body.
  for (const attr of ["data-src", "x-src"]) {
    const html = `<script ${attr}="a.js">inline</script>`;
    assert.deepEqual(
      inlineScripts(html),
      [{ attrs: ` ${attr}="a.js"`, body: "inline" }],
      `attr ${attr}`,
    );
  }
});

test("inlineScripts still drops a real src attribute with spaces around =", () => {
  const html = '<script src = "a.js"></script><script>inline</script>';
  assert.deepEqual(inlineScripts(html), [{ attrs: "", body: "inline" }]);
});

test("inlineScripts keeps a script whose value merely contains a src= substring", () => {
  // A ` src=` inside another attribute's quoted value must not be read as a real
  // src attribute; otherwise this genuine inline script is dropped from
  // enumeration and its body ships unhashed. Both quote styles are blanked.
  for (const attrs of ['data-tpl="<img src=x"', "data-tpl='<img src=y'"]) {
    const html = `<script ${attrs}>inline</script>`;
    assert.deepEqual(
      inlineScripts(html),
      [{ attrs: ` ${attrs}`, body: "inline" }],
      `attrs ${attrs}`,
    );
  }
});
