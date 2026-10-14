import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { DuplicateGroup, DuplicateResult, FileEntry, Progress } from '../../shared/contracts';
import { Database } from './database';
import { abortIfNeeded, messageOf, safePath } from './paths';
import { assertUnchanged, hashFile } from './hash';

sharp.cache({ memory: 32, files: 0, items: 50 });
sharp.concurrency(2);
const imageOptions = {
  limitInputPixels: 25_000_000,
  failOn: 'warning' as const,
  animated: false,
  pages: 1,
};
export function dHash(pixels: Uint8Array): string {
  let bits = 0n;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      bits = (bits << 1n) | (pixels[y * 9 + x]! > pixels[y * 9 + x + 1]! ? 1n : 0n);
  return bits.toString(16).padStart(16, '0');
}
export function hamming(a: string, b: string): number {
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (value) {
    value &= value - 1n;
    count++;
  }
  return count;
}
export async function imageSignature(filename: string) {
  const image = sharp(filename, imageOptions).rotate().toColourspace('srgb').ensureAlpha();
  const { data, info } = await image.clone().raw().toBuffer({ resolveWithObject: true });
  const pixels = createHash('sha256')
    .update(`${info.width}:${info.height}:`)
    .update(data)
    .digest('hex');
  const tiny = await image
    .clone()
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .resize(9, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
  return { pixels, perceptual: dHash(tiny), width: info.width, height: info.height };
}
export async function thumbnail(filename: string): Promise<string> {
  const bytes = await sharp(filename, imageOptions)
    .rotate()
    .resize(360, 240, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
  return `data:image/webp;base64,${bytes.toString('base64')}`;
}
export class DuplicateDetectionService {
  constructor(private db: Database) {}
  async detect(
    mode: 'exact' | 'name' | 'images',
    rootId: string,
    threshold: number,
    signal: AbortSignal,
    progress: (p: Progress) => void,
  ): Promise<DuplicateResult> {
    const result: DuplicateResult = { groups: [], errors: [], cancelled: false };
    const files = this.db.files(rootId);
    const bins = new Map<string, FileEntry[]>();
    let processed = 0;
    const push = (key: string, file: FileEntry) => bins.set(key, [...(bins.get(key) ?? []), file]);
    const addGroup = (kind: DuplicateGroup['kind'], members: FileEntry[], similarity?: number) => {
      if (members.length < 2) return;
      // Multiple hard links share physical storage, so do not count them as independent copies.
      const unique = [...new Map(members.map((f) => [`${f.dev}:${f.ino}`, f])).values()];
      if (unique.length < 2) return;
      result.groups.push({
        id: randomUUID(),
        kind,
        files: unique,
        reclaimable:
          kind === 'name' || kind === 'similar'
            ? 0
            : unique.reduce((sum, f) => sum + f.size, 0) - Math.max(...unique.map((f) => f.size)),
        ...(similarity !== undefined ? { similarity } : {}),
      });
    };
    try {
      if (mode === 'name') {
        for (const f of files) {
          abortIfNeeded(signal);
          push(
            process.platform === 'win32'
              ? f.name.normalize('NFC').toLowerCase()
              : f.name.normalize('NFC'),
            f,
          );
        }
        for (const group of bins.values()) addGroup('name', group);
      } else if (mode === 'exact') {
        const sizes = new Map<number, FileEntry[]>();
        for (const f of files) sizes.set(f.size, [...(sizes.get(f.size) ?? []), f]);
        for (const candidates of sizes.values()) {
          if (candidates.length < 2) continue;
          for (const file of candidates) {
            abortIfNeeded(signal);
            try {
              await safePath(this.db.root(file.rootId).path, file.path);
              await assertUnchanged(file);
              const hash = await hashFile(file.path, signal);
              await assertUnchanged(file);
              push(hash, file);
            } catch (error) {
              abortIfNeeded(signal);
              if (result.errors.length < 100)
                result.errors.push(`${file.name}: ${messageOf(error)}`);
            }
            progress({
              kind: 'duplicates',
              completed: ++processed,
              message: `Comparing ${file.name}`,
            });
          }
        }
        for (const group of bins.values()) addGroup('exact', group);
      } else {
        const signatures: { file: FileEntry; pixels: string; perceptual: string }[] = [];
        for (const file of files.filter((f) => f.category === 'Images')) {
          abortIfNeeded(signal);
          try {
            await safePath(this.db.root(file.rootId).path, file.path);
            await assertUnchanged(file);
            const signature = await imageSignature(file.path);
            await assertUnchanged(file);
            push(signature.pixels, file);
            signatures.push({ file, ...signature });
          } catch (error) {
            if (result.errors.length < 100) result.errors.push(`${file.name}: ${messageOf(error)}`);
          }
          progress({ kind: 'images', completed: ++processed, message: `Comparing ${file.name}` });
        }
        for (const group of bins.values()) addGroup('pixels', group);
        // Representative grouping avoids claiming transitive similarity. Every member matches the anchor.
        const used = new Set<string>();
        for (let i = 0; i < signatures.length; i++) {
          abortIfNeeded(signal);
          const anchor = signatures[i]!;
          if (used.has(anchor.file.id)) continue;
          const members = [anchor.file];
          let maxDistance = 0;
          for (let j = i + 1; j < signatures.length; j++) {
            const other = signatures[j]!;
            if (used.has(other.file.id) || anchor.pixels === other.pixels) continue;
            const distance = hamming(anchor.perceptual, other.perceptual);
            if (distance <= threshold) {
              members.push(other.file);
              used.add(other.file.id);
              maxDistance = Math.max(maxDistance, distance);
            }
          }
          if (members.length > 1) {
            used.add(anchor.file.id);
            addGroup('similar', members, Math.round((1 - maxDistance / 64) * 100));
          }
          if (i % 50 === 0) await new Promise((resolve) => setImmediate(resolve));
        }
      }
      abortIfNeeded(signal);
      this.db.saveGroups(result.groups);
    } catch (error) {
      if (signal.aborted) {
        result.cancelled = true;
        result.groups = [];
      } else throw error;
    }
    return result;
  }
}
