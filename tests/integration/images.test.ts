import { beforeEach, afterEach, it, expect } from 'vitest';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { fixture } from '../helpers';
import {
  imageSignature,
  DuplicateDetectionService,
  hamming,
} from '../../electron/services/duplicates';
let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  f = await fixture();
});
afterEach(async () => {
  await f.cleanup();
});
async function patterned() {
  const data = Buffer.alloc(64 * 64 * 3);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 3;
      data[i] = x * 4;
      data[i + 1] = y * 4;
      data[i + 2] = (x + y) * 2;
    }
  return sharp(data, { raw: { width: 64, height: 64, channels: 3 } });
}
it('matches identical decoded pixels across PNG and lossless WebP', async () => {
  const image = await patterned();
  const a = path.join(f.root.path, 'a.png');
  const b = path.join(f.root.path, 'b.webp');
  await image.clone().png().toFile(a);
  await image.clone().webp({ lossless: true }).toFile(b);
  expect((await imageSignature(a)).pixels).toBe((await imageSignature(b)).pixels);
  await f.scan();
  const result = await new DuplicateDetectionService(f.db).detect(
    'images',
    '',
    6,
    new AbortController().signal,
    () => {},
  );
  expect(result.groups.some((g) => g.kind === 'pixels')).toBe(true);
});
it('finds JPEG conversions and resized variants without claiming identical pixels', async () => {
  const image = await patterned();
  const a = path.join(f.root.path, 'original.png');
  const b = path.join(f.root.path, 'compressed.jpg');
  const c = path.join(f.root.path, 'resized.png');
  await image.clone().png().toFile(a);
  await image.clone().jpeg({ quality: 85 }).toFile(b);
  await image.clone().resize(32, 32).png().toFile(c);
  const signatures = await Promise.all([a, b, c].map(imageSignature));
  expect(signatures[0]?.pixels).not.toBe(signatures[1]?.pixels);
  expect(hamming(signatures[0]!.perceptual, signatures[1]!.perceptual)).toBeLessThanOrEqual(6);
  await f.scan();
  const result = await new DuplicateDetectionService(f.db).detect(
    'images',
    '',
    6,
    new AbortController().signal,
    () => {},
  );
  expect(result.groups.some((g) => g.kind === 'similar' && g.files.length === 3)).toBe(true);
});
it('skips corrupt and unsupported images with visible errors', async () => {
  await writeFile(path.join(f.root.path, 'corrupt.png'), 'this is not an image');
  await writeFile(path.join(f.root.path, 'unsupported.heic'), 'unsupported');
  await f.scan();
  const result = await new DuplicateDetectionService(f.db).detect(
    'images',
    '',
    6,
    new AbortController().signal,
    () => {},
  );
  expect(result.groups).toHaveLength(0);
  expect(result.errors).toHaveLength(2);
});
