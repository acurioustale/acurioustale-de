# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repo.

## What this is

Personal landing page for [acurioustale.de](https://acurioustale.de): a single
static `index.html` styled as a terminal "whoami" card, one stylesheet, five ES
modules in `js/` — two the page loads (`terminal.js`, `theme-toggle.js`) plus the
three pure-logic modules they import (`theme.js`, `commands.js`,
`terminal-ui.js`). No framework, no build step. The deployed site ships no
dependencies (npm packages are dev-time linters plus the jsdom, fast-check and
Playwright test harnesses). `js/` modules are plain ES modules served as-is,
loaded with `type="module"` — no bundling.

Reporting contacts are stated twice on purpose: `SECURITY.md` is the prose
policy, `.well-known/security.txt` the RFC 9116 machine-readable half that a
scanner or a researcher's tooling finds on the deployed site. Checking that file
is split in two along what can break it. **Edit-driven, and the only half in the
gate:** `test/securityTxtParity.test.js` binds the two surfaces — the address
there must be the one `SECURITY.md` gives, the `Canonical` URL must sit on the
origin `index.html` declares canonical, the fields the RFC requires must be
present. Only a change to one of those files can fail it. **Calendar-driven, and
deliberately not in the gate:** whether the `Expires` date has passed is
`tools/check-security-txt-expiry.mjs` (`npm run check:security-txt`), run from
the non-gating `links` workflow, which already reads this file. An expired file
is invalid per the RFC, so the lapse is real — but it arrives on a date rather
than on a change, and the same rule that keeps `npm audit` off the gate applies
with more force to a deadline we set ourselves: it must not be able to redden a
green tree and block an unrelated deploy on a day nobody touched the security
contact. The guard exits 0 while the file is valid, exits 0 _with a notice_ for
the last 60 days, and exits 1 only once it has lapsed — a warning that fails is
just a failure with extra steps. Renewing is a one-line edit, and a human one:
re-confirm the contacts still hold, then set a new date.

The RFC 9116 field parsing both halves need is `tools/security-txt.mjs`
(`parseSecurityTxt`, `expiryStatus`), tested in `test/securityTxt.test.js` — a
helper with a test, per the rule below, not a regex written twice. It is not in
the mirrored `tools/shared/` bundle even though the sibling repo publishes a
security.txt too: the bundle's entry condition is byte-for-byte identity of
helper _and_ test, and the sibling's test for this one is written for vitest,
which the bundle's stdlib-only rule excludes. Both repos keep their own copy in
`tools/`, which at least keeps the two layouts symmetric. Should the sibling ever
move its test to `node:test`, promoting this helper into the bundle is the
obvious follow-up.

## Commands

```bash
python3 -m http.server 4174   # serve locally on the project port (.claude/launch.json, playwright.config.js)
npm run lint                  # lint JS, JSON, CSS and Markdown (ESLint, stylelint, markdownlint-cli2)
npm run format                # Prettier write across the repo (format:check verifies; used by CI)
npm test                      # run unit tests (node --test)
npm run coverage              # unit tests + coverage thresholds (the gate CI enforces)
npm run test:e2e              # run browser smoke tests (Playwright, chromium; separate from CI gate)
npm run links                 # check links locally (lychee, separate from CI gate)
npm run check:csp             # CSP guard: inline-script hashes, and meta/.htaccess agreement
npm run check:og              # og-image guard: the file matches the og: metas it advertises
npm run check:asset-refs      # every referenced local asset exists as a tracked file
npm run check:deploy-assets   # DEPLOY_ASSETS covers the tracked deploy set
npm run check:security-txt    # security.txt Expires: warns in the last 60 days, fails once lapsed (non-gating)
npm run check:stale-overrides # which `overrides` pins still raise the floor (report-only, hits the registry)
npm run check:shared          # the mirrored tools/shared/ bundle matches MANIFEST.sha256
npm run shared:hash           # regenerate that manifest after an intended bundle edit
./validate.sh                 # run the FULL gate locally: format, lint, tests+coverage, the four guards, shell, workflows, xml, svg
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
--experimental-test-coverage`, via `npm run coverage`) and the four Node guards
(`tools/check-csp.mjs`, `tools/check-og-image.mjs`, `tools/check-asset-refs.mjs` —
every local asset the markup, the linked stylesheets and the manifest reference
exists as a tracked file — and
`tools/check-deploy-assets.mjs`, which classifies every tracked file as shipped or
deliberately not). Deploys gate on all passing.

Run the same checks locally with `./validate.sh`. It downloads ShellCheck, shfmt
and actionlint at their pinned versions into a gitignored `.tools/` on first run
(falling back to the `PATH` copy, still version-asserted, when a download is
unavailable), so those three need no install step and no package manager can
drift them out from under their pins. `.tool-versions` is in asdf/mise format, so
`mise install` covers Node, the one system tool still installed rather than
fetched. On top of that it needs `npm install` for the npm-delivered tools
(Prettier, vnu, ESLint, stylelint, markdownlint-cli2, svgo), a JVM for vnu
(`brew install openjdk`), and xmllint, which ships with macOS/Xcode or comes
from `brew install libxml2`. `validate.sh` skips any still-uninstalled CLI (with
a notice — CI still enforces it), so it runs on a fresh checkout; Node and npm
are the only hard requirements.

Link checking, browser smoke tests and dependency advisories are separate and
non-gating: the `links` workflow runs lychee and the security.txt expiry guard
on PRs and weekly; the `e2e`
workflow runs the Playwright specs (a browser download) on PRs and pushes to
`main`; the `audit` workflow runs `npm audit` on PRs that change the dependency
tree and weekly. Deploys gate only on `validate`.

Static analysis is CodeQL, and it is configured **outside the checkout** — GitHub's
default setup, switched on in Settings > Code security, so nothing here records
it and `gh api repos/acurioustale/acurioustale-de/code-scanning/default-setup` is
how you confirm it. It scans the JS (`js/`, `tools/`, the tests) and the workflow
files, on PRs and weekly, and like the three above it is non-gating: findings land
in the Security tab as alerts to triage, and deploys still gate only on
`validate`. The sibling repo additionally runs Semgrep in its own workflow, but
only to cover its PHP endpoints, which CodeQL has no support for; adding a second
JS scanner here would duplicate what default setup already reads, so the gap that
workflow fills does not exist on this side.

Dev deps needing `package.json`: ESLint (plus `@eslint/js`, `@eslint/json`,
`eslint-plugin-html`, `globals`), stylelint (plus `stylelint-config-standard`),
markdownlint-cli2, Prettier, `vnu-jar` (the Nu Html Checker jar), svgo, jsdom (DOM
harness for wiring tests), `fast-check` (property tests), `@playwright/test`
(browser smoke tests). CI guards
use only Node's stdlib; pure-logic unit tests also use `fast-check`
(the `*.property.test.js` files); only the DOM-wiring tests
(`test/terminalDom.test.js`, `test/themeToggleDom.test.js`, via
`test/helpers/dom.js`) need jsdom; only `e2e/` specs need Playwright; the site
still ships no dependencies.

Prettier uses its defaults. Every tool is pinned exactly once, and where follows
from who delivers it. **npm-delivered** (Prettier, vnu via `vnu-jar`, ESLint,
stylelint, markdownlint-cli2, svgo): pinned by `package-lock.json`, run out of
`node_modules`, so `npm ci` makes CI and local byte-identical — never add these to
`.tool-versions`. **System tools** (Node, ShellCheck, shfmt, actionlint): pinned in
`.tool-versions`, read by both `validate.sh` (via its `tool_version` helper) and
deploy.yml's "Read tool versions" step; both download ShellCheck, shfmt and
actionlint as static binaries at that exact version into `.tools/` rather than
trusting the machine or the runner image (CI caches that directory, keyed on
`.tool-versions`), and `validate.sh` asserts the pin against any `PATH` copy it
has to fall back to (hard error). Node is the one pin `validate.sh` cannot fetch
for you, so it gets two bars: a wrong major is a hard error, since the JS half of
the gate would then prove nothing about CI, while a minor/patch difference is a
note (the gate still runs; `mise install node` applies the pin). Adding a tool to
the gate means picking one of those two authorities, not both.
`.claude/launch.json` defines a "site" launch config on port 4174.

There is deliberately **no `.mise.toml`**, and its absence is a decision rather
than an omission. The sibling repo carries one solely to stop mise reaching for
pins it must not supply — a language runtime that comes from Homebrew, and phars
that are not tools any version manager installs — because left enabled mise
either warns on every command or starts building the runtime from source. Every
pin here is a tool mise does have, so there is nothing to disable and `mise
install` in this directory is a no-op once they are present. What mise provides
is convenience (editor integration, `PATH`), never the gate's authority:
`validate.sh` and deploy.yml fetch their own pinned copies of the three
downloadable tools regardless, and neither reads anything but `.tool-versions`.
Adding a pin mise cannot install is the one thing that would call for that file.

Only one of those two authorities updates itself. `.github/dependabot.yml` opens
weekly version-update PRs for the npm tree and the workflow actions (security
updates run from the repo's security settings, with or without that file), so
`package-lock.json` moves on its own. `.tool-versions` does not: nothing watches
those upstreams, and a system tool drifts only when a local install wanders off
the pin. How `validate.sh` reports that differs by tool: for the three it
fetches, a stray local copy is consulted only when the download is unavailable,
and the pin assertion against it is a hard error; for Node, which it cannot
fetch, a wrong major is a hard error and a smaller difference a note. CI,
fetching the pinned binary, stays green either way. Bumping a system pin is a hand-edit, and the version
it names is the one CI downloads, so check the release publishes the asset
deploy.yml fetches.

vnu has no version-pinnable download: upstream publishes only a rolling `latest`
GitHub release (versioned jar tags stopped at 20.6.30), which is why it comes from
npm instead. The jar ships inside the `vnu-jar` tarball, so the lockfile's integrity
hash covers it. That package's `postinstall` would additionally fetch its own
Temurin JDK; npm's allow-scripts gate denies it by default and it should stay denied
— the download is outside lockfile integrity, and both CI (`setup-java`) and local
(`brew install openjdk`) supply a JVM already.

Transitive dev deps of `markdownlint-cli2` that carry an advisory its own pins
do not clear are held at a patched version via `overrides` in `package.json`.
Read which packages and ranges are pinned there, not here — both move as
advisories land and as the linter's own dependencies catch up. Keep an override
only while it is still doing that work: once the linter ships a patched version
itself, the pin stops raising the floor and starts holding the tree below what
the linter expects, which is a different thing than what it was added for.
`npm run check:stale-overrides` is what answers that per pin — it resolves and
audits the tree with each override removed in turn, so a clean result means
upstream has caught up and the entry can go. It runs report-only in the `audit`
workflow, never on the gate. All
of them are dev-only tooling linting our own files — no untrusted input.

`npm audit` is not expected to be clean at all times, which is why it is in the
non-gating `audit` workflow and in neither `validate.sh` nor the gate. That
workflow splits the two trees on their actual stakes: the runtime tree is empty
(the site ships no dependencies) so any advisory there fails the job, while the
dev tree is reported and never fatal. Advisories in transitive dev deps are left
to Dependabot; add an `overrides` pin only when Dependabot cannot resolve it or
the advisory is reachable from our own runs (as with the pins above). Check the advisory's own patched version before trusting `npm audit
fix --force`: it resolves by dependency range, so it can land on a version that
is still inside the advisory's vulnerable range.

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
scripts (via `tools/shared/inline-scripts.mjs`).

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
each of those three modules carries a `fast-check` property test beside its
example test — `test/theme.property.test.js`,
`test/commands.property.test.js`, `test/terminalUi.property.test.js` — asserting
invariants across the whole input space, so a regression past a hand-picked
example still fails the build. Property tests are first-class siblings of the
example tests, one file per module (`<module>.property.test.js`), not one omnibus
file: an invariant lands next to the module it constrains, so adding a pure
function means asking what invariant it has, not appending to a shared pile.
The invariants held today: `nextTheme` is a closed three-way cycle whose first
step off auto always flips the colour, `normalizeMode` is total onto the three
modes, `metaMediaFor` applies exactly one forced meta; `formatUptime` never goes
negative and round-trips to elapsed minutes, `reply` depends only on its tokens
and never on the whitespace between them, `blockFor` answers a static block or
nothing and strips trailing slashes only after an `ls` operand; `recallHistory` keeps its
index in bounds for any key sequence, `capLimit` stays a non-negative bound,
`shouldRefit` is exactly a width-change predicate. `help()` is a fixed listing
already bound to its table by example tests, so it carries no property of its
own — do not invent a weak invariant to fill the grid.

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
  `check-csp.mjs` is shared in `tools/shared/inline-scripts.mjs` (also used by
  `test/themeGuard.test.js`), which — like the `<meta>` reads in the CSP and
  og-image guards (via `findTags`) — is built on the shared HTML tag/attribute
  parser in `tools/shared/html-tags.mjs`, so quote-aware tag matching, comment-skipping
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

That split is the rule, not a one-off. Every parsing rule a guard needs lives in
a `tools/` helper with a test of its own: `shared/html-tags.mjs`
(`shared/htmlTags.test.js`), `shared/html-comments.mjs`
(`shared/htmlComments.test.js`, the commented-out-tag skip),
`shared/inline-scripts.mjs` (`shared/inlineScripts.test.js`),
`shared/csp-directives.mjs` (`shared/cspDirectives.test.js`, first-wins parsing
plus the two-policy comparison), `shared/htaccess-csp.mjs`
(`shared/htaccessCsp.test.js`, Apache line
continuations, comments, request scopes, last-wins, and matching only the
enforced `Content-Security-Policy` — never `-Report-Only`),
`shared/og-dimensions.mjs` (`shared/ogDimensions.test.js`, the share card the
markup declares — its path out of the `og:image` URL, its size out of the
`og:image:width`/`og:image:height` metas with a missing tag told apart from an
unreadable value, and the PNG IHDR header the file answers with),
`shared/css-tokens.mjs`
(`shared/cssTokens.test.js`, the `light-dark()` palette the theme-colour,
manifest and fallback tests bind to) `shared/overrides.mjs`
(`shared/overrides.test.js`, what a manifest looks like with one `overrides`
entry removed and how npm's audit verdict reads) and `shared/asset-refs.mjs`
(`shared/assetRefs.test.js`, what counts as a local reference — the URL-carrying
attributes incl. `srcset` lists, the share-image metas whose same-origin
absolute URL an attribute-only scan misses, `url()` targets resolved against
their stylesheet's directory, and the manifest lists). `test/lastDeployStamp.test.js` and
`test/lastLoginStamp.test.js` do the same for `deploy.sh`'s two stamping
regexes. When a guard needs to read something new, add it as a helper with a
test — never a private regex inside the guard. The repo's most common gate
failure by far is a guard regex that was subtly wrong on real input (see
PRs #248, #254, #259, #270 and #271), and it is the helper's test that catches
it.

### The mirrored `tools/shared/` bundle

Every one of those helpers — `html-tags.mjs`, `html-comments.mjs`,
`inline-scripts.mjs`, `csp-directives.mjs`, `htaccess-csp.mjs`,
`og-dimensions.mjs`, `css-tokens.mjs`, `overrides.mjs`, `asset-refs.mjs` — lives
in `tools/shared/` and is duplicated **byte-for-byte** in the sibling repo
[acurioustale/comparebuilds-app](https://github.com/acurioustale/comparebuilds-app).
Both repos validate the same kind of markup, the same `.htaccess` CSP, the same
Open Graph card, the same `light-dark()` palette, the same `overrides` pins and
the same local asset references with the same guards, and neither wants a
private copy of a regex that has already been got wrong once. This is deliberately not a package: no publish step, no version
to bump, no dependency for a site that ships none — a vendored bundle plus an
alarm.

The bundle's own tests live in `tools/shared/` beside the helpers, **not** in
`test/`. That is a deliberate exception to the "all tests live in `test/`"
convention, and the only reason for it is that the bundle must be byte-identical
across two repos that put their tests in different places — a test importing
`../tools/shared/html-tags.mjs` could not be. Beside the helper, `./html-tags.mjs`
resolves in both. `node --test` discovers them recursively, so nothing about the
test or coverage scripts needed to change except one exclusion: `npm run
coverage` excludes `tools/shared/**/*.test.js`, or the bundle's tests would be
counted as gated source. The helpers themselves stay squarely inside the
coverage gate, at 100%, where they belong — the exclusion is written to match
tests, not a list of files, so it does not go stale as the bundle grows.

What may go in follows from the same constraint. Everything in the bundle —
helpers and tests alike — depends on the Node standard library and nothing else:
`node:test` and `node:assert/strict`, no test framework. The two repos do not run
the same test runner, so a file reaching for one stops being mirrorable the
moment it is written. A helper that needs more than the stdlib does not belong
here; keep it in `tools/` on this side and let the other repo have its own.

Two alarms watch the bundle, because one repo's gate cannot see the other:

- **Locally, on the gate.** `tools/shared/MANIFEST.sha256` pins every file in the
  bundle (`<sha256>  <filename>`, sorted), and `npm run check:shared`
  (`tools/check-shared.mjs`, run from `validate.sh` and deploy.yml) fails if the
  set of files or any hash differs. So editing a shared helper without
  consciously re-hashing breaks the build, and the failure message is where you
  are told to mirror the change. Regenerate with `npm run shared:hash` after an
  intended edit; it is a no-op on a clean tree.
- **Across repos, weekly.** `.github/workflows/shared-sync.yml` shallow-sparse-
  clones the sibling's `tools/shared/` and diffs the two bundles, on a weekly
  cron, on `workflow_dispatch`, and on any push to `main` that touches the
  bundle. It is **non-gating**, like `links`, `audit` and `e2e`: a sibling that
  has not yet mirrored a change must never block a release here, so a red run is
  a signal to go mirror it. The clone is unauthenticated, because both repos are
  public; it is never gated on a credential existing, since that would leave the
  job skipping green against a repo it can already read — the quiet failure the
  workflow exists to prevent. Should either repo go private, a fine-grained
  read-only PAT in a `SHARED_SYNC_TOKEN` secret is picked up automatically: the
  clone is attempted either way, a failure without a token reports what is
  missing, and a failure with one set is a hard error rather than a skip.

The rule the whole arrangement exists to enforce: **a fix to any shared helper
has to land in BOTH repos.** The manifest makes you notice you touched one; the
weekly diff makes you notice you only did it once.

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
`deploy.sh`. The script extracts the deploy set (`index.html`, `.htaccess`,
`robots.txt`, `sitemap.xml`, `humans.txt`, `manifest.webmanifest`, `css/`, `js/`,
`assets/`) from `HEAD` with `git archive` into a temporary staging directory — so
a hand-run deploy ships the commit, never uncommitted working-tree edits — stamps the current
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
≤72-char header, no attribution trailers, hyphens not dashes). Types used here go
beyond the global set: `ci` (workflow changes), `build` (dependency and pinning
changes, the type Dependabot opens PRs with), `style` and `perf` also appear.
Scopes seen in history: `tools`, `security`, `deploy`, `terminal`, `js`, `theme`,
`commands`, `validate`, `deps`, `deps-dev`, `site`, `ops`, `links`, `e2e`, `ci`.
Versioning is SemVer.

A change lands with the test that binds it. Nearly every `fix` in history adds or
tightens a test that fails without the fix — a guard fix comes with a helper test,
a DOM-wiring fix with a jsdom test, a paint-dependent one with a Playwright spec.
Prefer binding two surfaces to each other over restating a value in both.

Keep this file free of facts that churn faster than it is edited. Naming a
specific open advisory, version or transient state here goes stale within days and
then misleads (#269); state the policy and point at the standing example instead.

Formatting and linting are tool-enforced (Prettier, shfmt, stylelint,
markdownlint, svgo, actionlint) — run `./validate.sh` before pushing to catch
exactly what CI gates. Keep a large mechanical reformat in its own commit and list
it in `.git-blame-ignore-revs` so `git blame` skips it.
