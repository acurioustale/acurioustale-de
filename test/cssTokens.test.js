import { test } from "node:test";
import assert from "node:assert/strict";
import { lightDarkTokens } from "../tools/css-tokens.mjs";

test("lightDarkTokens maps each light-dark() token to its lower-cased pair", () => {
  const css = `
    :root {
      --page-bg: light-dark(#E8E6DF, #0e0f10);
      --accent: light-dark( #Fff , #000 );
    }
  `;
  const tokens = lightDarkTokens(css);
  assert.deepEqual(tokens.get("page-bg"), {
    light: "#e8e6df",
    dark: "#0e0f10",
  });
  assert.deepEqual(tokens.get("accent"), { light: "#fff", dark: "#000" });
});

test("lightDarkTokens ignores non light-dark() custom properties", () => {
  const tokens = lightDarkTokens("--plain: #123456; --page-bg: #abcdef;");
  assert.equal(tokens.size, 0);
});

test("lightDarkTokens throws on a light-dark() token it can't parse", () => {
  // A non-hex value (a named colour, rgb()/hsl()) would otherwise be dropped
  // silently, and the drift guards that read the map would stop checking that
  // token. It must be a loud failure, not a quiet skip.
  for (const value of [
    "light-dark(white, black)",
    "light-dark(rgb(0,0,0), #fff)",
  ]) {
    assert.throws(() => lightDarkTokens(`--accent: ${value};`), /--accent/);
  }
});
