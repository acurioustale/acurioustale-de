import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findTags } from "../tools/html-tags.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const securityTxt = read(".well-known/security.txt");
const securityMd = read("SECURITY.md");
const html = read("index.html");

// The fields of an RFC 9116 file: `Name: value` lines, with `#` comments and
// blank lines ignored. A name may repeat (two Contact lines here), so collect
// every value per name rather than keeping the last.
function fields(text) {
  const found = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z-]+):\s*(.+)$/);
    assert.ok(match, `security.txt line is not a "Name: value" field: ${line}`);
    found.set(match[1], [...(found.get(match[1]) ?? []), match[2]]);
  }
  return found;
}

const declared = fields(securityTxt);

test("security.txt carries every field RFC 9116 requires or expects", () => {
  // Contact and Expires are the two the RFC requires; the rest are what makes
  // the file useful to someone who finds it.
  for (const name of [
    "Contact",
    "Expires",
    "Canonical",
    "Policy",
    "Preferred-Languages",
  ]) {
    assert.ok(declared.has(name), `security.txt declares no ${name}`);
  }
});

test("security.txt has not expired", () => {
  // An expired file is invalid per RFC 9116, so this is a real failure rather
  // than a reminder — and the fix is to edit the one line and push.
  const [expires] = declared.get("Expires");
  const when = new Date(expires);
  assert.ok(
    !Number.isNaN(when.getTime()),
    `Expires is not a valid timestamp: ${expires}`,
  );
  assert.ok(
    when > new Date(),
    `security.txt expired on ${expires} — set a new Expires no more than a year out`,
  );
});

test("the security.txt contact address is the one SECURITY.md gives", () => {
  // Two surfaces telling a reporter where to write, bound so they can't drift:
  // the prose policy is the source, this file the machine-readable copy.
  const [mailto] = declared
    .get("Contact")
    .filter((value) => value.startsWith("mailto:"));
  assert.ok(mailto, "security.txt declares no mailto: Contact");
  const address = mailto.slice("mailto:".length);
  assert.ok(
    securityMd.includes(`<${address}>`),
    `SECURITY.md does not give ${address} as the reporting address`,
  );
});

test("security.txt points at SECURITY.md as its policy", () => {
  const [policy] = declared.get("Policy");
  assert.match(policy, /\/SECURITY\.md$/);
});

test("the Canonical URL is this file on the site's own origin", () => {
  // Bound to the page's canonical link so the origin is stated once. A
  // Canonical naming someone else's origin is how a security.txt gets used to
  // redirect reports.
  const [canonicalLink] = findTags(html, "link", { rel: "canonical" });
  const origin = new URL(canonicalLink.attrs.get("href")).origin;
  assert.equal(
    declared.get("Canonical")[0],
    `${origin}/.well-known/security.txt`,
  );
});
