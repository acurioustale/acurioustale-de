# acurioustale.de

Personal landing page — a terminal-styled "whoami" card, deployed at
[acurioustale.de](https://acurioustale.de).

It's a single static `index.html` with one stylesheet, no framework and no build
step. A little JavaScript powers it. One tiny inline script applies a saved theme
before first paint (to avoid a flash); the rest lives in two small ES modules in
`js/`. One injects an auto/light/dark toggle as progressive enhancement — without
JavaScript the OS `prefers-color-scheme` still drives the colours via CSS and no
dead control is shown; the chosen theme is persisted in `localStorage`. The other
dresses the card as a macOS Terminal session and turns the prompt into an
interactive guest-shell easter egg: a handful of commands work —
`ls` reveals `projects/` and `whoami.sh` to discover and run (`./whoami.sh` and
`ls projects/` reprint the boot output), `uptime`, `date` and `echo` behave like
their shell namesakes, `sudo` earns the classic lecture, `clear` empties the
screen and `help` lists the commands — and everything else is denied with a
fitting shell error. The pure logic behind both (the theme cycle, and the command replies and
help text) is factored into `js/theme.js` and `js/commands.js` and unit-tested in
`test/`.

```text
.
├── index.html           ← the page (markup + the inline pre-paint theme guard)
├── css/style.css        ← terminal styling, light/dark via light-dark() tokens
├── js/                  ← theme toggle + terminal easter egg, and their pure logic
├── test/                ← unit tests (pure logic) + jsdom DOM-wiring tests (node --test)
├── e2e/                 ← Playwright browser smoke tests (npm run test:e2e)
├── tools/               ← dev-time CI checks (CSP hash, og-image, inline-script extraction)
├── assets/              ← favicon (SVG + 32px PNG), apple-touch icon, PWA icons (192/512), Open Graph share image
├── ops/                 ← reviewed copy of the server-side rsync deploy jail
├── .htaccess            ← Apache security headers + production CSP (deployed)
├── robots.txt           ← allow-all crawl rule + sitemap pointer
├── sitemap.xml          ← single-page sitemap
├── humans.txt           ← the people behind the site (linked via rel="author")
├── manifest.webmanifest ← PWA web app manifest (name, icons, theme colour)
├── og-image.src.svg     ← editable source for assets/og-image.png (not deployed)
├── lychee.toml          ← link-checker config (used by the links workflow)
├── CLAUDE.md            ← guidance for AI coding assistants
├── GEMINI.md            ← symlink to CLAUDE.md (same guidance, for Gemini)
├── SECURITY.md          ← security policy: how to report a vulnerability
├── package.json         ← npm-only dev tools (ESLint, stylelint, markdownlint-cli2, Prettier, svgo, jsdom, fast-check, Playwright)
├── eslint.config.mjs    ← ESLint flat config (JS and JSON linting)
├── svgo.config.mjs      ← svgo configuration for SVG optimisation
├── playwright.config.js ← Playwright config for the e2e smoke tests
├── .github/workflows/   ← deploy (gating) + links (lychee) + e2e (Playwright) CI
├── validate.sh          ← run all gating CI checks locally
└── deploy.sh            ← rsync deploy to the web host (via staging directory)
```

## Development

No tooling required to edit — open `index.html` in a browser, or serve the folder
for a realistic origin:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

Before pushing, run the same gating checks CI runs (validation, formatting,
linting, the unit tests and the CSP/og-image guards). Install the tools once,
then run the script:

```bash
brew install vnu shellcheck shfmt actionlint   # one-time
npm install                                    # one-time (ESLint, stylelint, markdownlint-cli2, Prettier, svgo, jsdom, fast-check, Playwright)
./validate.sh
```

`validate.sh` skips any of the brew-installed CLIs that aren't present (with a
notice — CI always enforces them), so it stays runnable on a fresh checkout;
Node and npm are the only hard requirements. When a pinned brew CLI (shfmt,
actionlint) _is_ present, it asserts the version matches the one in `.tool-versions`,
so a drifted local tool is caught before it surfaces as a mystery CI reformat.
Node is also pinned in `.tool-versions`; a version mismatch there emits a warning
(not a hard error) since it can still pass locally while behaving differently in CI.

The tests come in layers. `npm test` (`node --test`) runs the pure-logic unit
tests plus jsdom DOM-wiring tests that drive the modules against a document built
from the real `index.html`. The pure-logic layer pairs example-based tests with
`fast-check` property tests (`test/properties.test.js`) that assert the
invariants across the whole input space. The `validate.sh` gate runs the same suite through
`npm run coverage` (`node --test --experimental-test-coverage`), which fails if
the unit-tested surface drops below the pinned thresholds (lines 98%, branches
95%, functions 100%); the two DOM-glue modules are excluded from that accounting
because their paint-dependent half is covered by Playwright, not `node --test`.
Layout- and paint-dependent behaviour jsdom can't model — the frozen screen
height, the input growing with its content, click-to-focus and the toggle
actually repainting the page — is covered by Playwright browser smoke tests. Those run separately (they
download a browser, so they never gate a deploy) on pull requests and pushes to
`main` via the [`e2e` workflow](.github/workflows/e2e.yml). To run them by hand
(the config starts python's `http.server` itself and reuses a running one):

```bash
npx playwright install chromium   # one-time browser download
npm run test:e2e
```

Links are checked separately (they need the network and external hosts flake, so
they never gate a deploy) — on pull requests and a weekly schedule via the
[`links` workflow](.github/workflows/links.yml). To check them by hand:

```bash
brew install lychee
lychee --config lychee.toml index.html README.md CLAUDE.md SECURITY.md
```

### Regenerating the share image

`assets/og-image.png` (the Open Graph card) is rendered from `og-image.src.svg`.
The SVG is the source of truth; edit it, then rasterise to a 1200×630 PNG. The
text must be rendered by a real browser (Menlo), so the reliable path is to load
the SVG in a browser and draw it to a `<canvas>` at 1200×630, then export PNG —
headless tools without a proper font stack drop the text.

This last step is manual, so it's easy to forget after editing the source. CI
can't verify the rendered text (that's the whole font problem), but it does
guard the dimensions: `tools/check-og-image.mjs` fails the build if
`assets/og-image.png` isn't the declared 1200×630. So a wrong-size export is
caught; a stale-but-correctly-sized one is on you to remember to regenerate.

## Deployment

Pushing to `main` deploys automatically. The
[`deploy` workflow](.github/workflows/deploy.yml) first runs a `validate` gate: it
validates the HTML, CSS and SVG with the
[Nu Html Checker](https://validator.github.io/validator/), checks XML
well-formedness of `sitemap.xml` (xmllint), checks formatting with Prettier,
keeps the SVGs optimised with svgo, lints the shell scripts (ShellCheck, shfmt),
the workflows (actionlint), and the JS, JSON, inline HTML scripts, CSS and
Markdown (ESLint with `@eslint/json` and `eslint-plugin-html`, stylelint,
markdownlint-cli2), runs the unit tests under a coverage gate (`node --test
--experimental-test-coverage`), and checks the CSP hash
and og-image dimensions. Only if everything passes does it run `deploy.sh`. The
workflow runs on every push to `main` (and can be triggered manually from the
Actions tab); pull requests run the same gate without deploying. Both jobs run
with least-privilege `GITHUB_TOKEN` scopes (`permissions: contents: read`):
neither writes to the repo, and the deploy authenticates to the host over SSH
rather than the token.
Link checking runs separately (see Development) so flaky external hosts never
block a deploy.

`deploy.sh` copies the deploy set — `index.html`, `.htaccess`, `robots.txt`,
`sitemap.xml`, `humans.txt`, `manifest.webmanifest`, `css/`, `js/` and
`assets/` — into a temporary
staging directory, stamps the current Unix-millisecond time into `LAST_DEPLOY` in
the staged `js/commands.js` (so the terminal's `uptime` counts from the live
deploy), then mirrors the staging directory to the web root on the host with
`rsync -avz --delete`:

```text
web4186@http2.core-networks.de:html/acurioustale.de/
```

The staging-directory approach means the git working tree is never modified — no
dirty files, no restore-on-exit races with local dev servers.

CI authenticates with a dedicated SSH deploy key, stored as the repository
secrets `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS`. The key is harmless if
leaked: on the host it's pinned to a forced command
(`~web4186/bin/rsync-jail-acurioustale.sh`, wired up in that account's
`authorized_keys`) that allows only an rsync _push_ into
`html/acurioustale.de/` — no shell, no pull, and no path traversal outside that
directory. This is why the deploy target in `deploy.sh` must keep its trailing
slash; the jail matches on that exact prefix. See
[Setting up the CI deploy key](#setting-up-the-ci-deploy-key) below to provision
or rotate it from scratch.

To deploy by hand instead (uses your own SSH access), run:

```bash
./deploy.sh            # live
./deploy.sh --dry-run  # preview what would change
```

The `--delete` flag makes `html/acurioustale.de/` an exact mirror of the staged
deploy set. Because the staging directory holds only the files listed above,
rsync removes anything else it finds in the target on the host — both files
dropped from the set locally and any file placed there out of band. Keep the
deploy target to the site alone: a file hand-placed in it (an ACME challenge, a
search-console verification file) is deleted on the next deploy unless it's
added to the deploy set.

Two invariants tie the deploy to the jail. First, `deploy.sh` must stage the
full deploy set (the `DEPLOY_ASSETS` array): a file added to the site but left
out of that array never ships. Second, the jail only permits the one `rsync`
push it is written for, so any new remote SSH command the deploy learns to run
needs a matching allow-entry in the forced command
(`ops/rsync-jail-acurioustale.sh`, a reviewed copy of the server-authoritative
file — see [`ops/README.md`](ops/README.md)).

### Setting up the CI deploy key

The auto-deploy authenticates to the host with a dedicated SSH key, jailed
server-side so it can do nothing but push the site. Provisioning it — first
time, or on a key rotation — is a manual, admin-only procedure:

1. **Generate the key** (ed25519, no passphrase since CI can't type one):

   ```bash
   ssh-keygen -t ed25519 -C "github-actions-deploy@acurioustale.de" -f deploy_key -N ""
   ```

   This writes the private key `deploy_key` and the public key `deploy_key.pub`.

2. **Install the jail on the host.** Copy the reviewed forced command from
   `ops/` into the `web4186` account and make it executable:

   ```bash
   scp ops/rsync-jail-acurioustale.sh web4186@http2.core-networks.de:bin/
   ssh web4186@http2.core-networks.de 'chmod +x bin/rsync-jail-acurioustale.sh'
   ```

   The script permits only an `rsync` push into `html/acurioustale.de/` — no
   shell, no pull, no path traversal. `ops/rsync-jail-acurioustale.sh` is a
   reviewed copy; the file on the host is authoritative (see
   [`ops/README.md`](ops/README.md)).

3. **Pin the public key to that forced command.** Add one line to
   `~web4186/.ssh/authorized_keys`, wrapping the generated public key with the
   forced command and `restrict` (OpenSSH's umbrella flag that disables the pty,
   agent, port and X11 forwarding):

   ```text
   command="/home/www/web4186/bin/rsync-jail-acurioustale.sh",restrict <contents of deploy_key.pub>
   ```

   From here the key can only ever run the jail script, whatever CI asks of it —
   this is what makes the private key harmless if leaked. It is also the
   allow-list contract: if `deploy.sh` ever issues a remote SSH command beyond
   the current `rsync` push, the jail rejects it until a matching allow-entry is
   added to the forced command on the host **and** its reviewed copy in `ops/`.
   [`ops/README.md`](ops/README.md) records the exact line currently installed.

4. **Set the two repository secrets** (Settings → Secrets and variables →
   Actions), which [`deploy.yml`](.github/workflows/deploy.yml) reads:

   - **`DEPLOY_SSH_KEY`** — the **private** key: the full contents of
     `deploy_key`.
   - **`DEPLOY_KNOWN_HOSTS`** — the host's public key, so CI verifies the host
     instead of trusting it on first connect:

     ```bash
     ssh-keyscan http2.core-networks.de
     ```

5. **Clean up and verify.** Remove the local key material now that it lives in
   the secrets (`rm deploy_key deploy_key.pub`), then confirm the next push to
   `main` deploys — or trigger the workflow manually from the Actions tab.

### Security headers

`.htaccess` sets the production security headers the static files can't set
themselves: a `Content-Security-Policy`, `Strict-Transport-Security` (HSTS),
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`, the cross-origin isolation trio (`Cross-Origin-Opener-Policy`,
`Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy`), and it unsets the
`Server` banner. The CSP is
all-same-origin (`default-src 'none'`, `script-src`/`style-src`/`img-src 'self'`)
with the one inline script — the pre-paint theme guard — allowlisted by its
`sha256` hash. This header CSP is the production superset of the `<meta>` CSP in
`index.html`: it adds `frame-ancestors 'none'` and `upgrade-insecure-requests`,
which a meta tag can't express. The meta stays as the locally-testable baseline
(the python dev server doesn't apply `.htaccess`), and `tools/check-csp.mjs`
asserts the inline-script hash matches in both **and** that the two policies stay
consistent on every other directive (the header adds only `frame-ancestors` and
`upgrade-insecure-requests`) — so editing that script, or loosening a directive in
just one file, fails the build until both match. Verify the live headers after a deploy with
`curl -sI https://acurioustale.de/ | grep -i 'content-security\|x-frame'`.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md) — please disclose
privately rather than opening a public issue. The production response headers
and Content-Security-Policy themselves are described under
[Security headers](#security-headers) above.

## License

[MIT](LICENSE) © Markus Spitzner
