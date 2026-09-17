import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findTags } from "../tools/shared/html-tags.mjs";
import { parseSecurityTxt } from "../tools/security-txt.mjs";

// The edit-driven half of the security.txt checks, and the only half in the
// gate: every assertion here fails because someone changed a file. The
// calendar-driven half — whether the `Expires` date has passed — is
// tools/check-security-txt-expiry.mjs, run from the non-gating links workflow,
// because a date arriving on its own must not redden a green tree.

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const securityTxt = read(".well-known/security.txt");
const securityMd = read("SECURITY.md");
const html = read("index.html");

const declared = parseSecurityTxt(securityTxt);

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
