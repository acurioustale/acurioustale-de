# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repo.

## What this is

Personal landing page for [acurioustale.de](https://acurioustale.de): a single
static `index.html` styled as a terminal "whoami" card, one stylesheet, two small
ES modules in `js/`. No framework, no build step. The deployed site ships no
dependencies (npm packages are dev-time linters plus the jsdom, fast-check and
Playwright test harnesses). `js/` modules are plain ES modules served as-is,
loaded with `type="module"` — no bundling.

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

No build step — edit files and reload. On every push and PR, CI: validates HTML,
CSS, SVG (Nu Html Checker); checks `sitemap.xml` XML well-formedness (xmllint);
checks formatting (Prettier); keeps SVGs optimised (svgo); lints every tracked
shell script incl. `ops/` (ShellCheck, shfmt, discovered via `git ls-files
'*.sh'`), workflows (actionlint), JS/JSON/inline-HTML scripts (ESLint with
`@eslint/json` and `eslint-plugin-html`), CSS (stylelint), Markdown
(markdownlint-cli2); runs unit tests under a coverage gate (`node --test
--experimental-test-coverage`, via `npm run coverage`) and the CSP, og-image and
asset-reference guards (`tools/check-csp.mjs`, `tools/check-og-image.mjs`,
`tools/check-asset-refs.mjs` — the last asserts every local asset the markup and
manifest reference exists as a tracked file). Deploys gate on all passing.

Run the same checks locally with `./validate.sh` (needs `brew install vnu
shellcheck shfmt actionlint` plus `npm install` for npm-only tools: Prettier,
ESLint, stylelint, markdownlint-cli2, svgo; xmllint ships with macOS/Xcode or via
`brew install libxml2`). `validate.sh` skips any uninstalled brew CLI (with a
notice — CI still enforces it), so it runs on a fresh checkout; Node and npm are
the only hard requirements.

Link checking and browser smoke tests are separate and non-gating: the `links`
workflow runs lychee on PRs and weekly; the `e2e` workflow runs the Playwright
specs (a browser download) on PRs and pushes to `main`. Deploys gate only on
`validate`.

Dev deps needing `package.json`: ESLint (plus `@eslint/js`, `@eslint/json`,
`eslint-plugin-html`, `globals`), stylelint (plus `stylelint-config-standard`),
markdownlint-cli2, Prettier, svgo, jsdom (DOM harness for wiring tests),
`fast-check` (property tests), `@playwright/test` (browser smoke tests). CI guards
use only Node's stdlib; pure-logic unit tests also use `fast-check`
(`test/properties.test.js`); only the DOM-wiring tests
(`test/terminalDom.test.js`, `test/themeToggleDom.test.js`, via
`test/helpers/dom.js`) need jsdom; only `e2e/` specs need Playwright; the site
still ships no dependencies.

Prettier uses its defaults. Keep the Prettier, shfmt, actionlint and Node
versions pinned in `.tool-versions` in sync — `validate.sh` asserts the shfmt and
actionlint versions when present (hard error on mismatch; Node is a warning),
Prettier's version is enforced via the npm lockfile. `.claude/launch.json`
defines a "site" launch config on port 4174.

Two transitive dev deps of `markdownlint-cli2` carried advisories, pinned to
patched versions via `overrides` in `package.json`: `markdown-it` (`^14.2.0`) and
`js-yaml` (`^4.3.0`). The js-yaml pin deliberately stays on 4.x: the fix for its
quadratic-complexity DoS in merge-key handling was backported to 4.2.0, while 5.x
drops the default export `markdownlint-cli2` imports (would break it). Both are
dev-only tooling linting our own files — no untrusted input — and `npm audit` is
clean.

## Theme system (the one piece of real logic)

Split across the stylesheet, the inline `<head>` guard and the
`js/theme-toggle.js` module — easy to break if you touch only one. Three-way
model: **auto** (follow OS), **light**, **dark**; the toggle cycles all three.
Because **auto** looks like the OS preference, one step of any three-way cycle
can't change the colour; the cycle order is derived from the OS preference so that
unavoidable no-op lands on the return to **auto**, and every other click visibly
flips light/dark (no dead first click on a light-mode OS). That order is the pure
function `nextTheme()` in `js/theme.js`, tested in `test/theme.test.js` — change
the order there, not by editing the toggle inline.

- `css/style.css` sets `color-scheme: light dark` on `:root` and defines each
  colour **once** as `--token: light-dark(<light>, <dark>)`. The browser resolves
  each `light-dark()` to its light/dark value from the used `color-scheme`, so the
  OS preference drives colours for free (this is the no-JS path). The toggle
  re-maps no colour — it only forces the scheme: `:root[data-theme="light"]` sets
  `color-scheme: light`, `:root[data-theme="dark"]` sets `color-scheme: dark`, and
  every token follows. (`light-dark()` is Baseline since mid-2024 — Chrome 123,
  Firefox 120, Safari 17.5.)
- Older browsers without `light-dark()` get a fallback that **duplicates** the
  palette: the plain `:root` block carries the light values, an `@supports not
(color: light-dark(...))` block carries the dark values (applied by both
  `prefers-color-scheme: dark` and the forced `:root[data-theme="dark"]`). So when
  adding/renaming a colour, change the `light-dark()` token **and** its fallback
  copies. `test/themeFallback.test.js` binds every fallback value back to its
  `light-dark()` token, so a forgotten copy fails the build.
- Theme logic lives in two places. One small inline script in `<head>` applies a
  saved theme from `localStorage` before first paint to avoid a flash; it must
  stay inline (external/deferred would flash). `js/theme-toggle.js` (a
  `type="module"` script at end of `<body>`) injects the toggle button as
  progressive enhancement — without JS, the OS preference still drives colours and
  no dead control shows. "auto" clears the `data-theme` attribute and the
  `localStorage` key, handing control to the OS. Valid override =
  `normalizeMode()` in `js/theme.js` (reused by the toggle); the inline guard
  duplicates that check by hand only because it runs before any module can load.

Keep consistent: the `localStorage` key is `"theme"` with values
`"light"`/`"dark"` (absent = auto); the override is the `data-theme` attribute on
`<html>`. The two `<meta name="theme-color">` values (one per
`prefers-color-scheme`) must equal the CSS `--page-bg` light/dark sides;
`test/themeColor.test.js` enforces that so browser chrome can't drift from the
page background. The web app manifest's `background_color`/`theme_color` track the
dark `--page-bg` side (a manifest carries one colour, so the site picks dark);
`test/manifestColor.test.js` binds them so installed-app chrome/splash can't
drift. `theme-toggle.js` locates those two metas by their stable `data-scheme`
attribute (`meta[name="theme-color"][data-scheme="light"|"dark"]`), not their
palette hex, so nothing couples to the colours; `test/themeToggleMeta.test.js`
binds those selectors back to the metas so renaming a `data-scheme` value or
dropping a meta can't silently break the toggle's chrome-tint sync (the guarded
per-meta lookup would otherwise just skip that meta's update).
`test/themeGuard.test.js` verifies the inline pre-paint guard stays consistent
with the module-based `normalizeMode()` by extracting and evaluating the inline
scripts (via `tools/inline-scripts.mjs`).

## JavaScript layout and the CSP

`index.html` carries exactly one inline script — the pre-paint theme guard above.
(A `<script type="application/ld+json">` block is structured data for search
engines; data, not executable, needs no CSP hash.) Everything else is in `js/`,
loaded with `type="module"`: `theme-toggle.js` (toggle UI) and `terminal.js` (the
interactive guest-shell easter egg, unrelated to theming). The card is dressed as
a macOS Terminal session; the prompt accepts commands: `ls` lists the directory
(`projects/` and `whoami.sh`), which you then run as in a real shell —
`./whoami.sh` and `ls projects/` reprint the boot blocks; `uptime`/`date`/`echo`
behave like their shell namesakes; `sudo` returns the classic lecture; `clear`
empties the screen (hiding boot output, like a real terminal); `help` lists
commands (filesystem entries are discovered via `ls`, not advertised). Everything
else is denied with a fitting shell error (privileged commands like
`su`/`doas`/`chmod`/`chown` → "permission denied"; paths with `/` → "No such file
or directory"; else → "command not found").

The pure logic each depends on is factored out for testing — `theme.js`
(`nextTheme()`, `normalizeMode()`, `metaMediaFor()`), `commands.js` (`reply()` for
replies and denials, `help()` for the listing, `formatUptime()` for `uptime`) and
`terminal-ui.js` (`capLimit()`, `recallHistory()`, `shouldRefit()` — scrollback
cap, history-recall arithmetic, width-change re-freeze guard lifted from the event
handlers) — exercised by `test/theme.test.js`, `test/commands.test.js`,
`test/terminalUi.test.js`, `test/themeColor.test.js`, `test/manifestColor.test.js`,
`test/themeFallback.test.js`, `test/themeGuard.test.js`. On top of those,
`test/properties.test.js` asserts invariants across the whole input space with
`fast-check` — `nextTheme` is a closed three-way cycle, `formatUptime` never goes
negative and round-trips to elapsed minutes, `recallHistory` keeps its index in
bounds for any key sequence, `capLimit` stays a non-negative bound — so a
regression past a hand-picked example still fails the build.

The DOM glue in the two UI modules is thin, but the wiring (a click, keystroke or
storage event mutating the DOM) is covered by jsdom tests in
`test/terminalDom.test.js` and `test/themeToggleDom.test.js`, which drive the
modules against a document built from the real `index.html` (see
`test/helpers/dom.js`). Layout- and paint-dependent behaviour — `fitScreen`'s
height freeze, the input growing with its content, click-to-focus, the theme
toggle actually repainting — has no layout or computed `color-scheme` under jsdom,
so it's covered by Playwright smoke tests in `e2e/terminal.spec.js` (via `npm run
test:e2e`, served by python's http.server per `playwright.config.js`).

`npm run coverage` runs the `node --test` suite with
`--experimental-test-coverage` and fails if the unit-tested surface drops below
the pinned thresholds (lines, branches, functions all 100%). Treat thresholds as a
ratchet: the gated surface sits at 100%, so the gate is pinned there — raise a
threshold as coverage climbs, never lower one to make a change fit (add the
missing test instead). Node enforces thresholds globally, not per file, but with
every gated module at 100% each is pinned individually too. This is the test step
`validate.sh` and CI run — plain `npm test` stays available for fast local
iteration without the gate. The two DOM-glue modules (`js/terminal.js`,
`js/theme-toggle.js`) are excluded from coverage accounting because their
paint-dependent half is covered by Playwright, not `node --test`, so counting them
would demand covering code a node-only run can't reach. The pure-logic modules and
shared `tools/` helpers carry the gate instead. `--test-coverage-exclude`
overrides Node's default test-file exclusion, so `test/**` is re-excluded
explicitly alongside the two modules.

The page sends a strict Content-Security-Policy **twice**: a `<meta http-equiv>`
tag in `index.html` and an HTTP header in `.htaccess`. Both are `default-src
'none'` with `script-src 'self'` (the `js/` modules) plus a single `'sha256-…'`
for the inline guard, `style-src 'self'`, `img-src 'self'`, `manifest-src 'self'`,
`base-uri`/`form-action 'none'`. The `.htaccess` header is the production superset
— it adds `frame-ancestors 'none'` and `upgrade-insecure-requests`, which a meta
CSP can't express — while the meta is the baseline the python dev server applies
(so CSP is testable locally). Three consequences when editing:

- **Edit the inline `<head>` script and its hash changes.** `tools/check-csp.mjs`
  recomputes the sha256 of every inline script and fails the build if it isn't in
  **both** policies. It also verifies the two policies agree on every other
  directive — the header may add only `frame-ancestors` and
  `upgrade-insecure-requests`, the rest must match — so loosening or dropping a
  directive in just one file is caught too. Run `npm run check:csp`, copy the
  `expected token` it prints into the `script-src` list in **both `index.html` and
  `.htaccess`**, re-run. New external scripts under `js/` need no hash (covered by
  `'self'`); a `<script>` of a non-JS type like `application/ld+json` is data, not
  executed, and needs none either. The inline-script extraction logic in
  `check-csp.mjs` is shared in `tools/inline-scripts.mjs` (also used by
  `test/themeGuard.test.js`), which — like the `<meta>` reads in the CSP and
  og-image guards (via `findTags`) — is built on the shared HTML tag/attribute
  parser in `tools/html-tags.mjs`, so quote-aware tag matching, comment-skipping
  and attribute parsing live in one place, not a private regex per guard.
- The other security headers (`Strict-Transport-Security`,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, the cross-origin isolation trio
  `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy`/`Cross-Origin-Resource-Policy`)
  and caching rules (long-cache for static images, no-cache for HTML/CSS/JS) also
  live in `.htaccess`. There is deliberately no `Header unset Server`: mod_headers
  can't remove the core Server banner from `.htaccess`, and the host sets
  `ServerTokens Prod` (only a bare `Apache` token, no version, is exposed) — see
  the comment in `.htaccess`. None apply under the python dev server; verify them
  after a deploy with `curl -sI https://acurioustale.de/`.
- `.htaccess` is in the deploy set and ships to the web root; the rsync jail's
  path prefix already covers it — no server-side change needed.

Neither the python dev server nor the gate exercises the `.htaccess` **rewrite**
rules (the HTTPS-redirect / X-Forwarded-Proto trust logic), and curl against the
live HTTPS site can't reach the plain-HTTP `:80` path they guard. To test rewrite
changes locally, run system Apache 2.4 (`/usr/sbin/httpd` ships on macOS) with a
minimal vhost + `AllowOverride All`; swap the `REMOTE_ADDR` allowlist regex to a
TEST-NET address to emulate an untrusted public client forging
`X-Forwarded-Proto`. Production topology as probed: Apache answers `:80` and
terminates TLS on `:443` directly, with no TLS-terminating proxy in the request
path today — so that `X-Forwarded-Proto` allowlist is purely defensive. If a
terminator is ever added, confirm the source address Apache sees and extend the
allowlist, or the redirect loops.

## Deployment

Pushing to `main` auto-deploys via `.github/workflows/deploy.yml`, which runs
`deploy.sh`. The script copies the deploy set (`index.html`, `.htaccess`,
`robots.txt`, `sitemap.xml`, `humans.txt`, `manifest.webmanifest`, `css/`, `js/`,
`assets/`) into a temporary staging directory, stamps the current
Unix-millisecond time into `LAST_DEPLOY` in the **staged** `js/commands.js` (so
the terminal's `uptime` counts from the live deploy) and the same instant into the
staged `index.html`'s "Last login" banner (so it can't drift from that `uptime`),
then mirrors staging to the host with `rsync -avz --delete`. Staging means the git working tree is never
modified — no dirty files, no restore-on-exit races. The `deploy` job therefore
sets up Node (for stamping) in addition to SSH. CI authenticates with the
`DEPLOY_SSH_KEY` / `DEPLOY_KNOWN_HOSTS` repo secrets. The workflow sets
least-privilege token scopes at the top level (`permissions: contents: read`) —
neither `validate` nor `deploy` writes to the repo (deploy authenticates over SSH,
not `GITHUB_TOKEN`), so keep that block if you edit the workflow.

The `TARGET` in `deploy.sh` **must keep its trailing slash**
(`html/acurioustale.de/`). The deploy key is jailed server-side to a forced
`rsync` command matching that exact path prefix — no shell, no pull, no traversal.
Changing the target breaks the deploy. See the README for the full explanation.

Two deploy invariants: `deploy.sh` must stage the full deploy set (the
`DEPLOY_ASSETS` array — a file added to the site but not to that array never
ships); and because the jail permits only the one `rsync` push it is written for,
any new remote SSH command the deploy runs needs a matching allow-entry in the
forced command. That command lives on the host; a reviewed copy is checked in at
`ops/rsync-jail-acurioustale.sh` (server file authoritative, installed by hand —
see `ops/README.md`).

## Conventions

Commits follow Conventional Commits (`type(scope): imperative`, lowercase,
≤72-char header, no attribution trailers, hyphens not dashes). Scopes seen in
history: `deploy`, `js`, `terminal`, `security`, `commands`, `tools`, `validate`,
`links`, `deps`, `site`. Versioning is SemVer.

Formatting and linting are tool-enforced (Prettier, shfmt, stylelint,
markdownlint, svgo, actionlint) — run `./validate.sh` before pushing to catch
exactly what CI gates. Keep a large mechanical reformat in its own commit and list
it in `.git-blame-ignore-revs` so `git blame` skips it.
