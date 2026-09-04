# Security policy

## Supported versions

Until v1.0, only the latest published minor release receives security fixes.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository. If that feature is unavailable, contact the maintainer through the private address listed in the repository profile.

Include affected versions, reproduction steps, impact, and any suggested mitigation. You should receive an acknowledgment within five business days. Please allow time for a fix and coordinated disclosure.

## Security boundaries

VisualContract opens URLs in a browser process and should be run only against pages you are authorized to test. Configuration files and target pages are untrusted input. Never expose CI secrets to a pull request from an untrusted fork, and do not enable AI review for sensitive screenshots without approval.
