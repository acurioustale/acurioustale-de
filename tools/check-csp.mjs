// Verify both Content-Security-Policies still cover every inline script. The
// policy is declared twice: a <meta> tag in index.html (the locally-testable
// baseline) and an HTTP header in .htaccess (the production superset). Each
// inline <script> (one with no src and no non-JS type) runs under script-src,
// which forbids 'unsafe-inline', so each needs its sha256 hash in BOTH policies.
// This recomputes the hashes from the live markup and fails if any is missing
// from either policy, and also checks the two policies stay in lock-step on
// every other directive — so neither can silently drift, whether the inline
// theme guard is edited or a directive is loosened in only one file. Run from
// validate.sh and deploy.yml.
//
// Dependency-free on purpose: small regexes over our own well-formatted files,
// not a general HTML/Apache parser.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inlineScripts } from "./inline-scripts.mjs";
import { findTags } from "./html-tags.mjs";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const htaccess = await readFile(
  new URL("../.htaccess", import.meta.url),
  "utf8",
);

// The <meta> CSP, read through the shared tools/html-tags.mjs scanner: it finds
// the <meta> tags (quote-aware, and tag-name anchored so a different element
// like <metadata> can't be read as the policy source) and skips any inside an
// HTML comment, so a documented sample or an old policy kept for reference is
// ignored and the first LIVE match wins. That first-match rule is safe because a
// browser enforces every delivered <meta> CSP simultaneously (the intersection),
// so a later meta can only tighten, never loosen, and validating the first can't
// miss a weakening. The .htaccess header below is the opposite: Apache's
// `Header set` replaces, so there the last directive wins.
const [cspMeta] = findTags(html, "meta", {
  "http-equiv": "Content-Security-Policy",
});
const metaCsp = cspMeta?.attrs.get("content");

// The header CSP: the `Header [always] set Content-Security-Policy "..."`
// directive in .htaccess. Scan line by line and skip Apache comments so a
// commented-out example can't be captured instead of the live directive, and
// require the `Header set` form so only a real directive matches (a bare
// "Content-Security-Policy" mention in prose never does). Take the LAST live
// match, not the first: `Header set` replaces any earlier header of the same
// name, so when two directives are present Apache serves the last one. Breaking
// on the first would validate a strict policy while the browser is served a
// looser one added below it — the drift this guard exists to catch.
//
// Only a TOP-LEVEL directive is the global policy. A CSP inside a request-scoping
// container (<Files>, <FilesMatch>, <Directory>, <Location>, <If>, ...) applies
// only to matching requests, so it must not be captured as the global header —
// otherwise a scoped policy could shadow the real global one in this guard while
// Apache serves the un-validated global directive to every other request. Track
// container depth and ignore anything nested. <IfModule>/<IfDefine>/<IfVersion>
// are load-time conditionals rather than request scopes (the live CSP itself sits
// inside <IfModule mod_headers.c>), so they stay transparent.
const SCOPING_SECTION =
  /^(?:Files|FilesMatch|Directory|DirectoryMatch|Location|LocationMatch|If|ElseIf|Else|Proxy|ProxyMatch)$/i;
let headerCsp;
let scopeDepth = 0;
for (const rawLine of htaccess.split("\n")) {
  const line = rawLine.trim();
  if (line.startsWith("#")) continue;
  const section = line.match(/^<(\/?)([A-Za-z]+)/);
  if (section && SCOPING_SECTION.test(section[2])) {
    if (section[1] === "/") scopeDepth = Math.max(0, scopeDepth - 1);
    else scopeDepth += 1;
    continue;
  }
  if (scopeDepth > 0) continue;
  const match = line.match(
    /^Header\s+(?:always\s+)?set\s+Content-Security-Policy\s+"([^"]*)"/i,
  );
  if (match) {
    headerCsp = match[1];
  }
}

const policies = [
  { name: "index.html <meta> CSP", csp: metaCsp },
  { name: ".htaccess header CSP", csp: headerCsp },
];

// A CSP as a map of directive name -> set of values, so the two policies can be
// compared directive by directive, order- and whitespace-insensitively.
//
// When a directive name is repeated WITHIN a single policy, the browser honours
// the FIRST occurrence and ignores the rest (CSP "parse a serialized policy":
// a duplicate directive name is discarded). So keep the first, not the last: a
// drifted `script-src *; …; script-src 'self' 'sha256-…'` is enforced as the
// permissive `*`, and reading the last (restrictive) copy would let this guard
// green-light a policy the browser actually serves wide open. (This is the
// opposite of the .htaccess `Header set` case above, where Apache serves the
// last of repeated headers — hence the two are scanned differently.)
function parseCsp(csp) {
  const directives = new Map();
  for (const part of csp.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/).filter(Boolean);
    const key = name?.toLowerCase();
    if (key && !directives.has(key)) directives.set(key, new Set(values));
  }
  return directives;
}

// Directives the .htaccess header carries that a <meta> CSP cannot express: the
// header is allowed to add exactly these on top of the <meta> baseline.
const HEADER_ONLY = new Set(["frame-ancestors", "upgrade-insecure-requests"]);

// The JavaScript MIME type essences the browser executes as a classic script
// (the WHATWG MIME-sniffing set, including the legacy aliases). Compared against
// the type's essence with parameters stripped, exactly as the browser does.
const JS_MIME_ESSENCES = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);

// Whether the browser would execute an inline <script> with this type attribute
// value (and so whether it needs a CSP hash). Mirrors "prepare the script
// element": the browser strips leading/trailing whitespace, then runs the script
// when the type is absent or empty (classic), an ASCII case-insensitive "module",
// or a JavaScript MIME type essence match — the type/subtype with any parameters
// (e.g. "; charset=utf-8") ignored. Anything else is a data block that never
// executes (e.g. application/ld+json). An exact-string allowlist of
// "module"/"text-or-application/javascript" is narrower than this, so it would
// wave through an executable inline script it failed to recognise (a trailing
// space, a charset parameter, a legacy alias) as if it were inert data.
function isExecutableJs(rawType) {
  if (rawType === undefined) return true; // no type attribute → classic JS
  const type = rawType.trim();
  if (type === "") return true; // empty type → classic JS
  if (/^module$/i.test(type)) return true; // module script
  const essence = type.split(";")[0].trim().toLowerCase();
  return JS_MIME_ESSENCES.has(essence);
}

// Human-readable list of directives that differ between two CSP maps (a
// directive present in only one, or present in both with differing values).
function directiveDiff(meta, header) {
  const diffs = [];
  for (const name of new Set([...meta.keys(), ...header.keys()])) {
    const m = meta.get(name);
    const h = header.get(name);
    if (!m) diffs.push(`${name}: only in .htaccess`);
    else if (!h) diffs.push(`${name}: only in <meta>`);
    else if (m.size !== h.size || ![...m].every((v) => h.has(v)))
      diffs.push(
        `${name}: <meta> [${[...m].join(" ")}] vs .htaccess [${[...h].join(" ")}]`,
      );
  }
  return diffs;
}

let failed = false;
for (const { name, csp } of policies) {
  if (!csp) {
    failed = true;
    console.error(`check-csp: no Content-Security-Policy found in ${name}`);
  }
}
if (failed) {
  process.exitCode = 1;
} else {
  // The two policies must stay in lock-step: the header is the <meta> baseline
  // plus the directives a meta CSP can't express. Strip those header-only
  // directives, then the rest must match exactly, so loosening or dropping a
  // directive in only one file is caught — not just a drifted script hash.
  const headerDirectives = parseCsp(headerCsp);

  // The header-only directives are excluded from the diff below because a
  // <meta> CSP can't express them — but excluding them from the comparison
  // means their absence would otherwise go unnoticed, so assert they are
  // actually present. Without this, deleting frame-ancestors or
  // upgrade-insecure-requests from .htaccess would pass the guard, silently
  // dropping the clickjacking and HTTPS-upgrade protections in production.
  for (const name of HEADER_ONLY) {
    if (!headerDirectives.has(name)) {
      failed = true;
      console.error(
        `check-csp: the .htaccess header is missing the required directive: ${name}`,
      );
    }
  }

  const headerBaseline = new Map(
    [...headerDirectives].filter(([name]) => !HEADER_ONLY.has(name)),
  );
  const diffs = directiveDiff(parseCsp(metaCsp), headerBaseline);
  if (diffs.length) {
    failed = true;
    console.error(
      "check-csp: the <meta> and .htaccess CSPs disagree (header-only " +
        "frame-ancestors/upgrade-insecure-requests excluded):",
    );
    for (const d of diffs) console.error(`  ${d}`);
  }

  // Every inline <script> in index.html (external scripts are covered by
  // script-src 'self' and carry no inline body to hash).
  const scripts = inlineScripts(html);

  // The script-src value set of each policy, parsed once. An inline script's
  // hash is checked for membership here — in the directive that actually governs
  // inline scripts — rather than as a bare substring anywhere in the policy
  // string. A substring test would also pass on a hash left behind in a
  // different directive (or a comment-like fragment) while script-src itself lost
  // it, exactly the drift this guard exists to catch. A missing script-src
  // yields an empty set, so any inline script correctly fails.
  const scriptSrc = policies.map(({ name, csp }) => ({
    name,
    values: parseCsp(csp).get("script-src") ?? new Set(),
  }));

  for (const { attrs, body } of scripts) {
    const type = attrs.get("type");
    // Non-JS data blocks (e.g. application/ld+json) are not executed and so are
    // not subject to script-src; only real inline scripts need a hash.
    if (!isExecutableJs(type)) continue;

    const hash = createHash("sha256").update(body, "utf8").digest("base64");
    const token = `'sha256-${hash}'`;
    for (const { name, values } of scriptSrc) {
      if (!values.has(token)) {
        failed = true;
        console.error(
          `check-csp: inline script not allowed by the ${name}.\n  expected token: ${token}`,
        );
      }
    }
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log(
      "check-csp: the two CSPs are consistent and cover all inline scripts",
    );
  }
}
