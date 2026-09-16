# Security Policy

This is the personal landing page served at <https://acurioustale.de> — a
single static page with no backend, no accounts and no data collection. The
attack surface is small, but good-faith reports are welcome.

## Supported versions

The site is continuously deployed from `main`; there are no tagged releases.
Only the **currently deployed `main`** — what is live at acurioustale.de — is
supported. Please report issues against the latest `main`.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue, so
the report isn't visible before a fix ships:

- Preferred: GitHub's [private vulnerability reporting][advisory]
- Email: <me@acurioustale.de>

The same contacts are published in machine-readable form at
<https://acurioustale.de/.well-known/security.txt> (RFC 9116).

Please include, where possible:

- a description of the issue and its impact,
- the affected URL, file or response header,
- steps to reproduce (a request or payload is ideal), and
- any proof-of-concept you have.

## Scope

In scope:

- The deployed site at acurioustale.de — its content, response headers and
  Content-Security-Policy
- Source in this repository, including the client-side `js/` modules where a
  crafted input causes a real security impact

Out of scope:

- The third-party host and its infrastructure
- Findings that require an already-compromised client or browser
- Self-XSS, or missing "best-practice" hardening with no demonstrated impact
  (handled best-effort)
- Social engineering and physical attacks

## What to expect

This is a single-maintainer personal project, so response is best-effort:

- I aim to acknowledge a report within a few days.
- I'll keep you updated on the assessment and any fix timeline.
- Fixes deploy from `main`; I'm happy to credit you once a fix is live, unless
  you prefer to stay anonymous.

There is no bug-bounty programme, but any good-faith report is appreciated.
Please avoid privacy violations and any disruption to the site while testing.

[advisory]: https://github.com/acurioustale/acurioustale-de/security/advisories/new
