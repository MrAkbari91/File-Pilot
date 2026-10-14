import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { releaseTargets, artifactNames } from './release-plan.mjs';

export async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
export async function validateArtifacts(directory, version, targets, verify = false) {
  if (!/^\d+\.\d+\.\d+(?:-preview\.\d+)?$/.test(version))
    throw new Error('Invalid release version.');
  const files = await readdir(directory);
  const expected = targets.flatMap((target) => artifactNames(version, target));
  const actual = files.filter((name) => /\.(exe|dmg|zip|AppImage|deb)$/.test(name));
  if (expected.length !== actual.length || expected.some((name) => !actual.includes(name)))
    throw new Error('Missing or unexpected release artifacts.');
  const manifests = [];
  for (const target of targets) {
    const lines = [];
    for (const name of artifactNames(version, target)) {
      const filename = path.join(directory, name);
      const info = await stat(filename);
      if (!info.isFile() || !info.size) throw new Error(`Empty or invalid artifact: ${name}`);
      lines.push(`${await sha256(filename)}  ${name}`);
    }
    const name = `SHA256SUMS-${target.platform}-${target.arch}.txt`;
    const content = `${lines.join('\n')}\n`;
    if (verify) {
      if ((await readFile(path.join(directory, name), 'utf8')).replaceAll('\r\n', '\n') !== content)
        throw new Error(`Checksum mismatch: ${name}`);
    } else await writeFile(path.join(directory, name), content);
    manifests.push(name);
  }
  return [...expected, ...manifests];
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const version = process.env.RELEASE_VERSION || pkg.version;
  if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${version}`)
    throw new Error('Release tag and version differ.');
  if (process.argv.includes('--artifacts') || process.argv.includes('--all')) {
    const all = process.argv.includes('--all');
    const targets = all
      ? releaseTargets
      : releaseTargets.filter((t) => t.platform === process.platform && t.arch === process.arch);
    if (!targets.length) throw new Error('Unsupported build platform.');
    const files = await validateArtifacts(all ? 'artifacts' : 'release', version, targets, all);
    console.log(`Validated ${files.length} release files for ${version}.`);
  } else if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Package version must use stable semantic versioning.');
}
