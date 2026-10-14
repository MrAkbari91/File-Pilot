# FilePilot implementation checklist

Source of requirements: [plan.md](plan.md). The repository initially contained only that specification.
No Git commands are run by the coding agent; repository operations belong to the user.

## Approach

Build a desktop application in small, verifiable layers: shared validated contracts, filesystem services,
persistent SQLite state, sandboxed Electron bridge, then a React interface. Use npm with exact versions
and a lockfile. Test dangerous operations only inside synthetic temporary folders.

## Milestones — initial working implementation

The checked items below identify implemented development-preview slices, not completion of every
advanced requirement in the master specification.

- [x] 1. Electron/React/TypeScript scaffold, secure IPC, design tokens, navigation, themes and settings.
- [x] 2. SQLite migration, native folder authorization, recursive cancellable scanner and real dashboard.
- [x] 3. Category/extension/year-month previews, skip/rename conflicts, approved verified no-overwrite moves.
- [x] 4. Exact/name/pixel/perceptual comparison, safe review, exact-group Trash with retained-copy checks.
- [x] 5. Paginated filtered search, indexed storage summaries, persistent history and verified undo.
- [x] 6. Deterministic assistant, manual/interval preview rules, edit/pause/resume/delete and schedule pause.
- [x] 7. Domain/filesystem/image/automation safety tests, Electron workflows and responsive theme checks.
- [x] 8. Packaging definitions, CI/tagged release workflows, version/artifact validation and documentation.

## Remaining work before the full specification is done

- [ ] Worker-based/batched large-index processing and performance benchmarks.
- [ ] Advanced organizer/category settings and additional conflict/date controls.
- [ ] Expanded image metadata, codec matrix, and scalable similarity indexing.
- [ ] Advanced search/history filters, CSV, retries, and metadata recovery UI.
- [ ] Watched-folder automation, richer conditions/actions, tested unattended execution.
- [ ] Expanded assistant grammar, localization readiness and complete accessibility audit.
- [ ] Native install/uninstall checks and successful CI/release runs on all target platforms.
- [ ] Final app icons, reviewed public distribution, optional signing/update integration.

Reasons, current behavior, and the next implementation step for each gap are recorded in
[docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Verification and limitations

## Current follow-up: release automation and direct folder selection

- [x] Implement main-push preview releases and matching stable version-tag releases (remote execution pending).
- [x] Configure Windows x64, macOS arm64/x64 and Linux x64 jobs, native packaged-runtime checks and complete-set checksum verification.
- [x] Choose folders directly in feature screens; prepare new indexes automatically and retain selection across restarts.
- [ ] Stream scan batches through a worker, staging SQLite writes and preserving cancelled snapshots.
- [ ] Extend timeline/conflict controls, history filtering/export, image metadata and similarity indexing.
- [x] Add folder/release regression tests and update owner-only Git commands without running Git.

### Follow-up verification — 2026-10-14

- Lint and strict typecheck passed; **55 tests across six suites passed**.
- **Two real Electron workflows passed**, including first selection from Organizer without visiting
  Dashboard, automatic indexing, files arriving after selection, cancel, persisted selection after
  restart, and an 800px folder-picker layout. The new screenshot was visually inspected.
- Release tests cover push-version uniqueness, retry stability, mismatched tags, seven required
  installers, four manifests, missing/empty/unexpected artifacts and checksum tampering. Mocked REST
  tests cover complete draft publication, failed uploads, draft recovery, wrong-source rejection,
  and no mutation of an existing published release. No release was actually published from tests.
- Production build and Windows NSIS packaging passed. The rebuilt packaged executable passed startup,
  SQLite indexing and native Sharp thumbnail checks with isolated synthetic files. The installer
  checksum was generated and validated.
- Workflow/composite-action YAML parsed successfully. GitHub action versions and runner architectures
  were checked against official sources. Linux prerequisites use Ubuntu 24.04's t64 package names.
- macOS/Linux runtime checks and actual GitHub publication are configured but **not yet executed**.
  Installer installation/uninstallation and OS trust prompts remain unverified. Windows builds are
  unsigned; macOS CI uses ad-hoc signing without notarization.
- Search/Storage reuse saved indexes; Organizer, Duplicates and rule previews refresh automatically.
  Dashboard Rescan remains for external changes in index-only views; there is no folder watcher yet.
- No Git command was executed; `plan.md` remains unchanged. Owner push instructions are in docs/RELEASE.md.

## Previous verified baseline (0.1.0)

Local environment: Windows x64, Node 24.15.0, npm 11.14.1, Electron 44.7.2.

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: **41 tests passed** across four suites. Includes real temporary junction exclusion,
  missing/changed sources, conflict protection, cancellation, verified undo, simulated EXDEV,
  exact/name duplicates, PNG/WebP pixels, PNG/JPEG/resizing candidates, corrupt formats, SQLite
  restart persistence, native-confirmation denial, retained-copy safety and scheduled preview pause.
- `npm run test:e2e`: **2 workflows passed**. Real Electron production renderer: native selection
  mocked to a synthetic folder, scanning, duplicate review, prevention of selecting every copy,
  preview, cancel/approve, moves, undo, dark theme, 800px layout, shortcuts, restart history.
  Vite development renderer: startup, secure bridge, and System theme changes.
- `npm run build`: passed. Main/preload and production renderer generated.
- `npm run package:dir`: passed for Windows x64.
- `npm audit --omit=dev`: **0 vulnerabilities**. Eight moderate findings remain in the builder's
  development-only dependency chain; see the limitations document.
- Screenshots from synthetic E2E fixtures were visually inspected in light, dark, and small-window
  layouts. Files are in ignored `.local/`.
- `npm run format:check`: passed.
- `npm run package`: passed; generated `release/FilePilot-0.1.0-win-x64.exe` (120,740,832 bytes).
- `node scripts/validate-release.mjs --artifacts`: passed; SHA-256 manifest generated.
- `node scripts/smoke-package.mjs release/win-unpacked/FilePilot.exe`: passed. Actual packaged
  runtime launched with an isolated temporary profile; SQLite scanning and Sharp thumbnail decoding
  succeeded. Bundled runtime reported Electron 44.7.2 / Node 24.21.0.

Installer SHA-256:
`c77b18327ab59e762b5f206beeba64d906b3bfb1e508fba5c9d809c8642c37a0`.

Tests do not touch personal documents. Real OS Trash and installer installation are not exercised by
the automated suite. macOS/Linux tests and GitHub workflows have not run on this Windows host.
No Git command was run. The owner's original `plan.md` is preserved.
