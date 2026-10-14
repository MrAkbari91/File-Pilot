# Architecture

The renderer contains presentation and interaction code. It has no Node.js integration. Electron uses
context isolation, a sandboxed CommonJS preload, blocked window creation/navigation, denied device
permissions, and a Content Security Policy. Development adds a local-only nonce for Vite's React
refresh scripts; production permits only same-origin scripts.

`shared/contracts.ts` defines the request allowlist, payload schemas, response types, and domain models.
The preload exposes only `request(method, payload)` and `onProgress(callback)`. Main verifies the
request's window, top-level frame, URL, and method, then validates its payload with Zod. No generic
filesystem or shell interface crosses this boundary. Request failures have an error code and message.

`Application` coordinates native folder/save/confirmation dialogs and services. Only user-selected
roots are scanned. Destination folders must be selected through the native picker or be the plan's
selected source root. Main owns generated plans in memory: Apply takes only an opaque plan ID and
asks for native confirmation. No renderer-supplied list of file operations is executed.

Feature screens share a native folder picker. `chooseRoots` validates the full selection before
registration, prepares new or reset indexes, and persists `selectedRootId` in application settings.
Known folders reuse their existing index. Organizer, duplicate comparisons, and manual/scheduled
rule previews refresh selected roots within the same cancellable job before processing. A cancelled
preparation never continues into a preview/comparison. Search and Storage still read saved metadata.

One background job runs at a time, with an AbortController and progress events. Filesystem traversal
and hashes use asynchronous I/O; Sharp decodes asynchronously through its native worker pool with
limited concurrency and pixel/cache limits. Synchronous SQLite work and some grouping still run in
main: scaling limits and next steps are documented in LIMITATIONS.md.

## Database schema, version 1

The database lives in Electron's OS-specific `userData` directory as `filepilot.sqlite`. SQLite WAL
and foreign keys are enabled. Migration 1 runs inside an immediate transaction. Newer schema versions
are rejected instead of downgraded. Preserve the database before investigating migration failures.

| Table                  | Purpose                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `schema_migrations`    | Applied schema version and timestamp                                                                      |
| `indexed_roots`        | Canonical selected folders and last successful scan                                                       |
| `files`                | UUID, root, canonical and comparison paths, name, category, extension, size, mtime, device/inode identity |
| `scan_jobs`            | Running, completed, failed, cancelled, or interrupted scans and summaries                                 |
| `duplicate_groups`     | Last completed comparison's JSON groups and members                                                       |
| `automation_rules`     | Validated JSON rule definitions                                                                           |
| `automation_runs`      | Preview/failure records and timestamps                                                                    |
| `operation_history`    | Move/undo/Trash journal, source/destination, status, error, content hash, reversal link                   |
| `application_settings` | Validated preferences, last scan, empty-folder lists                                                      |

Root, size, and category/extension indexes support queries. Search returns 100 results per page.
The first schema embeds duplicate members in JSON rather than a separate member table.

An index snapshot replaces the previous root contents only when traversal completes. Cancelled scans
preserve the old snapshot. Permission/individual-file failures are counted and reported. Successful
moves update files inside approved indexed destinations; moving outside those roots removes their
old index entries. A rescan reconciles all external changes and folder summaries.

Settings and history persist across restarts. Pending scan jobs and operations become interrupted on
startup. They are never blindly replayed. Schema rollback is transactional; automatic metadata backups
and a full recovery UI are still deferred.

## Implementation references

- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Vite configuration](https://vite.dev/config/)
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- [Sharp decoder limits](https://sharp.pixelplumbing.com/api-constructor/)

Node's bundled SQLite binding avoids a separate Electron ABI rebuild. Dependencies are pinned and
`package-lock.json` records the resolved tree. Electron and the development Node version must retain
support for `node:sqlite`.
