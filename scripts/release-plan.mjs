export const releaseTargets = [
  {
    id: 'windows-x64',
    runner: 'windows-2025',
    platform: 'win32',
    os: 'win',
    arch: 'x64',
    formats: ['exe'],
    executable: 'release/win-unpacked/FilePilot.exe',
  },
  {
    id: 'macos-arm64',
    runner: 'macos-15',
    platform: 'darwin',
    os: 'mac',
    arch: 'arm64',
    formats: ['dmg', 'zip'],
    executable: 'release/mac-arm64/FilePilot.app/Contents/MacOS/FilePilot',
  },
  {
    id: 'macos-x64',
    runner: 'macos-15-intel',
    platform: 'darwin',
    os: 'mac',
    arch: 'x64',
    formats: ['dmg', 'zip'],
    executable: 'release/mac/FilePilot.app/Contents/MacOS/FilePilot',
  },
  {
    id: 'linux-x64',
    runner: 'ubuntu-24.04',
    platform: 'linux',
    os: 'linux',
    arch: 'x64',
    formats: ['AppImage', 'deb'],
    executable: 'release/linux-unpacked/filepilot',
  },
];

export function releasePlan(version, env) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Package version must be stable semver.');
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? ''))
    throw new Error('Missing GitHub repository.');
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) throw new Error('Missing source commit SHA.');
  const stable = env.GITHUB_REF?.startsWith('refs/tags/');
  if (stable && env.GITHUB_REF !== `refs/tags/v${version}`)
    throw new Error('Release tag must match package.json version.');
  if (!stable && env.GITHUB_REF !== 'refs/heads/main')
    throw new Error('Push releases require the main branch.');
  if (!stable && !/^[1-9]\d*$/.test(env.GITHUB_RUN_NUMBER ?? ''))
    throw new Error('Missing workflow run number.');
  // A retry uses the same version so rerunning failed jobs can recover the original draft.
  const resolved = stable ? version : `${version}-preview.${env.GITHUB_RUN_NUMBER}`;
  return {
    version: resolved,
    tag: `v${resolved}`,
    prerelease: !stable,
    sha: env.GITHUB_SHA,
    repository: env.GITHUB_REPOSITORY,
    homepage: `https://github.com/${env.GITHUB_REPOSITORY}`,
    title: `FilePilot ${resolved}`,
  };
}

export const artifactNames = (version, target) =>
  target.formats.map((ext) => `FilePilot-${version}-${target.os}-${target.arch}.${ext}`);
