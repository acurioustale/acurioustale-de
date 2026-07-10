#!/usr/bin/env bash
# Deploy the static site to the web host via rsync.
# Usage: ./deploy.sh [--dry-run]
set -euo pipefail

cd "$(dirname "$0")"

stage="$(mktemp -d)"
# mktemp -d makes the staging dir 0700. To avoid making local temporary folders
# world-readable, we keep 0700 locally and let rsync explicitly set the remote
# web root permissions via --chmod=D755,F644.
trap 'rm -rf "$stage"' EXIT

REMOTE="web4186@http2.core-networks.de"
TARGET="html/acurioustale.de/"

# Stage exactly the deploy set, then mirror that directory. A flat file list
# with --delete only prunes inside the synced subdirectories (css/, js/,
# assets/), never the target root, so a file dropped from the set would linger
# on the host forever. Syncing a directory that holds only the deploy set lets
# --delete remove anything no longer shipped. TARGET is unchanged, so the
# server-side rsync jail still matches.
DEPLOY_ASSETS=(index.html .htaccess robots.txt sitemap.xml humans.txt manifest.webmanifest css js assets)
# Stage only TRACKED files. A plain `cp -R css js assets` copies whatever those
# directories currently hold, including untracked working-tree files (a scratch
# .css/.mjs, a local export), which `rsync --delete` would then mirror straight
# to the live web root on a hand-run deploy. Enumerating via `git ls-files`
# ships exactly what is committed; --error-unmatch keeps a typo'd or renamed
# entry a loud failure (as `cp -R` of a missing path was) rather than silently
# shipping nothing for it. --from0 pairs with the -z NUL delimiter.
git ls-files -z --error-unmatch -- "${DEPLOY_ASSETS[@]}" |
	rsync --from0 --files-from=- -a ./ "$stage"/

# Stamp the deploy time into the staged js/commands.js AND index.html from one
# instant, so the live site's `uptime` counts from this deploy and its "Last
# login" banner shows the same moment. Both would otherwise drift: `uptime` is
# re-stamped every deploy while a hardcoded banner is frozen at whatever was last
# committed. Stamping the staged copies leaves the git working directory untouched,
# avoiding dirty working trees or race conditions with local dev servers. The
# trailing `// <ISO>` comment is regenerated from the same instant so the
# human-readable form never drifts from the millisecond value. The regexes below
# and the markup/declarations they rewrite must agree; test/lastDeployStamp.test.js
# and test/lastLoginStamp.test.js bind them so a refactor that breaks a stamp fails
# the gate rather than aborting this deploy after merge.
echo "==> Updating deploy timestamp in staged js/commands.js and index.html"
node -e '
	const fs = require("fs");
	const file = process.argv[1];
	const htmlFile = process.argv[2];
	const before = fs.readFileSync(file, "utf8");
	const now = Date.now();
	const iso = new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
	const after = before.replace(/export\s+const\s+LAST_DEPLOY\s*=\s*\d+;(?:[ \t]*\/\/[^\n]*)?/, "export const LAST_DEPLOY = " + now + "; // " + iso);
	if (after === before) {
		console.error("deploy: could not find a LAST_DEPLOY assignment to stamp in " + file);
		process.exit(1);
	}
	fs.writeFileSync(file, after);

	// Stamp the index.html "Last login" banner from the SAME instant so it never
	// drifts from the uptime LAST_DEPLOY drives. Formatted like the macOS banner
	// and the terminal date command (Date-style, zero-padded), in UTC like iso.
	const d = new Date(now);
	const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
	const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
	const pad = (n) => String(n).padStart(2, "0");
	const login = day + " " + mon + " " + pad(d.getUTCDate()) + " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
	const beforeHtml = fs.readFileSync(htmlFile, "utf8");
	const afterHtml = beforeHtml.replace(/Last login: [^<]* on console/, "Last login: " + login + " on console");
	if (afterHtml === beforeHtml) {
		console.error("deploy: could not find a Last login banner to stamp in " + htmlFile);
		process.exit(1);
	}
	fs.writeFileSync(htmlFile, afterHtml);
' "$stage/js/commands.js" "$stage/index.html"

rsync_args=()
for arg in "$@"; do
	case "$arg" in
	--dry-run) rsync_args+=("--dry-run") ;;
	*)
		echo "Usage: ./deploy.sh [--dry-run]" >&2
		exit 1
		;;
	esac
done

# Local cruft that can ride along inside the copied css/js/assets directories
# but must never reach the web root: macOS metadata and AppleDouble forks
# (common on mounted volumes), plus editor backups and swapfiles. Kept in a
# named array so the exclude list stays readable next to the rsync call below.
rsync_excludes=(
	--exclude='.DS_Store'
	--exclude='._*'
	--exclude='*.bak'
	--exclude='*.swp'
	--exclude='*~'
)

# The staged tree is the whole source, so --delete mirrors it exactly and prunes
# everything else in the web root. That is what we want for anything the repo
# owns, but the host — not this repo — owns the web root's `.well-known/`
# directory: ACME (Let's Encrypt) challenge files and a hand-placed security.txt
# live there. Without a guard, the next deploy would delete them. A `protect`
# filter keeps --delete from pruning `.well-known/` while still leaving the rest
# of the root a faithful mirror. It is a delete-time filter only (the dir is not
# in the staged source, so nothing is sent), and like the excludes above it is a
# client-side rule that never reaches the server-side rsync command the deploy
# key's forced jail vets. Anchored with a leading slash to the transfer root, so
# only the web root's own `.well-known/` is protected, not a nested one.
rsync_protect=(--filter='protect /.well-known/')

# One invocation for both the dry-run and real deploys so their flags and
# endpoints can't drift. ${rsync_args[@]+"..."} expands to nothing when the
# array is empty, staying safe under `set -u` on bash 3.2 (macOS default).
rsync -avz --delete "${rsync_excludes[@]}" "${rsync_protect[@]}" --chmod=D755,F644 \
	${rsync_args[@]+"${rsync_args[@]}"} "$stage"/ "${REMOTE}:${TARGET}"
