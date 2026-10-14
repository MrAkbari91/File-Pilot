# MASTER PROJECT SPECIFICATION — FILEPILOT

## 1. Role and Mission

Act as a senior desktop application engineer, product designer, security engineer, QA engineer, and DevOps engineer.

Build a complete, production-oriented, cross-platform desktop application named **FilePilot**.

FilePilot is a free, local-first, AI-assisted file management application for Windows, macOS, and Linux.

The application must help users:
- Organize files and nested folders.
- Find files quickly.
- Detect exact duplicate files.
- Detect duplicate images even when filenames or image formats differ.
- Detect visually similar images.
- Analyze storage usage.
- Create file automation rules.
- Maintain operation history and undo supported operations.
- Use natural-language commands for searching and organizing files.

**All features must remain free. Do not implement paid plans, subscriptions, paywalls, artificial usage limits, or premium-only features.**

Budget: ₹0.
Development approach: AI-assisted coding.
Architecture: local-first, privacy-focused, offline-capable wherever practical.
Initial interface language: English.
Initial application name: FilePilot.

## 2. Mandatory Development Instructions

Before writing code:

1. Inspect the existing repository and its files.
2. Identify the existing framework, package manager, dependencies, and current implementation.
3. Preserve useful existing code and working features.
4. If the repository is empty, scaffold the project using the architecture below.
5. Create a clear implementation plan and a checklist of tasks.
6. Implement the application in logical stages, not as a single giant component.
7. Run available lint, type-check, test, and build commands after implementation.
8. Fix errors introduced by the implementation.
9. Never claim that a feature works unless it has been implemented and tested.
10. If a feature cannot be completed safely, document the limitation and implement the safest functional alternative.

Do not stop after generating a plan, mockup, or static dashboard. Build a working application.

Do not ask for confirmation on routine technical decisions. Use sensible defaults and continue.

Never overwrite unrelated user files, Git history, environment variables, or existing project configuration without inspecting the consequences.

## 3. Technology Stack

Use the following stack unless the existing repository has a compelling technical reason to retain a compatible alternative.

- Electron for desktop application packaging.
- React for the user interface.
- TypeScript with strict type checking.
- Vite for development and renderer bundling.
- Tailwind CSS for styling.
- A consistent accessible component system, using reusable components rather than duplicated UI.
- SQLite for persistent application data.
- A maintained SQLite driver compatible with the selected Electron and Node versions.
- Zod for validating IPC payloads, settings, automation rules, and AI-generated plans.
- Vitest for unit and integration tests.
- Playwright or an appropriate Electron-compatible E2E testing setup.
- electron-builder for cross-platform packaging.
- GitHub Actions for continuous integration and release automation.
- A maintained image-processing library such as Sharp for supported image decoding, metadata, resizing, and pixel-based comparisons.
- A maintained perceptual hashing implementation or a correctly tested implementation of pHash/dHash.
- A local file indexing engine using Node.js filesystem APIs.

Pin compatible dependency versions and commit the lockfile.

Use official documentation to resolve version-specific configuration. Do not blindly combine configuration from incompatible major versions.

## 4. Application Architecture

Separate the application into the following logical layers:

A. Renderer:
- React pages and components.
- Design system and themes.
- User interactions and forms.
- Dashboard, search, organization, duplicate management, automation, and history.

B. Electron main process:
- Filesystem access.
- File scanning and indexing.
- File movement, copying, renaming, and deletion.
- Background jobs and cancellation.
- SQLite access.
- Scheduling.
- Safe operation execution.

C. Preload:
- Expose a narrow, typed API using contextBridge.
- Do not expose unrestricted Node.js APIs.
- Validate requests and return structured results.

D. Shared domain layer:
- TypeScript types.
- Zod schemas.
- IPC contracts.
- File operation plans.
- Duplicate detection models.
- Automation rule definitions.

E. Services:
- FileScannerService.
- FileIndexService.
- FileOrganizerService.
- DuplicateDetectionService.
- ImageSimilarityService.
- StorageAnalyzerService.
- AutomationService.
- OperationHistoryService.
- UndoService.
- SearchService.
- AICommandService.
- SettingsService.
- UpdateService, only when update functionality is correctly configured.

Keep business logic out of React components.

Use typed result objects with clear error codes and human-readable messages.

## 5. UI/UX Requirements

Create a polished, premium-quality desktop interface.

The design should feel modern, calm, professional, fast, and trustworthy. Do not make it look like a generic admin dashboard.

### Theme system

Support both Light Mode and Dark Mode.

Provide:
- Light.
- Dark.
- System preference.

Requirements:
- Store the user's selected preference.
- Follow system theme when System is selected.
- Apply theme consistently to every screen, dialog, menu, tooltip, table, and modal.
- Avoid hard-coded colors inside individual components.
- Use centralized design tokens for colors, borders, surfaces, text, shadows, and focus states.
- Maintain accessible text contrast.
- Provide clear hover, focus, disabled, loading, error, success, and selected states.

### Visual design

Use:
- A collapsible left sidebar.
- A clean top navigation/header.
- A consistent spacing scale.
- Clear typography and information hierarchy.
- Restrained accent colors.
- Rounded cards and subtle borders.
- Helpful empty states.
- Skeleton loading states.
- Non-intrusive toast notifications.
- Confirmation dialogs for destructive operations.
- Tooltips for unfamiliar controls.
- Keyboard navigation and visible focus indicators.

Avoid:
- Excessive gradients.
- Excessive animations.
- Oversized dashboard cards.
- Tiny text.
- Horizontal overflow.
- Fake statistics.
- Decorative controls that do nothing.
- Buttons that merely look functional.

Animations must respect reduced-motion preferences where practical.

### Responsive behavior

Optimize for desktop window sizes, including smaller laptop screens.

The layout must adapt when the window is resized. Tables should remain usable, sidebars should collapse appropriately, and dialogs must not exceed the available window size.

### Main navigation

Create these sections:

1. Dashboard
2. Smart Organizer
3. Duplicate Center
4. Search
5. Storage Analyzer
6. Automation
7. History
8. Settings
9. About FilePilot

Add an AI Assistant entry point that is accessible from the main application.

## 6. Dashboard

Create a useful dashboard showing real data from the local index.

Include:
- Indexed folders.
- Files indexed.
- Total indexed file size.
- Duplicate groups detected.
- Potential duplicate storage, clearly marked as an estimate where appropriate.
- Recent operations.
- Recent scan status.
- Automation jobs and their status.
- Quick actions.

Add actions:
- Scan a folder.
- Organize files.
- Find duplicates.
- Search files.
- Analyze storage.
- Create an automation rule.

Never show hard-coded statistics as if they were real user data.

Include helpful empty states before the user scans any folders.

## 7. File Indexing and Folder Management

Implement folder selection using native desktop dialogs.

Support:
- Selecting one or more root folders.
- Recursive subfolder scanning.
- Including or excluding subfolders.
- Excluding configured paths.
- Excluding symbolic links by default.
- Handling inaccessible directories.
- Handling permission errors.
- Handling broken links.
- Handling files disappearing during scans.
- Handling Unicode and long filenames supported by the operating system.
- Scan progress and cancellation.
- Rescanning changed folders.
- Configurable indexing depth where practical.

Do not follow symbolic links by default because they may lead outside the selected folder or create traversal loops.

Never scan the entire filesystem automatically.

The user must explicitly select the folders that FilePilot is allowed to index.

Store the canonical path and a normalized comparison path separately where needed. Do not assume path comparisons are identical across Windows, macOS, and Linux.

Handle case sensitivity and Unicode normalization according to the target filesystem.

## 8. Smart Organizer

Implement three primary sorting strategies.

### Strategy A: By Category

Examples:
- Images
- Documents
- Videos
- Audio
- Archives
- Code
- Spreadsheets
- Presentations
- Executables
- Other

Make categories configurable.

### Strategy B: By Extension

Examples:
- Images/png
- Images/jpg
- Documents/pdf
- Documents/docx
- Archives/zip

Do not create unsafe paths from arbitrary extension strings.

Handle files with no extension and dotfiles correctly.

### Strategy C: By Timeline

Allow organization by:
- Year.
- Year/month.
- File modification date.

Use a clearly labelled date source. Do not represent modification time as the original creation date.

### Organization settings

Include:
- Group extensions inside categories.
- Include subfolders.
- Exclude specified folders.
- Remove empty folders after moving, disabled by default.
- Dry run / preview only, enabled by default.
- Conflict handling.
- Destination folder selection.
- File count and total size summary.
- Start, cancel, and completion states.

### Preview

Before execution, display:
- Original source path.
- Proposed destination path.
- File name.
- File size.
- Operation type.
- Any naming conflict.
- Any skipped or unsupported operation.

Never move files merely because a user selected a sorting strategy.

Require explicit approval before applying a generated plan.

### Conflict handling

Support:
- Skip.
- Rename with a unique suffix.
- Compare before replacing.

Never overwrite an existing file by default.

Before moving a file, revalidate that the source still exists and that the destination is safe.

Use same-volume atomic rename when supported. For cross-volume moves, use a verified copy-then-remove process, and remove the source only after successful verification.

## 9. Duplicate Center

Implement three primary comparison modes.

### Mode A: Exact Content

Detect byte-identical files regardless of filename or directory.

Use:
- File size as an initial filter.
- SHA-256 hashing for candidate files of equal size.
- Streaming reads rather than loading entire files into memory.
- Cancellation and progress reporting.

Do not treat equal file sizes as proof of duplication.

Handle hash failures, locked files, permissions, and files changing during a scan.

### Mode B: Same Filename

Detect files with matching normalized filenames across selected folders.

Support configurable comparison rules:
- Case-sensitive or case-insensitive comparison where appropriate.
- Same filename with different extensions.
- Optional grouping by extension.
- Optional subfolder scanning.

This mode identifies name matches, not guaranteed duplicate content.

Clearly distinguish name matches from verified exact duplicates.

### Mode C: Similar Images

Detect duplicate images even if:
- Their filenames differ.
- Their extensions differ.
- They were converted between supported formats.
- They were resized.
- They were recompressed.
- They have small visual changes.

Implement multiple levels of comparison.

Level 1: Exact binary duplicate.
- Use SHA-256.

Level 2: Decoded pixel comparison.
- Decode supported formats into a consistent pixel representation.
- Normalize orientation using image metadata.
- Compare dimensions and pixel data.
- Support comparison of visually identical decoded images across formats.

Level 3: Perceptual similarity.
- Calculate pHash or dHash.
- Compare hashes using Hamming distance.
- Provide a configurable similarity threshold.
- Group candidates by similarity.
- Allow the user to inspect images side by side.

For perceptual comparisons, distinguish exact duplicates from near-duplicates.

Use safe image decoding limits and handle corrupt, unsupported, unusually large, or potentially malicious image files.

Never assume that matching perceptual hashes prove that two images are identical.

### Supported formats

Support common formats where the chosen image library allows it, including:
- JPEG/JPG
- PNG
- WebP
- BMP
- TIFF where supported
- GIF, with clearly defined first-frame behavior
- AVIF and HEIC only when the selected library and build environment actually support them.

Detect format from file content where practical rather than trusting the extension alone.

### Duplicate results UI

Display:
- Group ID.
- File preview or thumbnail.
- Full path.
- Filename.
- Format.
- Dimensions for images.
- File size.
- Match type.
- Similarity score where relevant.
- Recommended action.
- Estimated reclaimable space.

Allow:
- Opening the containing folder.
- Opening the file.
- Selecting individual files.
- Selecting all but one file in a group.
- Choosing which copy to keep.
- Exporting scan results.

Do not automatically delete duplicate files.

### Duplicate safety

Never select the only copy for deletion.

Never assume that the oldest, newest, or shortest-path file is always the correct file to retain.

Provide clear warnings for files in application folders, system directories, synchronized folders, or paths that may be in active use.

Require explicit confirmation before deletion.

Support moving selected files to the operating system's recycle bin/trash when reliably available. If the operation falls back to permanent deletion, disclose that clearly and request additional confirmation.

## 10. Storage Analyzer

Implement:
- Folder-size summaries.
- Largest files.
- Largest folders within indexed roots.
- File-type distribution.
- Recently modified files.
- Empty folder detection.
- Duplicate storage estimates.
- Excluded paths.

Use incremental scanning where practical.

Clearly distinguish indexed data from complete disk usage. Do not claim to know total filesystem usage if only selected folders have been scanned.

Do not automatically delete files from the Storage Analyzer.

## 11. Unified Search

Create a fast, filterable file search interface.

Support:
- Filename.
- Extension.
- File category.
- Minimum and maximum size.
- Modified date range.
- Root folder.
- Subfolder path.
- File type.
- Duplicate status.
- Recently accessed or operated-on items when tracked by FilePilot.

Provide:
- Search-as-you-type with debouncing.
- Keyboard shortcuts.
- Sorting.
- Pagination or virtualized lists for large result sets.
- Open file.
- Open containing folder.
- Copy path.
- Preview supported file types.

Add natural-language search, for example:
- "Find large videos."
- "Show PDFs modified last month."
- "Find images with the same content."
- "Find files with invoice in their name."

Start with a deterministic local query parser for supported commands.

Never pretend to understand a query that the parser cannot interpret. Explain unsupported commands and offer a simple search alternative.

## 12. AI Assistant

Build an AI-first assistant without requiring a paid API.

The initial assistant must work locally using:
- Natural-language patterns.
- Synonyms.
- Deterministic intent classification.
- Metadata filters.
- Rule generation.
- Structured action plans.

Examples:
- "Organize my Downloads folder by file type."
- "Find duplicate images."
- "Show files larger than 500 MB."
- "Create a rule for new PDF files."
- "Find screenshots from last month."

The assistant should:
1. Interpret the request.
2. Identify the relevant folder and filters.
3. Generate a structured plan.
4. Explain the plan in plain language.
5. Display the expected changes.
6. Ask for approval when operations modify files.
7. Execute only validated and approved actions.
8. Report completed, skipped, and failed operations.

AI output must never directly execute shell commands or arbitrary filesystem paths.

Validate every proposed operation against strict schemas and permissions.

Add an optional local model integration only if it can be implemented without mandatory paid services and without compromising stability.

Do not download large models automatically.

Do not upload filenames, file contents, paths, or user data to external services without explicit informed consent.

## 13. Automation Engine

Implement a local automation engine.

Users should be able to create, edit, pause, resume, and delete rules.

### Rule conditions

Support:
- File extension.
- File category.
- Filename patterns.
- File size.
- Modified date.
- Source folder.
- Optional exclusion patterns.

### Rule actions

Support:
- Move to a selected folder.
- Rename according to a safe pattern.
- Organize by category.
- Organize by extension.
- Organize by year/month.
- Notify the user.
- Run duplicate checks.

### Triggers

Support:
- Manual execution.
- Scheduled execution.
- Watched folder events where supported.
- Optional execution at application startup.

Scheduled and watched-folder jobs must remain local.

If FilePilot is closed, scheduled tasks must not falsely appear to have run. Document whether a rule requires the application to be running.

Use filesystem watchers only as hints. Revalidate files before acting because watcher events may be duplicated, delayed, or lost.

### Automation safety

- Preview new rules before activation.
- Dry run enabled by default for new rules.
- Do not delete files automatically.
- Do not overwrite files silently.
- Prevent recursive loops where destination folders are also watched.
- Prevent repeated moves of the same file.
- Include a kill switch to pause all automations.
- Log every operation and failure.
- Support cancellation.

## 14. History and Undo

Maintain a persistent operation history.

Record:
- Operation ID.
- Timestamp.
- Operation type.
- Original path.
- Destination path.
- Status.
- Error message when applicable.
- Related automation rule ID.
- Reversal status.
- File metadata needed for recovery.

Support:
- Filtering by operation type, date, and status.
- Searching history.
- Viewing operation details.
- Retrying eligible failed operations.
- Undoing supported operations.
- Clearing history with confirmation.
- Exporting history to CSV or JSON.

Do not log file contents or unnecessary sensitive information.

Undo must be based on verified operation records, not guesswork.

Before reversing a move or rename, check whether the original path can be restored without overwriting an existing file.

If a file has changed or its original location is occupied, stop and explain the conflict.

For copy, delete, and complex multi-step operations, clearly label whether undo is fully supported, partially supported, or unavailable.

Use operation IDs and transaction-like state tracking so interrupted jobs can be reconciled after an application restart.

## 15. SQLite Database

Use migrations and a versioned database schema.

Suggested tables:
- indexed_roots
- files
- scan_jobs
- duplicate_groups
- duplicate_members
- automation_rules
- automation_runs
- operation_history
- application_settings
- schema_migrations

Add appropriate indexes.

Store paths, hashes, file sizes, timestamps, MIME/category information, and scan state.

Do not store file contents in SQLite.

Use database transactions for related writes.

Handle database migration failures and backup/recovery of application metadata.

Store the database in the operating system's application-data directory, not inside the scanned folders.

Provide a safe way to reset the local index without deleting the user's actual files.

## 16. Performance Requirements

The application should remain responsive when processing large directories.

Implement:
- Background workers or appropriate asynchronous processing.
- Bounded concurrency.
- Streaming hashes.
- Cancellation tokens.
- Progress reporting.
- Thumbnail caching.
- Incremental database updates.
- Virtualized lists for large result sets.
- Graceful handling of low memory.
- Retry or skip behavior for inaccessible files.

Avoid blocking the Electron main process with CPU-heavy image processing.

Use a worker thread or separate worker process where appropriate.

Avoid reading entire large files into memory just to calculate hashes.

Do not promise fixed performance numbers before benchmarking.

## 17. Security and Privacy

This is a local-first application.

Mandatory:
- contextIsolation enabled.
- Node integration disabled in the renderer.
- Sandbox enabled where compatible.
- Narrow preload APIs.
- Strict IPC input validation.
- No arbitrary shell execution from AI commands.
- No unrestricted filesystem API exposed to React.
- Safe path resolution.
- No path traversal.
- No silent deletion.
- No silent overwrite.
- No automatic scanning of the whole disk.
- No automatic cloud upload.
- No collection of unnecessary telemetry.

Use an allowlist of permitted filesystem operations.

Validate destination paths and prevent unintended writes outside the selected destination.

Respect operating-system permissions.

Protect against symlink traversal, time-of-check/time-of-use problems, and file replacement between scanning and execution.

Do not promise that every filesystem operation can be perfectly reversed.

Document known limitations and privacy behavior.

## 18. Settings

Implement settings for:
- Theme: Light / Dark / System.
- Language-ready UI structure.
- Default scan exclusions.
- Default organization strategy.
- Default duplicate comparison mode.
- Similarity threshold.
- Thumbnail behavior.
- Automation settings.
- Notifications.
- Database/index reset.
- History management.
- Application version.
- Privacy information.
- Export/import settings where safe.

Persist settings across restarts.

Validate imported settings and never execute imported rules without user approval.

## 19. Keyboard Shortcuts and Accessibility

Provide shortcuts where appropriate:
- Ctrl/Cmd + K: quick search.
- Ctrl/Cmd + F: search within the current view.
- Ctrl/Cmd + Z: undo the most recent eligible operation.
- Ctrl/Cmd + ,: settings.
- Escape: close dialogs or cancel selection.
- F5: rescan or refresh where appropriate.

Use platform-appropriate modifiers and avoid shortcut conflicts.

Provide accessible labels, keyboard navigation, and understandable error messages.

## 20. Cross-Platform Support

The application must target:

### Windows
- x64.
- ARM64 if supported by the dependency stack.
- Installer format such as NSIS.
- Optional portable build if reliable.

### macOS
- Apple Silicon arm64.
- Intel x64 where supported by the build environment.
- DMG and ZIP artifacts.

### Linux
- x64.
- ARM64 where supported.
- AppImage and DEB artifacts as initial distribution targets.
- Additional formats only if they can be built and tested reliably.

Use platform-aware paths and permissions.

Avoid hard-coded Windows separators.

Use the correct user-data, cache, and application-data locations.

Do not assume filesystem case sensitivity is identical across operating systems.

Test application startup, folder selection, scanning, and packaging on all target platforms.

Do not claim native support for a platform/architecture unless a corresponding artifact has been successfully built and tested.

## 21. GitHub Repository and Release Automation

Set up a clean GitHub repository with:
- README.md.
- LICENSE.
- CONTRIBUTING.md.
- SECURITY.md.
- CHANGELOG.md.
- .gitignore.
- .editorconfig.
- .github/workflows/ci.yml.
- .github/workflows/release.yml.
- Issue templates where useful.

Add scripts for:
- Development.
- Linting.
- Type checking.
- Unit tests.
- Integration tests.
- E2E tests.
- Production build.
- Local packaging.
- Release validation.

### Continuous Integration

On pull requests and pushes to the main branch:
- Install the correct Node.js version.
- Install dependencies using the lockfile.
- Run linting.
- Run type checking.
- Run unit tests.
- Run applicable integration tests.
- Build the application.
- Report failures clearly.

### Automated releases

Use GitHub Actions with an operating-system matrix:
- windows-latest.
- macos-latest.
- ubuntu-latest.

When a valid version tag such as v1.0.0 is pushed:
1. Validate the tag and package version.
2. Run release checks.
3. Build the appropriate artifacts on each operating system.
4. Upload artifacts.
5. Create or publish a GitHub Release.
6. Attach the correct installers and packages.
7. Generate release notes.
8. Include checksums where practical.
9. Report missing artifacts or failed jobs clearly.

Use minimal GitHub Actions permissions. Grant contents: write only to the release-publishing job that needs it.

Use GitHub's provided token where possible.

Pin third-party GitHub Actions to reviewed versions or commit SHAs according to project security policy.

Never commit secrets, signing certificates, passwords, or personal access tokens.

### Release naming

Use descriptive artifact names, for example:
- FilePilot-Setup-x64.exe
- FilePilot-Portable-x64.exe, only if supported.
- FilePilot-arm64.dmg
- FilePilot-x64.dmg
- FilePilot-x86_64.AppImage
- FilePilot-amd64.deb

Use actual platform, architecture, and version values in final artifact names.

Do not publish an artifact under an architecture label unless it was built for that architecture.

### Versioning

Use semantic versioning:
- 0.1.0 for initial development release.
- 0.2.0 for a backward-compatible feature release.
- 1.0.0 for the first stable release.

Document the release process:
1. Update version and changelog.
2. Run tests.
3. Commit and push.
4. Create and push a version tag.
5. Verify the GitHub Actions workflow.
6. Confirm all intended artifacts appear on the release page.

The release workflow must not run destructive Git commands or automatically rewrite repository history.

### Signing and distribution

Support unsigned builds for initial free distribution.

Document that unsigned macOS applications may trigger security warnings and that reliable macOS auto-updates require appropriate signing.

Document Windows code-signing limitations and Linux distribution differences.

Do not require paid signing certificates to build the initial application.

Do not claim that every installer will be free of operating-system warnings.

## 22. Automatic Updates

Treat automatic application updates as optional until release publishing is stable.

If implemented:
- Use a maintained updater compatible with the chosen packaging configuration.
- Configure the official GitHub release feed correctly.
- Check for updates only from the configured trusted release source.
- Show release version and download progress.
- Allow users to defer updates.
- Verify the update mechanism on each platform.
- Document signing requirements.

Do not enable a broken updater merely to show an Update button.

## 23. Testing Requirements

Create tests for:

### File operations
- Move success and failure.
- Rename conflicts.
- Cross-volume move behavior.
- Cancellation.
- Missing files.
- Inaccessible directories.
- Path traversal prevention.
- Symbolic link handling.
- Undo conflicts.
- Interrupted operations.

### Duplicate detection
- Same file, different names.
- Same content in different directories.
- Different content with equal sizes.
- Same image converted from PNG to JPEG.
- Same image with different resolutions.
- Similar but non-identical images.
- Corrupt images.
- Unsupported image formats.
- Hashing cancellation.

### Organization
- Category sorting.
- Extension sorting.
- Timeline sorting.
- Nested folders.
- Empty folders.
- Filename collisions.
- Dry-run mode.
- Excluded paths.

### Automation
- Rule validation.
- Watched-folder events.
- Repeated event handling.
- Scheduler behavior.
- Pause/resume.
- Preventing recursive moves.
- Failure logging.

### UI
- Light theme.
- Dark theme.
- System theme.
- Small-window layout.
- Loading states.
- Empty states.
- Dialog behavior.
- Keyboard accessibility.

### Releases
- Production build on all supported operating systems.
- Correct artifact names.
- Correct version numbers.
- Successful release upload.
- Missing-artifact detection.

Use temporary test directories and synthetic test files. Never run destructive tests against a user's real documents.

## 24. Documentation

Create:
- README with features, screenshots placeholders, installation, and usage.
- Developer setup instructions.
- Architecture documentation.
- Database schema documentation.
- AI assistant limitations.
- Duplicate detection explanation.
- Automation rule guide.
- Privacy and security documentation.
- Build and packaging instructions.
- GitHub Actions release instructions.
- Troubleshooting guide.
- Known limitations.
- Testing instructions.
- Roadmap.

Clearly explain how to run the application locally and how to produce installers.

## 25. Definition of Done

The project is not complete until:

1. The app starts successfully in development mode.
2. The dashboard displays real local data.
3. Users can select and scan folders.
4. Nested folder handling works.
5. Organization strategies generate correct previews.
6. Dry-run mode never modifies files.
7. Approved file operations work and are logged.
8. Exact duplicates can be identified.
9. Supported cross-format duplicate images can be detected.
10. Similar image candidates can be reviewed safely.
11. History persists after restart.
12. Supported undo operations work.
13. Automation rules can be created and managed.
14. Search returns correct results.
15. Light, Dark, and System themes work.
16. Errors are handled without crashing the entire application.
17. Tests, linting, and type checks pass.
18. Cross-platform CI is configured.
19. Version-tagged GitHub releases are configured.
20. Documentation explains installation, limitations, and release steps.
21. No paid API, subscription, or cloud account is required for core functionality.
22. No important UI control is a non-functional placeholder.

If a requirement cannot be completed, list it explicitly with the reason, current status, and next implementation step.

## 26. Final Execution Instructions

Start by inspecting the repository.

Then implement the project in these milestones:

Milestone 1: Project scaffold, secure Electron architecture, design system, theme switching, navigation, and settings.

Milestone 2: SQLite schema, folder selection, file scanner, indexing, and dashboard.

Milestone 3: Smart Organizer, strategies, nested-folder controls, dry-run preview, and safe execution.

Milestone 4: Duplicate Center with exact-content, filename, pixel-based, and perceptual image comparisons.

Milestone 5: Unified search, storage analyzer, history, and supported undo.

Milestone 6: Automation engine and local natural-language assistant.

Milestone 7: Security hardening, tests, performance improvements, and accessibility.

Milestone 8: Windows, macOS, and Linux packaging, GitHub Actions, tagged releases, and documentation.

After each milestone:
- Run relevant tests.
- Fix errors.
- Update the task checklist.
- Summarize implemented functionality.
- Identify remaining limitations.

At the end, provide:
- The final folder structure.
- Implemented features.
- Commands to install dependencies and run locally.
- Commands to test and build.
- Instructions for creating a GitHub release tag.
- Supported platforms and artifact formats.
- Any required GitHub repository settings.
- Any features not yet fully implemented.

Prioritize correctness, safety, maintainability, and excellent UI/UX over unnecessary complexity.

Begin implementation now.