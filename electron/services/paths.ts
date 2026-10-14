import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import type { Category } from '../../shared/contracts';

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}
export async function canonicalDirectory(input: string): Promise<string> {
  if (!path.isAbsolute(input)) throw new AppError('PATH', 'An absolute folder path is required.');
  const canonical = await realpath(input);
  if (!(await lstat(canonical)).isDirectory()) throw new AppError('PATH', 'Select a folder.');
  return canonical;
}
// Walk every component, including existing destination ancestors. Never follow junctions/symlinks.
export async function safePath(
  root: string,
  candidate: string,
  allowMissing = false,
): Promise<void> {
  if (!inside(root, candidate))
    throw new AppError('PATH', 'The path is outside the approved folder.');
  if ((await realpath(root)) !== root)
    throw new AppError('PATH', 'The approved folder has changed. Select it again.');
  const parts = path.relative(root, candidate).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new AppError('SYMLINK', 'Symbolic links and junctions are excluded.');
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}
const extensions: Record<Exclude<Category, 'Other'>, string[]> = {
  Images: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'avif', 'heic'],
  Documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'epub'],
  Videos: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'],
  Audio: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'],
  Archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
  Code: [
    'js',
    'ts',
    'tsx',
    'jsx',
    'py',
    'html',
    'css',
    'json',
    'java',
    'c',
    'cpp',
    'rs',
    'go',
    'yaml',
    'yml',
  ],
  Spreadsheets: ['xls', 'xlsx', 'csv', 'ods', 'tsv'],
  Presentations: ['ppt', 'pptx', 'odp'],
  Executables: ['exe', 'msi', 'bat', 'cmd', 'ps1', 'sh', 'app', 'deb', 'rpm'],
};
export function categoryFor(extension: string): Category {
  return (
    (Object.entries(extensions).find(([, values]) => values.includes(extension))?.[0] as
      Category | undefined) ?? 'Other'
  );
}
export function extensionFor(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}
export function safeExtension(extension: string): string {
  return /^[a-z0-9]{1,20}$/i.test(extension) ? extension.toLowerCase() : 'no-extension';
}
export function abortIfNeeded(signal: Pick<AbortSignal, 'aborted'>): void {
  if (signal.aborted) throw new AppError('CANCELLED', 'Operation cancelled.');
}
