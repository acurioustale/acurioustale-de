import { test } from "node:test";
import assert from "node:assert/strict";

import { readHeaderCsp } from "../tools/htaccess-csp.mjs";

test("readHeaderCsp reads a top-level Header set directive", () => {
  const { headerCsp, scopesUnbalanced } = readHeaderCsp(
    `Header always set Content-Security-Policy "default-src 'none'; script-src 'self'"`,
  );
  assert.equal(headerCsp, "default-src 'none'; script-src 'self'");
  assert.equal(scopesUnbalanced, false);
});

test("readHeaderCsp reassembles a backslash-continued directive", () => {
  // Apache joins a line ending in `\` onto the next; a maintainer may wrap the
  // long CSP for readability. The value must read as one logical line, not go
  // undetected because its first line never closes the quote.
  const { headerCsp } = readHeaderCsp(
    "Header always set Content-Security-Policy \"default-src 'none'; \\\n" +
      "  script-src 'self'; style-src 'self'\"",
  );
  assert.equal(
    headerCsp,
    "default-src 'none';   script-src 'self'; style-src 'self'",
  );
});

test("readHeaderCsp reassembles a continuation with CRLF line endings", () => {
  const { headerCsp } = readHeaderCsp(
    "Header set Content-Security-Policy \"default-src 'none'; \\\r\n" +
      "script-src 'self'\"\r\n",
  );
  assert.equal(headerCsp, "default-src 'none'; script-src 'self'");
});

test("readHeaderCsp skips comment lines and takes the last live directive", () => {
  const { headerCsp } = readHeaderCsp(
    [
      `# Header set Content-Security-Policy "commented-out"`,
      `Header set Content-Security-Policy "first"`,
      `Header set Content-Security-Policy "second"`,
    ].join("\n"),
  );
  assert.equal(headerCsp, "second");
});

test("readHeaderCsp treats <IfModule> as transparent, not a request scope", () => {
  const { headerCsp, scopesUnbalanced } = readHeaderCsp(
    [
      `<IfModule mod_headers.c>`,
      `  Header set Content-Security-Policy "live"`,
      `</IfModule>`,
    ].join("\n"),
  );
  assert.equal(headerCsp, "live");
  assert.equal(scopesUnbalanced, false);
});

test("readHeaderCsp ignores a CSP inside a request-scoping container", () => {
  const { headerCsp } = readHeaderCsp(
    [
      `Header set Content-Security-Policy "global"`,
      `<Files "admin">`,
      `  Header set Content-Security-Policy "scoped"`,
      `</Files>`,
    ].join("\n"),
  );
  assert.equal(headerCsp, "global");
});

test("readHeaderCsp flags a stray close as unbalanced", () => {
  const { scopesUnbalanced } = readHeaderCsp(
    [`</Files>`, `Header set Content-Security-Policy "x"`].join("\n"),
  );
  assert.equal(scopesUnbalanced, true);
});

test("readHeaderCsp flags an unclosed container as unbalanced", () => {
  const { scopesUnbalanced } = readHeaderCsp(
    [`<Directory "/">`, `Header set Content-Security-Policy "x"`].join("\n"),
  );
  assert.equal(scopesUnbalanced, true);
});

test("readHeaderCsp returns undefined when no directive is present", () => {
  const { headerCsp, scopesUnbalanced } = readHeaderCsp(`# nothing here`);
  assert.equal(headerCsp, undefined);
  assert.equal(scopesUnbalanced, false);
});
