# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The personal landing page for [acurioustale.de](https://acurioustale.de): a single
static `index.html` styled as a terminal "whoami" card, with one stylesheet and
two small ES modules in `js/`. No framework and no build step; the deployed site
ships no dependencies (the only npm packages are dev-time linters plus the jsdom,
fast-check and Playwright test harnesses, see below). The
`js/` modules are plain ES modules served as-is and loaded with `type="module"` —
no bundling.

## Commands

```bash
python3 -m http.server 8000   # serve locally, then visit http://localhost:8000
npm run lint                  # lint JS, JSON, CSS and Markdown (ESLint, stylelint, markdownlint-cli2)
npm run format                # Prettier write across the repo (format:check verifies; used by CI)
npm test                      # run unit tests (node --test)
npm run coverage              # unit tests + coverage thresholds (the gate CI enforces)
npm run test:e2e              # run browser smoke tests (Playwright, chromium; separate from CI gate)
npm run links                 # check links locally (lychee, separate from CI gate)
./validate.sh                 # run the FULL gate locally: shell, format, lint, tests, xml, csp, og-image, svg
./validate.sh --clean         # run with a clean install (npm ci) first, matching CI exactly
./deploy.sh                   # deploy to production by hand (uses your own SSH access)
./deploy.sh --dry-run         # preview what the deploy would change
```

There is no build step for the site — edit the files and reload the browser. CI
validates the HTML, CSS and SVG (Nu Html Checker), checks XML well-formedness of
`sitemap.xml` (xmllint), checks formatting (Prettier), keeps the SVGs optimised
(svgo), lints every tracked shell script including `ops/` (ShellCheck and shfmt,
discovered via `git ls-files '*.sh'`), the workflows
(actionlint), the JS, JSON and inline HTML scripts (ESLint with `@eslint/json`
and `eslint-plugin-html`), the CSS (stylelint) and the Markdown
(markdownlint-cli2), runs the unit tests under a coverage gate (`node --test
--experimental-test-coverage`, via `npm run coverage`) and the CSP and og-image
guards (`tools/check-csp.mjs`, `tools/check-og-image.mjs`) on
every push and pull request, and deploys are gated on all of them passing. Run
the same checks locally with `./validate.sh` (needs `brew install vnu
shellcheck shfmt actionlint` plus `npm install` for the npm-only tools: Prettier,
ESLint, stylelint, markdownlint-cli2 and svgo; xmllint ships with macOS/Xcode but
can also be installed via `brew install libxml2`). `validate.sh` skips any brew
CLI that isn't installed (with a notice — CI still enforces it) so it runs on a
fresh checkout; Node and npm are the only hard requirements. Link checking and
the browser smoke tests are separate and non-gating — the `links` workflow runs
lychee on pull requests and a weekly schedule, and the `e2e` workflow runs the
Playwright specs (a browser download) on pull requests and pushes to `main`.
Deploys gate only on `validate`, not on either of these. The dev dependencies
that need `package.json` are ESLint (plus `@eslint/js`, `@eslint/json`,
`eslint-plugin-html` and `globals`), stylelint (plus `stylelint-config-standard`),
markdownlint-cli2, Prettier, svgo, jsdom (the DOM harness the wiring tests run
against), `fast-check` (the property-based tests) and `@playwright/test` (the
browser smoke tests). The CI guards use only Node's standard library; the
pure-logic unit tests additionally use `fast-check` for the property tests in
`test/properties.test.js`; only the DOM-wiring tests
(`test/terminalDom.test.js`, `test/themeToggleDom.test.js`, via
`test/helpers/dom.js`) need jsdom, only the `e2e/` specs need Playwright, and the
site itself still ships no dependencies. Prettier uses its defaults; keep the Prettier, shfmt, actionlint
and Node versions pinned in `.tool-versions` in sync with the project — `validate.sh`
asserts the shfmt and actionlint versions when present (hard errors on mismatch;
Node is a warning), while Prettier's version is enforced via the npm lockfile.
`.claude/launch.json` defines a
"site" launch config that serves on port 4174.

Two transitive dev dependencies of `markdownlint-cli2` carried advisories and are
pinned to patched versions through `overrides` in `package.json`: `markdown-it`
(`^14.2.0`) and `js-yaml` (`^4.3.0`). The js-yaml pin deliberately stays on the
4.x line: the fix for its quadratic-complexity DoS in merge-key handling was
backported to 4.2.0, while the 5.x line drops the default export
`markdownlint-cli2` imports and so would break it. Both are dev-only tooling that
lints our own files, so there is no untrusted input regardless, and `npm audit`
is clean.

## Theme system (the one piece of real logic)

Light/dark theming is split across the stylesheet, the inline `<head>` guard and
the `js/theme-toggle.js` module, and is easy to break if you touch only one. The
model is three-way — **auto** (follow OS), **light** and **dark** — and the
toggle cycles through all three. Because **auto** always looks like the OS
preference, one step of any three-way cycle can't change the colour; the cycle
order is derived from the OS preference so that unavoidable no-op lands on the
return to **auto**, and every other click visibly flips light/dark (no dead first
click on a light-mode OS). That cycle order is the pure function `nextTheme()` in
`js/theme.js`, unit-tested in `test/theme.test.js` — change the order there, not
by editing the toggle inline.

- `css/style.css` sets `color-scheme: light dark` on `:root` and defines each
  colour **once** as `--token: light-dark(<light>, <dark>)`. The browser
  resolves each `light-dark()` to its light or dark value from the used
  `color-scheme`, so the OS preference drives the colours for free (this is what
  makes the no-JS path follow the OS). The explicit toggle does not re-map any
  colour — it only forces the scheme: `:root[data-theme="light"]` sets
  `color-scheme: light` and `:root[data-theme="dark"]` sets `color-scheme: dark`,
  and every token follows. (`light-dark()` is Baseline since mid-2024 — Chrome
  123, Firefox 120, Safari 17.5.)
- Older browsers without `light-dark()` get a fallback that **duplicates** the
  palette: the plain `:root` block carries the light values, and an
  `@supports not (color: light-dark(...))` block carries the dark values
  (applied both by `prefers-color-scheme: dark` and by the forced
  `:root[data-theme="dark"]`). So when adding or renaming a colour, change the
  `light-dark()` token **and** its fallback copies. `test/themeFallback.test.js`
  binds every fallback value back to its `light-dark()` token, so a forgotten
  copy fails the build rather than drifting silently.
- The theme logic lives in two places. One small inline script in `<head>`
  applies a saved theme from `localStorage` before first paint to avoid a flash;
  it must stay inline (an external/deferred script would flash). `js/theme-toggle.js`
  (a `type="module"` script at the end of `<body>`) injects the toggle button as
  progressive enhancement — without JS, the OS preference still drives colours via
  CSS and no dead control is shown. "auto" clears the `data-theme` attribute and
  the `localStorage` key, handing control back to the OS. What counts as a valid
  override is `normalizeMode()` in `js/theme.js` (reused by the toggle); the inline
  guard duplicates that check by hand only because it must run before any module
  can load.

Keep these consistent: the `localStorage` key is `"theme"` with values
`"light"`/`"dark"` (absent = auto), and the override is the `data-theme`
attribute on `<html>`. The two `<meta name="theme-color">` values (one per
`prefers-color-scheme`) must equal the CSS `--page-bg` light/dark sides;
`test/themeColor.test.js` enforces that so the browser chrome can't drift from
the page background. The web app manifest's `background_color`/`theme_color`
likewise track the dark `--page-bg` side (a manifest carries a single colour, so
the site picks dark); `test/manifestColor.test.js` binds them so the
installed-app chrome and splash can't drift from the page either.
`theme-toggle.js` locates those two metas by their stable `data-scheme`
attribute (`meta[name="theme-color"][data-scheme="light"|"dark"]`), not by their
palette hex, so nothing there couples to the colours; `test/themeToggleMeta.test.js`
binds those selectors back to the metas so renaming a `data-scheme` value or
dropping a meta can't silently break the toggle's chrome-tint sync (the guarded
per-meta lookup would otherwise just skip that meta's update). `test/themeGuard.test.js` verifies the inline pre-paint
guard stays consistent with the module-based `normalizeMode()` by extracting and
evaluating the inline scripts (via `tools/inline-scripts.mjs`).

## JavaScript layout and the CSP

`index.html` carries exactly one inline script — the pre-paint theme guard above.
(A `<script type="application/ld+json">` block provides structured data for
search engines; it's data, not executable, and needs no CSP hash.) Everything
else is in `js/`, loaded with `type="module"`: `theme-toggle.js` (the toggle UI)
and `terminal.js` (the interactive guest-shell easter egg, unrelated
to theming). The card is dressed as a macOS Terminal session and the prompt accepts
commands: `ls` lists the directory (`projects/` and `whoami.sh`), which you then
run as in a real shell — `./whoami.sh` and `ls projects/` reprint the boot
blocks; `uptime`/`date`/`echo` behave like their shell namesakes, `sudo` returns
the classic lecture, `clear` empties the screen (hiding the boot output, like a
real terminal), and `help` lists the commands (the filesystem entries are
discovered via `ls`, not advertised). Everything else is denied with a fitting
shell error (privileged commands like `su`/`doas`/`chmod`/`chown` get "permission
denied", paths with `/` get "No such file or directory", anything else gets
"command not found"). The pure logic each depends on is factored out for
testing — `theme.js` (`nextTheme()`, `normalizeMode()`, `metaMediaFor()`),
`commands.js` (`reply()` for the command replies and denials, `help()` for the
listing, `formatUptime()` for the `uptime` output) and `terminal-ui.js`
(`capLimit()`, `recallHistory()`, `shouldRefit()` — the scrollback cap,
history-recall arithmetic and the width-change re-freeze guard lifted out of the
event handlers) — and exercised
by `test/theme.test.js`, `test/commands.test.js`,
`test/terminalUi.test.js`, `test/themeColor.test.js`,
`test/manifestColor.test.js`, `test/themeFallback.test.js` and
`test/themeGuard.test.js`. On top of those
example-based tests, `test/properties.test.js` asserts the invariants across the
whole input space with `fast-check` — `nextTheme` is a closed three-way cycle,
`formatUptime` never goes negative and round-trips to elapsed minutes,
`recallHistory` keeps its index in bounds for any key sequence, and `capLimit`
stays a non-negative bound — so a regression that slips past a hand-picked
example still fails the build.
The remaining DOM glue in the two UI modules is thin, but the wiring itself (a
click, keystroke or storage event mutating the DOM) is covered by jsdom tests
in `test/terminalDom.test.js` and `test/themeToggleDom.test.js`, which drive the
modules against a document built from the real `index.html` (see
`test/helpers/dom.js`). Layout- and paint-dependent behaviour — `fitScreen`'s
height freeze, the input growing with its content, click-to-focus and the theme
toggle actually repainting the page — has no layout or computed `color-scheme`
under jsdom, so it is covered by Playwright browser smoke tests in
`e2e/terminal.spec.js` (run via `npm run test:e2e`, served by python's
http.server per `playwright.config.js`).

`npm run coverage` runs the same `node --test` suite with
`--experimental-test-coverage` and fails if the unit-tested surface drops below
the pinned thresholds (lines, branches and functions all 100%). Treat those
thresholds as a ratchet: the whole gated surface currently sits at 100%, so the
gate is pinned there — raise a threshold as coverage climbs, never lower one to
make a change fit (add the missing test instead). Node enforces the thresholds
globally rather than per file, but with every gated module at 100% each one is
pinned individually too, stronger than a single-file floor. This is the
test step `validate.sh` and CI run — plain `npm test` stays available for fast
local iteration without the gate. The two DOM-glue modules (`js/terminal.js`,
`js/theme-toggle.js`) are excluded from the coverage accounting because their
paint-dependent half is deliberately covered by Playwright, not `node --test`,
so counting them here would demand covering code a node-only run can't reach.
The pure-logic modules and the shared `tools/` helpers carry the gate instead.
Passing `--test-coverage-exclude` overrides Node's default test-file exclusion,
so `test/**` is re-excluded explicitly alongside the two modules.

The page sends a strict Content-Security-Policy **twice**: a `<meta http-equiv>`
tag in `index.html` and an HTTP header in `.htaccess`. Both are `default-src
'none'` with `script-src 'self'` (the `js/` modules) plus a single `'sha256-…'`
for the inline guard, `style-src 'self'`, `img-src 'self'`, `manifest-src
'self'`, and `base-uri`/`form-action 'none'`. The `.htaccess` header is the
production
superset — it adds `frame-ancestors 'none'` and `upgrade-insecure-requests`,
which a meta CSP can't express — while the meta stays as the baseline the python
dev server actually applies (so CSP is testable locally). Three consequences when
editing:

- **Edit the inline `<head>` script and its hash changes.** `tools/check-csp.mjs`
  recomputes the sha256 of every inline script and fails the build if it isn't in
  **both** policies, so CI catches a stale hash. It also verifies the two policies
  agree on every other directive — the header may add only `frame-ancestors` and
  `upgrade-insecure-requests`, the rest must match — so loosening or dropping a
  directive in just one file is caught too. Run `npm run check:csp`, copy the
  `expected token` it prints into the `script-src` list in **both `index.html` and
  `.htaccess`**, and re-run. New external scripts under `js/` need no hash (covered
  by `'self'`); a `<script>` of a non-JS type like `application/ld+json` is data,
  not executed, and needs none either. The inline-script extraction logic used by
  `check-csp.mjs` is shared in `tools/inline-scripts.mjs` (also used by
  `test/themeGuard.test.js`), which — like the `<meta>` scan in `tools/meta.mjs` —
  is built on the shared HTML tag/attribute parser in `tools/html-tags.mjs`, so
  the quote-aware tag matching, comment-skipping and attribute parsing live in
  one place instead of a private regex per guard.
- The other security headers (`Strict-Transport-Security`,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, the cross-origin isolation trio
  `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy`/`Cross-Origin-Resource-Policy`,
  and a `Header always unset Server`) and caching rules (long-cache for
  static images, no-cache for HTML/CSS/JS) also live in `.htaccess`. None of
  these apply under the python dev server; verify them after a deploy with
  `curl -sI https://acurioustale.de/`.
- `.htaccess` is in the deploy set and ships to the web root; the rsync jail's
  path prefix already covers it, so no server-side change is needed.

## Deployment

Pushing to `main` auto-deploys via `.github/workflows/deploy.yml`, which runs
`deploy.sh`. The script copies the deploy set (`index.html`, `.htaccess`,
`robots.txt`, `sitemap.xml`, `humans.txt`, `manifest.webmanifest`, `css/`, `js/`
and `assets/`) into a
temporary staging directory, stamps the current Unix-millisecond time into
`LAST_DEPLOY` in the **staged** `js/commands.js` (so the terminal's `uptime`
counts from the live deploy), then mirrors the staging directory to the host with
`rsync -avz --delete`. The staging approach means the git working tree is never
modified — no dirty files, no restore-on-exit races. The `deploy` job therefore
sets up Node (for the stamping) in addition to SSH. CI authenticates with the
`DEPLOY_SSH_KEY` / `DEPLOY_KNOWN_HOSTS` repo secrets. The workflow sets
least-privilege token scopes at the top level (`permissions: contents: read`) —
neither the `validate` nor the `deploy` job writes to the repo (deploy
authenticates over SSH, not the `GITHUB_TOKEN`), so keep that block if you edit
the workflow.

The `TARGET` in `deploy.sh` **must keep its trailing slash** (`html/acurioustale.de/`).
The deploy key is jailed server-side to a forced `rsync` command that matches that
exact path prefix — no shell, no pull, no traversal. Changing the target breaks the
deploy. See the README for the full explanation.

Two deploy invariants: `deploy.sh` must stage the full deploy set (the
`DEPLOY_ASSETS` array — a file added to the site but not to that array never
ships), and because the jail only permits the one `rsync` push it is written
for, any new remote SSH command the deploy runs needs a matching allow-entry in
the forced command. That command lives on the host; a reviewed copy is checked
in at `ops/rsync-jail-acurioustale.sh` (server file authoritative, installed by
hand — see `ops/README.md`).

## Conventions

Commits follow Conventional Commits (`type(scope): imperative`, lowercase, ≤72-char header, no attribution trailers, hyphens not dashes). Scopes seen in history: `deploy`, `js`, `terminal`, `security`, `commands`, `tools`, `validate`, `links`, `deps`, `site`. Versioning is SemVer.

Formatting and linting are tool-enforced (Prettier, shfmt, stylelint, markdownlint, svgo, actionlint) — run `./validate.sh` before pushing to catch exactly what CI gates. Keep a large mechanical reformat in its own commit and list it in `.git-blame-ignore-revs` so `git blame` skips it.
