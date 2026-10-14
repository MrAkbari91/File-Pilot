# FilePilot workspace instructions

## Owner's standing instruction

**Do not run any Git command.** The owner performs all Git operations. Provide commands as text
when needed. Do not initialize a repository, inspect status/diffs through Git, stage, commit, tag,
fetch, push, switch branches, or modify Git history. Only a new explicit owner instruction can
override this restriction.

## Project workflow

Read `plan.md` for the master specification and `IMPLEMENTATION.md` for actual completed work.
Keep `docs/LIMITATIONS.md` accurate; never claim the entire specification is implemented based on
the initial development preview.

- Use npm and exact dependency versions with the lockfile.
- Keep filesystem logic in Electron services and validated contracts in `shared/`.
- Keep Node integration off, context isolation on, sandboxing on, and IPC origin/payload checks intact.
- File changes require a preview and explicit approval. Never silently overwrite or permanently delete.
- Use synthetic temporary files for tests; do not scan or change real documents for testing.
- Run `npm run lint`, `npm run typecheck`, `npm test`, and relevant Electron tests after changes.
- Format source with `npm run format`; preserve the owner's `plan.md`.
- Update implementation status with verified results and remaining limitations.
- Build artifacts do not prove installation works on an untested OS.
