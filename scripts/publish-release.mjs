import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { releaseTargets } from './release-plan.mjs';
import { validateArtifacts } from './validate-release.mjs';

if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.GH_TOKEN)
  throw new Error('Publishing is restricted to GitHub Actions.');
const plan = JSON.parse(await readFile('.local/release-plan.json', 'utf8'));
const files = await validateArtifacts('artifacts', plan.version, releaseTargets, true);
const api = `https://api.github.com/repos/${plan.repository}`;
const headers = {
  Authorization: `Bearer ${process.env.GH_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};
async function request(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok)
    throw new Error(`GitHub ${method} failed (${response.status}): ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}
let release = await request(`${api}/releases/tags/${encodeURIComponent(plan.tag)}`);
// The tag endpoint only guarantees published releases. Authenticated listings also include drafts.
if (!release) {
  for (let page = 1; ; page++) {
    const releases = await request(`${api}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(releases)) throw new Error('Unable to inspect existing release drafts.');
    release = releases.find((candidate) => candidate.tag_name === plan.tag);
    if (release || releases.length < 100) break;
  }
}
// The commit in the release body also identifies drafts made from annotated version tags.
const marker = `Source commit: ${plan.sha}`;
if (release && !release.body?.includes(marker))
  throw new Error('This release tag already belongs to another source.');
const sizes = Object.fromEntries(
  await Promise.all(
    files.map(async (name) => [name, (await stat(path.join('artifacts', name))).size]),
  ),
);
if (release && !release.draft) {
  if (
    files.some(
      (name) =>
        !release.assets.some(
          (asset) =>
            asset.name === name && asset.size === sizes[name] && asset.state === 'uploaded',
        ),
    )
  )
    throw new Error('Published release has incomplete assets; refusing to overwrite it.');
  console.log(`Already published: ${release.html_url}`);
} else {
  release ??= await request(`${api}/releases`, 'POST', {
    tag_name: plan.tag,
    target_commitish: plan.sha,
    name: plan.title,
    draft: true,
    prerelease: plan.prerelease,
    body: `${marker}\n\nDownload the installer for your system. macOS: arm64 for Apple Silicon, x64 for Intel. Linux: AppImage or Debian package. SHA256SUMS files verify the downloads.\n\nDevelopment preview: Windows is unsigned; macOS uses ad-hoc signing and is not notarized. OS trust warnings can occur. See docs/RELEASE.md for installation notes.`,
  });
  // Only a draft is mutable. A failed upload leaves the entire release unpublished for a retry.
  for (const asset of release.assets) await request(`${api}/releases/assets/${asset.id}`, 'DELETE');
  for (const name of files) {
    const upload = release.upload_url.replace(/\{.*$/, '') + `?name=${encodeURIComponent(name)}`;
    const response = await fetch(upload, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(sizes[name]),
      },
      body: createReadStream(path.join('artifacts', name)),
      duplex: 'half',
      signal: AbortSignal.timeout(600_000),
    });
    if (!response.ok)
      throw new Error(`Upload failed for ${name}: ${response.status} ${await response.text()}`);
    const asset = await response.json();
    if (asset.state !== 'uploaded' || asset.size !== sizes[name])
      throw new Error(`Incomplete upload: ${name}`);
  }
  const uploaded = await request(`${api}/releases/${release.id}/assets?per_page=100`);
  if (
    uploaded.length !== files.length ||
    files.some(
      (name) =>
        !uploaded.some(
          (asset) =>
            asset.name === name && asset.size === sizes[name] && asset.state === 'uploaded',
        ),
    )
  )
    throw new Error('Final uploaded asset set is incomplete.');
  const published = await request(`${api}/releases/${release.id}`, 'PATCH', {
    draft: false,
    make_latest: plan.prerelease ? 'false' : 'true',
  });
  console.log(`Published ${published.html_url}`);
}
