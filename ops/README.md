# ops/

Operational configuration that is **not** part of the deployed site and is
**not** run by CI or `deploy.sh`. Files here are reviewed reference copies of
things installed by hand on the web host, kept in version control so they can be
reviewed, diffed and restored. Shell scripts here are still linted, though:
`validate.sh` and CI discover every tracked `*.sh` (via `git ls-files`), so
shellcheck and shfmt catch a shell bug in the reviewed copy before it is
hand-copied to the host.

## `rsync-jail-acurioustale.sh`

The forced command that jails the CI deploy key on the host. It is pinned to
the deploy key in the `web4186` account's `~/.ssh/authorized_keys`, with
`restrict` (OpenSSH's umbrella flag disabling the pty, agent, port and X11
forwarding):

```text
command="/home/www/web4186/bin/rsync-jail-acurioustale.sh",restrict ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIplv+1s809gpA/xjDx9HFbu839B2OWFI6PFEhYJzR82 github-actions-deploy@acurioustale.de
```

The script permits only an `rsync` _push_ into `html/acurioustale.de/` - no
shell, no pull, no path traversal. It also allowlists the rsync options the
deploy actually sends (`--delete` and `--chmod=D755,F644`, plus the short-flag
bundle), refusing any other long option so a key holder can't smuggle a
dangerous receiver option (`--rsync-path`, `--files-from`, ...) past the mode
and destination checks. `--chmod` is pinned to the exact modes rather than any
value, so a smuggled `--chmod=D777,...` can't make the shared web root
world-writable. It also injects `--munge-links` so a symlink written into
the web root can't resolve outside the jail when Apache serves it. The
destination is pinned to that subdirectory rather than the account root because
the host account is shared with other sites' deploy keys, each confined to its
own jail script. This is what makes the `DEPLOY_SSH_KEY` secret harmless if
leaked (see the README "Deployment" section).

Because the server-side option bundle rsync generates varies by version, verify
a change to the option allowlist against the host before installing it: run one
real `./deploy.sh --dry-run` and confirm it is not rejected.

**Reviewed source, manually installed by an admin; the server file is
authoritative.** CI does not install this file. Changing the jail's behaviour
means editing the copy on the host _and_ updating this one to match; the two can
drift, and the host wins. If `deploy.sh` ever issues a new remote SSH command
(anything beyond the current `rsync` push), it needs a matching allow-entry
added here and on the host, or the forced command will reject it.
