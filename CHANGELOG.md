# Changelog

## Unreleased

- Fix Linux release setup by explicitly installing the pinned Electron binary before sandbox permissions.
- Explain the expected package version/tag when a mismatched release tag is pushed.

- Move traversal and scan-index publication into a worker with bounded file batches and SQLite staging.
- Preserve the last committed snapshot on cancellation, storage errors and worker failure; record interrupted scans.
- Add synthetic scan benchmarks and regression coverage for concurrent reads, rollback and worker recovery.

- Automatic preview releases on main pushes, with Windows x64, macOS arm64/x64 and Linux x64 assets.
- Native packaged-app smoke checks and complete installer/checksum validation before draft publication.
- Direct native folder picker on feature screens, automatic first indexing, and remembered selection.
- Automatic source refresh before organizer, duplicate comparison and manual automation previews.

## 0.1.0 — development preview

- Secure Electron application with React, TypeScript, SQLite, local themes and preferences.
- Explicit folder indexing, organizer previews, exclusive verified moves, journal and undo.
- Exact/name/pixel/perceptual duplicate comparison with conservative review and Trash handling.
- Search, indexed storage summaries, local assistant, preview-only automation.
- Unit/integration/Electron tests, packaging configuration, CI, tagged releases, and documentation.
- See IMPLEMENTATION.md for actual verification and docs/LIMITATIONS.md for unfinished requirements.
