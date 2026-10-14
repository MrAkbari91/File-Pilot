# Troubleshooting

- **Blank browser page / desktop bridge missing:** run `npm run dev`, not just `vite`. Filesystem
  APIs are available only through Electron's sandboxed preload.
- **Port 5173 in use:** stop the other development server. FilePilot deliberately uses a fixed,
  loopback-only development origin; do not point it at an arbitrary remote website.
- **Node SQLite import fails:** use the pinned Node 24/Electron versions and `npm ci`. Do not swap
  runtime majors without testing SQLite behavior.
- **File changed / not indexed:** rescan its folder. Preview plans and duplicate memberships are
  invalidated by relevant index changes; external changes require a rescan.
- **Move fails:** inspect History. Existing destinations, links, locked files, permission errors,
  and changed content are not bypassed. A failed publication can leave an extra copy; review both
  paths and do not delete either until their contents are confirmed.
- **Undo conflict:** the original path is occupied, the moved content changed, or its root was removed.
  Resolve manually after inspecting both locations. FilePilot never overwrites to force an undo.
- **Unsupported image:** codec support depends on the Sharp build. Corrupt files and images above
  25 megapixels are skipped. GIF/TIFF only compare the first frame/page.
- **Cancelled scan:** the previous complete index remains. A new scan is required to update it.
- **Export says file exists:** exports use exclusive creation. Choose a new filename instead of
  overwriting an existing file.
- **Database startup error:** close FilePilot and preserve `filepilot.sqlite` plus any `-wal`/`-shm`
  files from its user-data directory. Do not delete the database if you need operation/undo records.
  Request help with the error message after removing private paths.
- **Windows junction test denied:** use a normal terminal with junction permissions. Sandbox
  restrictions can prevent the symlink test even when the app logic is correct.
- **Linux Electron launch denied:** use Xvfb and a runner supporting Chromium's sandbox. Do not
  disable sandboxing in the application to work around deployment configuration.
- **Install/build warnings:** the builder currently includes a development-only moderate npm advisory.
  See LIMITATIONS.md; do not run `npm audit fix --force` without reviewing resulting version changes.

Developer-only `FILEPILOT_DATA_DIR` selects an isolated metadata directory for automated tests.
Packaged builds ignore that variable. No test mode is exposed in the renderer API.
