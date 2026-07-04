// Parse and compare Content-Security-Policy directives. Kept out of check-csp.mjs
// so the parsing (first-wins over a repeated directive) and the two-policy
// lock-step comparison are a testable unit instead of top-level code in the
// guard.
//
// Dependency-free on purpose: small string work over our own two policies, not a
// general CSP parser.

// A CSP as a map of directive name -> set of values, so two policies can be
// compared directive by directive, order- and whitespace-insensitively.
//
// When a directive name is repeated WITHIN a single policy, the browser honours
// the FIRST occurrence and ignores the rest (CSP "parse a serialized policy": a
// duplicate directive name is discarded). So keep the first, not the last: a
// drifted `script-src *; …; script-src 'self' 'sha256-…'` is enforced as the
// permissive `*`, and reading the last (restrictive) copy would let a guard
// green-light a policy the browser actually serves wide open.
export function parseCsp(csp) {
  const directives = new Map();
  for (const part of csp.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/).filter(Boolean);
    const key = name?.toLowerCase();
    if (key && !directives.has(key)) directives.set(key, new Set(values));
  }
  return directives;
}

// Directives the .htaccess header carries that a <meta> CSP cannot usefully
// express (a browser ignores frame-ancestors in a meta policy): the header is
// allowed to add exactly these on top of the <meta> baseline, so they are
// excluded from the lock-step comparison on BOTH sides.
export const HEADER_ONLY = new Set([
  "frame-ancestors",
  "upgrade-insecure-requests",
]);

// Human-readable list of directives that differ between two CSP maps (a
// directive present in only one, or present in both with differing values).
export function directiveDiff(meta, header) {
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

// Compare the <meta> and .htaccess policies for lock-step. Returns
// { missingHeaderOnly, diffs }:
//   - missingHeaderOnly: header-only directives absent from the header. They are
//     stripped from the comparison, so their absence would otherwise go unnoticed
//     — asserting their presence keeps deleting frame-ancestors or
//     upgrade-insecure-requests from .htaccess from silently dropping the
//     clickjacking and HTTPS-upgrade protections.
//   - diffs: every other directive must match exactly, so loosening or dropping
//     one in only one file is caught, not just a drifted script hash.
//
// Header-only directives are stripped from BOTH policies, not just the header:
// adding one to the <meta> too (harmless — the browser ignores frame-ancestors
// there) must not read as a `only in <meta>` mismatch and fail the build.
export function comparePolicies(metaCsp, headerCsp) {
  const header = parseCsp(headerCsp);
  const missingHeaderOnly = [...HEADER_ONLY].filter(
    (name) => !header.has(name),
  );
  const withoutHeaderOnly = (directives) =>
    new Map([...directives].filter(([name]) => !HEADER_ONLY.has(name)));
  const diffs = directiveDiff(
    withoutHeaderOnly(parseCsp(metaCsp)),
    withoutHeaderOnly(header),
  );
  return { missingHeaderOnly, diffs };
}
