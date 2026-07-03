#!/bin/sh
# rsync-jail-acurioustale.sh - forced command jailing the CI deploy key.
#
# Reviewed source, manually installed by an admin; the SERVER FILE IS
# AUTHORITATIVE. This copy is kept in version control for review and recovery
# only - it is not installed or run by CI or deploy.sh (though shellcheck and
# shfmt do lint it, to catch a shell bug before it is hand-copied to the host).
# On the host it lives at /home/www/web4186/bin/rsync-jail-acurioustale.sh,
# pinned to the deploy key in that account's ~/.ssh/authorized_keys via
# command="/home/www/web4186/bin/rsync-jail-acurioustale.sh",restrict. Keep this
# copy in sync when the host file changes; the host wins. See ops/README.md.
#
# Before installing a change here, verify it still accepts the exact command the
# host's rsync issues for the deploy (the server-side option bundle varies by
# rsync version): run one real ./deploy.sh --dry-run against the host.
#
# Forced command: confine this SSH key to pushing the deploy set into one
# directory via rsync. Four gates - push-only, no traversal, destination inside
# the web root, and an option allowlist - plus --munge-links so a smuggled
# symlink can't escape the jail when the site is served.
set -f # no filename globbing (and so word-splitting $cmd below is safe)
ALLOWED='html/acurioustale.de/'
cmd=$SSH_ORIGINAL_COMMAND
reject() {
	printf 'rsync-jail: %s\n' "$1" >&2
	exit 1
}

# Only an rsync push (a receiver) may run: never --sender (a pull), never a shell.
case "$cmd" in
rsync\ --server\ --sender\ *) reject 'pull not allowed' ;;
rsync\ --server\ *) : ;;
*) reject 'only rsync push allowed' ;;
esac
# Reject `..` but only as a path component - bounded by `/` or an argument
# boundary - not as a bare substring. A substring test (`*..*`) also trips on a
# legitimate filename like `foo..bar.svg` and aborts the whole deploy. Splitting
# on whitespace first keeps the boundary logic to just `/` and the token ends;
# set -f (above) makes the unquoted split safe. Kept before the destination and
# option gates so the four gates read in the order the header lists them.
# shellcheck disable=SC2086
for arg in ${cmd#rsync --server }; do
	case "$arg" in
	.. | ../* | */.. | */../*) reject 'path traversal rejected' ;;
	esac
done

dest=${cmd##* }
case "$dest" in
"$ALLOWED"*) : ;;
*) reject "destination outside $ALLOWED" ;;
esac

# Allowlist the options rsync may pass. deploy.sh sends one short-flag bundle
# plus the long options --delete and --chmod=D755,F644; refuse any other long
# option (--rsync-path, --files-from, --remove-source-files, extra --delete-*
# modes, ...) so a key holder can't smuggle a dangerous receiver option past the
# checks above, the way the upstream rrsync jail does. --chmod is pinned to the
# exact modes deploy.sh sends rather than --chmod=* so a smuggled --chmod=D777,..
# can't make the web root world-writable on the shared host. . and the
# destination carry no leading dash. set -f (above) makes splitting on
# whitespace safe.
#
# A short-flag bundle (single dash) can express one dangerous receiver option
# the long-option allowlist above never sees: -s (--secluded-args, formerly
# --protect-args). With it, rsync sends the real file and destination paths over
# the protocol stream instead of on the command line, so the traversal and
# destination gates above would validate a benign decoy while the receiver acts
# on attacker-controlled paths. rrsync guards this by decoding short flags; do
# the same here. The legitimate deploy bundle is -vlogDtprze.iLsfxCIvu (with an
# n for --dry-run): the `s` for secluded-args sits in the pre-`.` cluster of
# real short flags, while the post-`.` modifier section (.iLsfxCIvu) legitimately
# carries an `s` — so inspect only the part before the first dot.
# shellcheck disable=SC2086
set -- ${cmd#rsync --server }
for arg in "$@"; do
	case "$arg" in
	--delete | --chmod=D755,F644) : ;;
	--*) reject "option not allowed: $arg" ;;
	-?*)
		case "${arg%%.*}" in
		*s*) reject "secluded-args (-s) not allowed: $arg" ;;
		esac
		;;
	esac
done

# Neutralise symlinks: --munge-links prefixes any incoming symlink target so it
# can never resolve outside the jail (a no-op for the symlink-free deploy set).
# This closes the one escalation the checks above don't - a symlink written into
# the web root that Apache would otherwise follow out of the jail. rrsync injects
# the same option for its write-only mode.
# shellcheck disable=SC2086
exec rsync --server --munge-links ${cmd#rsync --server }
