#!/usr/bin/env bash
# Local pre-push checks, mirroring the CI "validate" job: vnu (HTML/CSS/SVG),
# xmllint (sitemap.xml well-formedness), Prettier formatting, ShellCheck + shfmt,
# actionlint, ESLint (JS + JSON) + stylelint (CSS) + markdownlint, the unit tests
# (node --test), the CSP, og-image and deploy-set guards, and svgo (SVG
# optimisation).
# Usage: ./validate.sh [--clean]
#   --clean   reinstall dependencies with `npm ci` first, matching CI's clean
#             install. Omit it to reuse the existing node_modules (faster); pass
#             it when package-lock.json changed or a dependency issue is suspected.
#
# Node + npm are required (the repo's own tooling, tests and guards run on them).
# The other CLIs are optional: each is skipped with a notice when absent so this
# stays runnable everywhere, while CI pins and always enforces them. Install them
# with: brew install shellcheck shfmt actionlint openjdk, plus `npm install`.
#
# Two pinning authorities, one rule: tools delivered by npm (Prettier, vnu, ESLint,
# stylelint, markdownlint, svgo) are pinned by package-lock.json and reached through
# node_modules, so `npm ci` alone makes CI and local identical. System tools that
# npm can't deliver (Node, ShellCheck, shfmt, actionlint) are pinned in
# .tool-versions and asserted below. Nothing is pinned in both places, so the two
# can't disagree.
set -euo pipefail

cd "$(dirname "$0")"

do_clean=0
case "${1:-}" in
"") ;;
--clean) do_clean=1 ;;
*)
	echo "usage: ./validate.sh [--clean]" >&2
	exit 2
	;;
esac

# Versions pinned in .tool-versions. Asserted here (only when the tool is
# present) so a drifted local tool is caught before it surfaces as a mystery
# failure in CI. .tool-versions is the single source of truth; read each pin
# through one helper (matching the whole tool name, so "node" can't match
# "nodejs") rather than repeating the awk per tool.
tool_version() { awk -v tool="$1" '$1 == tool {print $2}' .tool-versions; }
ci_node_version="$(tool_version nodejs)"
SHELLCHECK_VERSION="$(tool_version shellcheck)"
SHFMT_VERSION="$(tool_version shfmt)"
ACTIONLINT_VERSION="$(tool_version actionlint)"

have() { command -v "$1" >/dev/null 2>&1; }
skip() { echo "note: $1 not installed - skipping $2 (CI enforces it)." >&2; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# vnu ships as an npm devDependency (package `vnu-jar`), so package-lock.json
# pins the exact jar — no `brew install vnu` to drift and no rolling `latest`
# download in CI. It still needs a JVM, which npm can't provide: prefer one on
# PATH, else JAVA_HOME (Homebrew's openjdk is keg-only, so it usually isn't on
# PATH). The package's postinstall would fetch its own Temurin, but npm's
# allow-scripts gate denies it by default and the download sits outside the
# lockfile's integrity checks, so system Java stays the supported route.
#
# Probe each candidate by running it rather than trusting `command -v`: macOS
# ships a /usr/bin/java stub that is always on PATH and exits 1 with "Unable to
# locate a Java Runtime" when no JDK is installed, so a presence check would
# select it and fail the vnu step instead of falling through to JAVA_HOME.
VNU_JAR="node_modules/vnu-jar/build/dist/vnu.jar"
java_bin=""
for candidate in java "${JAVA_HOME:-}/bin/java"; do
	if "$candidate" -version >/dev/null 2>&1; then
		java_bin="$candidate"
		break
	fi
done

# Assert a tool reports the pinned version. Compare the pin against each
# whitespace-separated token of the --version output (with a leading "v"
# stripped) and require an EXACT match to one of them. Testing tokens for
# equality - rather than extracting the first dotted-number run - means a dotted
# token printed before the version (a build date like 2024.01.02, a toolchain
# version) can't be mistaken for it, while exact equality still rejects a
# superstring like shfmt 3.13.10 for a 3.13.1 pin.
require_version() {
	local name="$1" want="$2" got="$3" tok
	# Unquoted on purpose: split $got into tokens on whitespace.
	# shellcheck disable=SC2086
	for tok in $got; do
		[[ "${tok#v}" == "$want" ]] && return 0
	done
	echo "  $name version mismatch: want $want, got: $got" >&2
	echo "  install the pinned version (see .tool-versions) so local matches CI" >&2
	exit 1
}

# CI pins Node via .tool-versions. Warn (don't block) on a mismatch: a different
# engine can pass here yet behave differently in CI.
ci_node_major="${ci_node_version%%.*}"
local_node_major="$(node -v | sed 's/^v//; s/\..*//')"
if [[ "$local_node_major" != "$ci_node_major" ]]; then
	echo "warning: local Node is v$local_node_major, CI uses v$ci_node_major." >&2
fi

if [[ "$do_clean" -eq 1 ]]; then
	step "Install (npm ci)"
	npm ci
fi

if [[ -n "$java_bin" && -f "$VNU_JAR" ]]; then
	step "Validating HTML, CSS and SVG (vnu)"
	# Select files by extension, exactly like the CI job — prune .git and
	# node_modules, and never hand vnu the assets/ dir (it parses PNGs as text).
	files=()
	while IFS= read -r -d '' file; do
		files+=("$file")
	done < <(find . \( -path ./.git -o -path ./node_modules \) -prune -o \
		\( -name '*.html' -o -name '*.css' -o -name '*.svg' \) -print0)
	# On bash 3.2 (the macOS default) "${files[@]}" on an empty array trips
	# set -u, so guard the expansion and skip vnu when find matched nothing.
	# Filter benign infos. "Trailing slash on void elements": Prettier adds
	# `/>` as house style and vnu notes (info level) it's a no-op. "Content
	# Security Policy": vnu checks the page over file://, where script-src 'self'
	# resolves to a null origin and so appears to block the same-origin js/
	# modules; over https the policy allows them (verified in-browser). CSS
	# "field-sizing": vnu doesn't recognise this modern property yet; the
	# @supports guard in style.css already makes it safe to use.
	if [[ ${#files[@]} -eq 0 ]]; then
		echo "  no HTML/CSS/SVG files found to validate" >&2
	else
		"$java_bin" -jar "$VNU_JAR" \
			--filterpattern '.*(Trailing slash on void elements|Content Security Policy|field-sizing).*' \
			--also-check-css --also-check-svg "${files[@]}"
	fi
elif [[ ! -f "$VNU_JAR" ]]; then
	skip "vnu-jar (run npm install)" "HTML/CSS/SVG validation"
else
	skip "a Java runtime (brew install openjdk, or set JAVA_HOME)" "HTML/CSS/SVG validation"
fi

if have xmllint; then
	step "Checking XML well-formedness (xmllint)"
	# vnu only covers the SVG XML; sitemap.xml is otherwise unchecked. Plain
	# --noout (well-formedness, no network) keeps this gating; full schema
	# validation needs the sitemaps.org XSD and is left out like link checking.
	xmllint --noout sitemap.xml
else
	skip xmllint "sitemap XML check"
fi

if have shellcheck && have shfmt; then
	step "Shell scripts (shellcheck + shfmt)"
	# ShellCheck prints "version: 0.11.0" on its own line, so pass just that line
	# (require_version matches whole whitespace-separated tokens). Do not start
	# this comment with the tool's name — that spelling parses as a directive.
	require_version shellcheck "$SHELLCHECK_VERSION" "$(shellcheck --version | grep '^version:')"
	require_version shfmt "$SHFMT_VERSION" "$(shfmt --version)"
	# Discover every tracked shell script (git ls-files), not just the top-level
	# *.sh, so the ops/ rsync-jail script is linted too — a shell bug there is
	# worth catching in the reviewed copy before it is hand-copied to the host.
	sh_files=()
	while IFS= read -r file; do
		sh_files+=("$file")
	done < <(git ls-files '*.sh')
	shellcheck "${sh_files[@]}"
	shfmt -d "${sh_files[@]}"
else
	skip shellcheck/shfmt "shell checks"
fi

if have actionlint; then
	step "Linting workflows (actionlint)"
	require_version actionlint "$ACTIONLINT_VERSION" "$(actionlint --version | head -1)"
	actionlint
else
	skip actionlint "workflow lint"
fi

step "Format (Prettier)"
npm run --silent format:check

step "Linting JS, CSS and Markdown (eslint, stylelint, markdownlint-cli2)"
npm run --silent lint

step "Running unit tests + coverage thresholds (node --test)"
npm run --silent coverage

step "Checking the CSP covers the inline scripts"
npm run --silent check:csp

step "Checking the og-image dimensions"
npm run --silent check:og

step "Checking referenced local assets exist"
npm run --silent check:asset-refs

step "Checking DEPLOY_ASSETS covers the tracked deploy set"
npm run --silent check:deploy-assets

step "Checking SVG optimisation (svgo)"
# Run svgo into a temp file so a svgo crash (bad fetch, config error) is
# distinguished from a genuinely unoptimised SVG, instead of pipefail turning
# both into the same misleading "not optimised" message.
# Discover every tracked SVG (git ls-files), like the shell-script lint above,
# so a newly added SVG is optimisation-checked too instead of silently skipped.
svg_files=()
while IFS= read -r file; do
	svg_files+=("$file")
done < <(git ls-files '*.svg')
# Guard the array expansion: on bash 3.2 (macOS default) "${svg_files[@]}"
# trips set -u's unbound-variable check when the array is empty, so skip the
# whole check when no SVG is tracked, mirroring the vnu guard above.
if [[ ${#svg_files[@]} -eq 0 ]]; then
	echo "  no SVG files found to check" >&2
else
	svgo_out="$(mktemp)"
	trap 'rm -f "$svgo_out"' EXIT
	for f in "${svg_files[@]}"; do
		if ! npx svgo --config svgo.config.mjs -i "$f" -o "$svgo_out" >/dev/null; then
			echo "  svgo failed to process $f"
			exit 1
		fi
		if ! diff -q "$svgo_out" "$f" >/dev/null; then
			echo "  $f is not optimised; run: npx svgo --config svgo.config.mjs $f"
			exit 1
		fi
	done
fi

step "All checks passed"
