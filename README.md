# FilePilot

A free, private desktop workspace for organizing and finding local files. Built with Electron,
React, TypeScript, Vite, Tailwind, SQLite, Zod, and Sharp. No account, cloud service, paid API,
subscription, or telemetry is required.

**Status: 0.1.0 development preview.** This is a working initial implementation of the master
specification, not a declaration that every requirement in `plan.md` is complete. See
[implementation status](IMPLEMENTATION.md) and [known limitations](docs/LIMITATIONS.md).

## Run locally

Install Node.js **24.15 or newer within Node 24** and npm. From this directory:

```powershell
npm ci
npm run dev
```

`npm run dev` builds the main/preload bundles, starts Vite on `127.0.0.1:5173`, and opens Electron.
React changes reload automatically. Restart the command after editing Electron or shared contracts.
Opening the Vite URL in a regular browser does not grant filesystem access.

## What works

- Explicit native folder selection; recursive scans, exclusions, depth limits, progress, cancellation,
  error reporting, and SQLite persistence. Junctions and symbolic links are excluded.
- Dashboard showing real indexed file counts, sizes, selected roots, scan details, and recent changes.
- Category, category/extension, and modification year/month organization. Previews include destinations,
  skipped conflicts, and byte totals. Apply requires a separate native confirmation.
- No-overwrite moves with streaming SHA-256 verification, a durable operation journal, and verified undo.
- Exact-content duplicates, filename match groups, decoded-pixel image matches, and perceptual candidates.
  Only exact-content groups offer Trash; at least one reverified copy is retained.
- Debounced, paginated filename/path search with category, root, extension, size, date, and sorting filters.
- Indexed storage breakdowns, large files, direct folder sizes, and empty-folder detection.
- Local assistant with explicit supported patterns and clear rejection of unsupported commands.
- Editable manual/scheduled **preview-only** rules with pause/resume and a global schedule pause.
- Light/dark/system themes, keyboard shortcuts, JSON exports, settings import, and metadata reset.

## First session

1. Use **Choose folder** on Dashboard, Smart Organizer, Duplicate Center, Search, Automation, or
   Storage Analyzer. New folders are indexed automatically; there is no separate scan prerequisite.
2. Review **Search**, **Storage Analyzer**, or **Duplicate Center**.
3. In **Smart Organizer**, choose a folder and strategy, then **Generate preview**.
4. Review source and destination paths. **Apply moves** asks for confirmation again.
5. Use **History** to inspect results or undo unchanged moves into an available original path.

Saved folders remain available after restart. Organizer restores the last chosen folder; generating
a preview or finding duplicates refreshes its files automatically. Search and Storage use the saved
index; Dashboard's **Rescan** can refresh external changes for those views. No filesystem watcher is
running. Overlapping parent/child roots must be resolved in Settings before adding a new root.

Keep your own backups. Interrupted filesystem operations can require manual recovery. Trash restoration
is handled by your operating system. There is no permanent-delete fallback.

## Commands

| Command                    | Purpose                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `npm run dev`              | Desktop app with live renderer updates                      |
| `npm run lint`             | TypeScript linting                                          |
| `npm run typecheck`        | Strict type checking                                        |
| `npm test`                 | Unit and filesystem/image integration tests                 |
| `npm run test:unit`        | Domain/parser/hash tests                                    |
| `npm run test:integration` | Temporary-filesystem tests                                  |
| `npm run test:e2e`         | Build and test real Electron production/development windows |
| `npm run check`            | Lint, types, tests, production build                        |
| `npm run build`            | Renderer and Electron bundles                               |
| `npm run package:dir`      | Unpacked application for the current platform               |
| `npm run package`          | Unsigned installers for the current platform                |
| `npm run release:validate` | Validate version/tag consistency                            |

Integration tests use temporary synthetic files. Windows junction tests need permission to create
junctions; Linux GUI tests need a display (`xvfb-run --auto-servernum npm run test:e2e`).

## Project structure

```text
electron/
  main.ts                  Secure window, IPC origin checks, lifecycle
  preload.ts               Narrow typed request/progress bridge
  services/
    application.ts         Native dialogs, app service orchestration, automation
    database.ts            SQLite migration and queries
    scanner.ts             Recursive cancellable indexing
    organizer.ts           Plans, exclusive moves, verified undo
    duplicates.ts          Exact, filename, pixel and dHash comparisons
    hash.ts                Streaming hashes and identity checks
    paths.ts               Canonical paths, containment, symlink checks
    assistant.ts           Deterministic local intent parser
shared/contracts.ts        Types and Zod schemas
src/
  components/ui.tsx        Reusable accessible UI components
  pages/                   Feature screens
  App.tsx                  Desktop shell, navigation, shortcuts
  context.tsx              State, progress, notifications, theme preference
  styles.css               Centralized light/dark design tokens and layout
scripts/                   Development, bundling, release validation
tests/                     Unit, integration, and Electron workflow tests
.github/workflows/         Cross-platform checks, push previews and tagged stable releases
docs/                      Architecture, privacy, usage, limitations, release steps
```

## Screenshots

The Electron workflow test produces light, dark, and small-window screenshots in `.local/`.
They are generated from temporary synthetic fixtures and excluded from source control. Add reviewed,
sanitized release screenshots here before public distribution.

## Distribution and Git

Every push to **main** triggers a downloadable preview release after all checks pass: Windows NSIS
x64, macOS DMG/ZIP for both Apple Silicon and Intel, and Linux AppImage/DEB x64. Matching version tags
publish stable releases. A configuration is not proof of platform support. Check
[verification status](IMPLEMENTATION.md) before distributing an artifact.

All Git commands remain under the project owner's control. The coding agent has not run Git.
Copyable initial repository and release-tag commands are in [RELEASE.md](docs/RELEASE.md).

## More information

- [Architecture and database](docs/ARCHITECTURE.md)
- [Privacy, operations, and duplicate safety](docs/SAFETY.md)
- [Automation and assistant guide](docs/AUTOMATION.md)
- [Limitations and roadmap](docs/LIMITATIONS.md)
- [Build/release process](docs/RELEASE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

MIT licensed. All functionality remains free.
