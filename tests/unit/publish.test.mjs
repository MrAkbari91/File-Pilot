import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  plan: {
    version: '0.1.0-preview.12',
    tag: 'v0.1.0-preview.12',
    repository: 'example/FilePilot',
    sha: 'a'.repeat(40),
    title: 'FilePilot preview',
    prerelease: true,
  },
  validate: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => JSON.stringify(fixture.plan)),
  stat: vi.fn(async () => ({ size: 4 })),
}));
vi.mock('node:fs', () => ({ createReadStream: vi.fn(() => 'data') }));
vi.mock('../../scripts/validate-release.mjs', () => ({ validateArtifacts: fixture.validate }));
let calls;
let assets;
let failUpload;
let existing;
let draft;
const files = ['installer.exe', 'SHA256SUMS-win32-x64.txt'];
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('GITHUB_ACTIONS', 'true');
  vi.stubEnv('GH_TOKEN', 'synthetic-test-token');
  fixture.validate.mockReset().mockResolvedValue(files);
  calls = [];
  assets = [];
  failUpload = false;
  existing = null;
  draft = null;
  // Every fetch is intercepted. These tests cannot contact GitHub or publish anything.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options) => {
      calls.push({ url, method: options.method, body: options.body });
      const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
      if (url.includes('/releases/tags/')) return existing ? json(existing) : json({}, 404);
      if (url.includes('/releases?')) return json(draft ? [draft] : []);
      if (options.method === 'DELETE') return new Response(null, { status: 204 });
      if (url.endsWith('/releases') && options.method === 'POST')
        return json({
          id: 42,
          assets: [],
          upload_url: 'https://uploads.example.test/assets{?name}',
        });
      if (url.startsWith('https://uploads.example.test/')) {
        if (failUpload) return json({ message: 'simulated upload failure' }, 500);
        const asset = { name: new URL(url).searchParams.get('name'), size: 4, state: 'uploaded' };
        assets.push(asset);
        return json(asset);
      }
      if (url.includes('/assets?')) return json(assets);
      if (options.method === 'PATCH') return json({ html_url: 'https://example.test/release' });
      throw new Error(`Unexpected mocked request ${url}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('uploads into a draft and publishes only after every asset is verified', async () => {
  await import('../../scripts/publish-release.mjs');
  const creation = calls.find((call) => call.method === 'POST' && call.url.endsWith('/releases'));
  expect(JSON.parse(creation.body)).toMatchObject({
    draft: true,
    prerelease: true,
    target_commitish: fixture.plan.sha,
  });
  expect(assets).toHaveLength(files.length);
  expect(calls.at(-1).method).toBe('PATCH');
  expect(JSON.parse(calls.at(-1).body)).toEqual({ draft: false, make_latest: 'false' });
});
it('never creates a release if the complete artifact validation fails', async () => {
  fixture.validate.mockRejectedValueOnce(new Error('Checksum mismatch'));
  await expect(import('../../scripts/publish-release.mjs')).rejects.toThrow(/Checksum/);
  expect(calls).toHaveLength(0);
});
it('leaves the draft unpublished if any upload fails', async () => {
  failUpload = true;
  await expect(import('../../scripts/publish-release.mjs')).rejects.toThrow(/Upload failed/);
  expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
});
it('finds and recovers an unpublished draft when tag lookup returns 404', async () => {
  draft = {
    id: 42,
    tag_name: fixture.plan.tag,
    body: `Source commit: ${fixture.plan.sha}`,
    draft: true,
    assets: [{ id: 1, name: 'partial.exe' }],
    upload_url: 'https://uploads.example.test/assets{?name}',
  };
  await import('../../scripts/publish-release.mjs');
  expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/releases'))).toBe(
    false,
  );
  expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
  expect(calls.at(-1).method).toBe('PATCH');
});
it('refuses a release belonging to a different source', async () => {
  existing = { body: 'Source commit: different', draft: true };
  await expect(import('../../scripts/publish-release.mjs')).rejects.toThrow(/another source/);
  expect(calls.every((call) => call.method === 'GET')).toBe(true);
});
it('does not change an already published complete release on retry', async () => {
  existing = {
    body: `Source commit: ${fixture.plan.sha}`,
    draft: false,
    assets: files.map((name) => ({ name, size: 4, state: 'uploaded' })),
    html_url: 'https://example.test/release',
  };
  await import('../../scripts/publish-release.mjs');
  expect(calls.every((call) => call.method === 'GET')).toBe(true);
});
