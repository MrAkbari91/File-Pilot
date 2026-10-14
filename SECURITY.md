# Security policy

FilePilot is an early development application. Report vulnerabilities privately through the hosting
repository's Security Advisories feature when enabled; do not include private filenames, paths,
credentials, or documents in a public issue. The repository owner should enable private reporting
before public distribution. No contact email is invented in this template.

Supported development version: 0.1.x. See docs/SAFETY.md for trust boundaries, race limitations,
metadata privacy, Trash semantics, and recovery behavior. Keep Node, Electron, Sharp, and their
dependency tree updated through reviewed changes and a full test run.

Dependencies are pinned in package.json and package-lock.json. Official GitHub Actions are pinned
to exact release versions, with contents-write permission limited to publication. Signing and
auto-update are not configured. The known builder-only npm advisory is tracked in LIMITATIONS.md.
