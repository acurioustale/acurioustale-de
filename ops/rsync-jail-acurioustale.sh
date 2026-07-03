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
case "$cmd" in *..*) reject 'path traversal rejected' ;; esac

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
# can't make the web root world-writable on the shared host. Short bundles can't
# express those options, so they pass; . and the destination carry no leading
# dash. set -f (above) makes splitting on whitespace safe.
# shellcheck disable=SC2086
set -- ${cmd#rsync --server }
for arg in "$@"; do
	case "$arg" in
	--delete | --chmod=D755,F644) : ;;
	--*) reject "option not allowed: $arg" ;;
	esac
done

# Neutralise symlinks: --munge-links prefixes any incoming symlink target so it
# can never resolve outside the jail (a no-op for the symlink-free deploy set).
# This closes the one escalation the checks above don't - a symlink written into
# the web root that Apache would otherwise follow out of the jail. rrsync injects
# the same option for its write-only mode.
# shellcheck disable=SC2086
exec rsync --server --munge-links ${cmd#rsync --server }
