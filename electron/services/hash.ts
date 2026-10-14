import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { FileEntry } from '../../shared/contracts';
import { abortIfNeeded, AppError } from './paths';

export async function assertUnchanged(file: FileEntry): Promise<void> {
  const stat = await lstat(file.path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size !== file.size ||
    stat.mtimeMs !== file.modified ||
    String(stat.ino) !== file.ino ||
    String(stat.dev) !== file.dev
  )
    throw new AppError(
      'CHANGED',
      `File changed since scanning: ${file.name}. Rescan before continuing.`,
    );
}
export async function hashFile(filename: string, signal?: AbortSignal): Promise<string> {
  if (signal) abortIfNeeded(signal);
  const handle = await open(
    filename,
    constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW),
  );
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new AppError('TYPE', 'Only regular files are supported.');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      if (signal) abortIfNeeded(signal);
      hash.update(chunk);
    }
    const after = await handle.stat();
    const pathStat = await lstat(filename);
    if (
      before.mtimeMs !== after.mtimeMs ||
      before.size !== after.size ||
      before.ino !== pathStat.ino ||
      before.dev !== pathStat.dev ||
      pathStat.isSymbolicLink()
    )
      throw new AppError('CHANGED', 'File changed while reading.');
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}
