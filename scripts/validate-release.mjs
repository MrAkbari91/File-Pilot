import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const tag = process.env.RELEASE_TAG;
if (!/^\d+\.\d+\.\d+$/.test(pkg.version))
  throw new Error('Package version must use stable semantic versioning.');
if (tag && tag !== `v${pkg.version}`)
  throw new Error(`Tag ${tag} does not match package version ${pkg.version}.`);
if (process.argv.includes('--artifacts')) {
  const files = await readdir('release');
  const extensions =
    process.platform === 'win32'
      ? ['.exe']
      : process.platform === 'darwin'
        ? ['.dmg', '.zip']
        : ['.AppImage', '.deb'];
  const artifacts = files.filter(
    (name) =>
      extensions.some((ext) => name.endsWith(ext)) &&
      name.startsWith(`FilePilot-${pkg.version}-`) &&
      name.includes(`-${process.arch}.`),
  );
  for (const ext of extensions)
    if (!artifacts.some((name) => name.endsWith(ext)))
      throw new Error(`Missing ${process.platform}/${process.arch} ${ext} artifact.`);
  const checksums = [];
  for (const name of artifacts) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path.join('release', name))) hash.update(chunk);
    checksums.push(`${hash.digest('hex')}  ${name}`);
  }
  await writeFile(
    path.join('release', `SHA256SUMS-${process.platform}-${process.arch}.txt`),
    `${checksums.join('\n')}\n`,
  );
  console.log(`Validated ${artifacts.length} installer/archive artifacts; checksums written.`);
}
console.log(`Release version validated: ${pkg.version}`);
