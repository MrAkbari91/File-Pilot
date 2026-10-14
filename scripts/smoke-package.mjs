import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const executable = process.argv[2];
if (!executable) throw new Error('Pass the path to the packaged executable.');
const parent = await realpath(os.tmpdir());
const base = await mkdtemp(path.join(parent, 'filepilot-package-'));
const profile = path.join(base, 'profile');
const root = path.join(base, 'sample');
await mkdir(root);
await writeFile(path.join(root, 'sample.txt'), 'synthetic packaged-app fixture');
await sharp({ create: { width: 16, height: 16, channels: 3, background: '#40a080' } })
  .png()
  .toFile(path.join(root, 'sample.png'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let application;
try {
  application = await electron.launch({
    executablePath: path.resolve(executable),
    args: [`--user-data-dir=${profile}`],
    env,
  });
  const page = await application.firstWindow();
  await page.getByRole('heading', { name: 'A little order. A lot of clarity.' }).waitFor();
  const runtime = await application.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    profile: app.getPath('userData'),
    electron: process.versions.electron,
    node: process.versions.node,
  }));
  assert.equal(runtime.packaged, true);
  assert.equal(
    path.resolve(runtime.profile),
    path.resolve(profile),
    'Packaged smoke test needs an isolated profile',
  );
  await application.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
  }, root);
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click();
  await page.getByText('2', { exact: true }).waitFor();
  const search = await page.evaluate(() =>
    window.filepilot.request('search', { extension: 'png' }),
  );
  assert.equal(search.ok, true);
  const thumbnail = await page.evaluate(
    (id) => window.filepilot.request('thumbnail', { fileId: id }),
    search.data.files[0].id,
  );
  assert.equal(thumbnail.ok, true);
  assert.match(thumbnail.data, /^data:image\/webp;base64,/);
  console.log(
    `Packaged startup, SQLite scan and native Sharp thumbnail passed: Electron ${runtime.electron}, Node ${runtime.node}.`,
  );
} finally {
  await application?.close();
  if (path.dirname(base) !== parent || !path.basename(base).startsWith('filepilot-package-'))
    throw new Error('Unsafe cleanup path');
  await rm(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
