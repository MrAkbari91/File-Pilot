# Builds and releases

The coding agent never runs Git. Git commands below are for the owner to review and execute.

## Publish the changes

The repository already exists. Commit the reviewed changes and push to **main**:

```powershell
git add .
git commit -m "Automate cross-platform releases and direct folder selection"
git push origin main
```

Open GitHub **Actions → Build and release**. A successful run publishes a downloadable prerelease
under **Releases**, named `v0.1.0-preview.N`, where N is the workflow run number. Each main push gets
its own version; retrying the same run keeps the original version. Prereleases appear on the Releases
page, but do not replace GitHub's latest stable release. Workflow dispatch can retry from main.

## Download formats

| Platform            | Native runner  | Files                                          |
| ------------------- | -------------- | ---------------------------------------------- |
| Windows x64         | windows-2025   | `FilePilot-VERSION-win-x64.exe`                |
| macOS Apple Silicon | macos-15       | `FilePilot-VERSION-mac-arm64.dmg`, `.zip`      |
| macOS Intel         | macos-15-intel | `FilePilot-VERSION-mac-x64.dmg`, `.zip`        |
| Linux x64           | ubuntu-24.04   | `FilePilot-VERSION-linux-x64.AppImage`, `.deb` |

Each release contains seven installers/archives and four SHA-256 manifests. Windows/Linux ARM builds
are outside this matrix. Choose the macOS architecture matching your computer. Windows uses an NSIS
installer; macOS uses a disk image or zipped app; Linux offers an executable AppImage or Debian package.

These are development builds. Windows is unsigned. macOS has ad-hoc signing for native execution,
without Apple notarization; downloaded apps can be blocked by Gatekeeper. No signing secrets or
paid certificate is needed to build. Public trust, installer installation/uninstallation, icons and
automatic updates remain separate work. Linux AppImage requires FUSE support and a supported Chromium
sandbox configuration. Do not disable application sandboxing to bypass system restrictions.

## What the workflow checks

1. Validate source SHA, main branch or matching stable tag, and package version.
2. Install Node 24.15.0 and locked npm dependencies independently on all four native runners.
   Explicitly run Electron's pinned installer before configuring the Linux sandbox. Electron 44
   downloads its runtime lazily; `npm ci` alone does not guarantee that `dist/chrome-sandbox` exists.
3. Run lint, types, unit/integration tests, production build, and real Electron workflows.
4. Package installers with release version and GitHub-derived homepage/repository metadata.
5. Launch each unpacked packaged app with an isolated temporary profile; verify SQLite and native
   Sharp thumbnails using synthetic files. Linux uses Xvfb and the Chromium setuid sandbox helper.
6. Validate exact expected filenames/architectures and nonempty artifacts; create SHA-256 manifests.
7. Download all jobs' artifacts in a separate publisher and verify all seven files against manifests.
8. Create a draft GitHub release, upload and confirm all eleven assets, then publish it.

Any failed build/check prevents publication. An upload failure leaves a draft, which a rerun can
recover. An existing published release is not overwritten. Its source marker and assets must match.
Build artifacts are also retained under the Actions run for 14 days. No partial public release is
created by the normal workflow. Network outages, repository policies, runner changes or signing
requirements can still fail a run; success cannot be guaranteed before it actually runs.

## Repository settings

- Enable GitHub Actions and allow the official `actions/*` actions used here.
- Keep default permissions read-only. Only the publish job requests `contents: write`.
- The built-in `GITHUB_TOKEN` is sufficient; no PAT or manual repository URL is required.
- Repository/organization rules must permit Actions to create release tags and releases. Protected
  tag rules may require a policy adjustment by the owner. Private repositories need available Actions
  minutes, including macOS runners.
- Checkout does not persist credentials. The agent has executed no Git commands.
- Pull requests run checks only; main pushes perform the full release pipeline.

## Stable version release — owner only

For the current package version, after reviewing the preview and testing installers:

```powershell
git tag -a v0.1.0 -m "FilePilot 0.1.0"
git push origin v0.1.0
```

The version tag must exactly match `package.json`. For future versions update `package.json`,
`package-lock.json`, and `CHANGELOG.md` together before committing and tagging. Never reuse a
published version tag. Stable builds use the same four-runner checks and complete-set verification.

## Local verification

```powershell
npm ci
npm run check
npm run test:e2e
npm run package
node scripts/validate-release.mjs --artifacts
node scripts/smoke-package.mjs release/win-unpacked/FilePilot.exe
```

The last path is for Windows. Build on the target OS. CI generates `.local/builder-release.json`
using GitHub environment metadata, including the homepage required for Linux Debian packaging.
Local Linux packaging needs a real homepage in package metadata or an equivalent builder override.
The packaged smoke test does not install the installer or exercise OS Trash. macOS/Linux jobs and
GitHub publication still need their first remote execution; local results are in IMPLEMENTATION.md.

Official references: [GitHub hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[release REST API](https://docs.github.com/en/rest/releases/releases),
[electron-builder Linux packaging](https://www.electron.build/docs/linux/),
[checkout](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0),
[upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2),
[download-artifact](https://github.com/actions/download-artifact/releases/tag/v8.0.1).
