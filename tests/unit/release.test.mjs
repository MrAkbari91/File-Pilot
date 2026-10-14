import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { releasePlan, releaseTargets, artifactNames } from '../../scripts/release-plan.mjs';
import { validateArtifacts } from '../../scripts/validate-release.mjs';
const env = {
  GITHUB_REPOSITORY: 'example/FilePilot',
  GITHUB_SHA: 'a'.repeat(40),
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_NUMBER: '12',
};
it('creates distinct push previews and keeps retries on the same version', () => {
  expect(releasePlan('0.1.0', env)).toMatchObject({
    version: '0.1.0-preview.12',
    prerelease: true,
  });
  expect(releasePlan('0.1.0', { ...env, GITHUB_RUN_ATTEMPT: '2' })).toEqual(
    releasePlan('0.1.0', env),
  );
  expect(releasePlan('0.1.0', { ...env, GITHUB_RUN_NUMBER: '13' }).tag).not.toBe(
    releasePlan('0.1.0', env).tag,
  );
});
it('only allows main or an exactly matching stable tag', () => {
  expect(releasePlan('0.1.0', { ...env, GITHUB_REF: 'refs/tags/v0.1.0' })).toMatchObject({
    version: '0.1.0',
    prerelease: false,
  });
  for (const ref of ['refs/heads/feature', 'refs/tags/v0.2.0', 'refs/tags/v0.1.0-beta'])
    expect(() => releasePlan('0.1.0', { ...env, GITHUB_REF: ref })).toThrow();
  expect(() => releasePlan('0.1.0', { ...env, GITHUB_SHA: '' })).toThrow();
  expect(() => releasePlan('0.1.0', { ...env, GITHUB_REPOSITORY: '../bad/path' })).toThrow();
});
it('requires all seven installers and verifies the four independent checksum manifests', async () => {
  const parent = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(parent, 'filepilot-release-'));
  const version = '0.1.0-preview.12';
  const names = releaseTargets.flatMap((target) => artifactNames(version, target));
  try {
    expect(names).toHaveLength(7);
    await expect(validateArtifacts(directory, version, releaseTargets, true)).rejects.toThrow(
      /Missing/,
    );
    for (const name of names)
      await writeFile(path.join(directory, name), `synthetic artifact ${name}`);
    // Each native job creates its own checksums before merging into the complete release.
    await validateArtifacts(directory, version, releaseTargets);
    expect(await validateArtifacts(directory, version, releaseTargets, true)).toHaveLength(11);
    await writeFile(path.join(directory, names[0]), 'tampered');
    await expect(validateArtifacts(directory, version, releaseTargets, true)).rejects.toThrow(
      /Checksum/,
    );
    await writeFile(path.join(directory, names[0]), '');
    await expect(validateArtifacts(directory, version, releaseTargets)).rejects.toThrow(/Empty/);
    await writeFile(path.join(directory, 'unexpected.exe'), 'extra');
    await expect(validateArtifacts(directory, version, releaseTargets)).rejects.toThrow(
      /unexpected/,
    );
  } finally {
    if (
      path.dirname(directory) !== parent ||
      !path.basename(directory).startsWith('filepilot-release-')
    )
      throw new Error('Unsafe fixture cleanup');
    await rm(directory, { recursive: true, force: true });
  }
});
