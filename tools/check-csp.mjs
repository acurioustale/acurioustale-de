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

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const htaccess = await readFile(
  new URL("../.htaccess", import.meta.url),
  "utf8",
);

// The <meta> CSP. Matches attribute regardless of order between http-equiv and content.
let metaCsp;
for (const [tag] of html.matchAll(
  /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
)) {
  const match = tag.match(/content=(["'])([\s\S]*?)\1/i);
  if (match) metaCsp = match[2];
}

// The header CSP: the `Header [always] set Content-Security-Policy "..."`
// directive in .htaccess. Scan line by line and skip Apache comments so a
// commented-out example can't be captured instead of the live directive, and
// require the `Header set` form so only a real directive matches (a bare
// "Content-Security-Policy" mention in prose never does).
let headerCsp;
for (const rawLine of htaccess.split("\n")) {
  const line = rawLine.trim();
  if (line.startsWith("#")) continue;
  const match = line.match(
    /^Header\s+(?:always\s+)?set\s+Content-Security-Policy\s+"([^"]*)"/i,
  );
  if (match) {
    headerCsp = match[1];
    break;
  }
}

const policies = [
  { name: "index.html <meta> CSP", csp: metaCsp },
  { name: ".htaccess header CSP", csp: headerCsp },
];

// A CSP as a map of directive name -> set of values, so the two policies can be
// compared directive by directive, order- and whitespace-insensitively.
function parseCsp(csp) {
  const directives = new Map();
  for (const part of csp.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/).filter(Boolean);
    if (name) directives.set(name.toLowerCase(), new Set(values));
  }
  return directives;
}

// Directives the .htaccess header carries that a <meta> CSP cannot express: the
// header is allowed to add exactly these on top of the <meta> baseline.
const HEADER_ONLY = new Set(["frame-ancestors", "upgrade-insecure-requests"]);

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

  for (const { attrs, body } of scripts) {
    const type = (attrs.match(/\btype=["']([^"']*)["']/i) || [])[1];
    // Non-JS data blocks (e.g. application/ld+json) are not executed and so are
    // not subject to script-src; only real inline scripts need a hash.
    const isJs =
      !type ||
      /^(module|text\/javascript|application\/javascript)$/i.test(type);
    if (!isJs) continue;

    const hash = createHash("sha256").update(body, "utf8").digest("base64");
    const token = `'sha256-${hash}'`;
    for (const { name, csp } of policies) {
      if (!csp.includes(token)) {
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
