# Builds and releases

The coding agent does not run Git. All commands below are for the owner to review and execute.

## Local packaging

```powershell
npm ci
npm run check
npm run test:e2e
npm run package
node scripts/validate-release.mjs --artifacts
```

On Windows, verify the actual unpacked runtime with synthetic fixtures:

```powershell
node scripts/smoke-package.mjs release/win-unpacked/FilePilot.exe
```

The smoke test checks startup, SQLite scanning, and a Sharp thumbnail in an isolated temporary
`--user-data-dir` profile. It does not install the NSIS package or modify personal documents.

Artifacts go to `release/`. Build on the intended OS. Current targets:

- Windows x64: `FilePilot-0.1.0-win-x64.exe` (NSIS).
- macOS host architecture: DMG and ZIP, named with actual architecture.
- Linux host architecture: AppImage and DEB, named with actual architecture.

The hosted macOS runner builds its native architecture. Intel macOS and ARM64 Windows/Linux require
separate runners/dependency validation and are not claimed as verified. Installer icons are not yet
customized. Unsigned builds can trigger SmartScreen or macOS security warnings. Paid signing is not
required to build. Automatic updates are disabled.

## Initial repository setup — owner only

If this directory is not already a repository:

```powershell
git init
git add .
git commit -m "Build FilePilot desktop development preview"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/File-Pilot.git
git push -u origin main
```

Replace the remote URL with your own empty GitHub repository. If a repository already exists, skip
initialization/remote creation and inspect its current state yourself before committing.

## Release steps — owner only

1. Update `package.json`, its lockfile, and `CHANGELOG.md` together.
2. Run local checks and test the intended installers.
3. Commit/push reviewed source, then create the matching version tag:

```powershell
git add .
git commit -m "Release FilePilot 0.1.0"
git push origin main
git tag -a v0.1.0 -m "FilePilot 0.1.0"
git push origin v0.1.0
```

The first release uses `v0.1.0`; change both version and tag for later releases. Do not reuse a tag.
No force-push, history rewrite, or destructive Git operation is needed.

## GitHub settings and workflow behavior

- Enable Actions for the repository and allow the official `actions/*` actions used in workflows.
- Keep default workflow permissions read-only. Only the publish job grants `contents: write`.
- The checkout step does not persist credentials.
- Node 24.15.0 and the lockfile are used on Windows, macOS, and Linux.
- Exact action release versions are pinned after checking official releases; review upgrades before
  changing those pins. For stricter supply-chain policy, replace versions with audited full commit SHAs.
- `v*` tags start the release matrix. A version mismatch fails before packaging.
- Lint/types/tests/build/Electron workflow tests run before packaging. Linux uses Xvfb.
- Missing platform formats fail validation. SHA-256 sums accompany artifacts.
- Publishing waits for every OS build. Downloaded artifacts must include all three checksum manifests.
- The GitHub-provided token is sufficient. No PAT/signing secrets are required for unsigned builds.

After a release, inspect workflow results, download and verify each artifact, and confirm that names
match actual versions/architectures. CI/release definitions have not run on GitHub until you push.

Official action versions checked during setup:
[checkout](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0),
[upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2),
[download-artifact](https://github.com/actions/download-artifact/releases/tag/v8.0.1).
