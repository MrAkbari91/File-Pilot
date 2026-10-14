import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fixture } from '../helpers';
import { FileOrganizerService } from '../../electron/services/organizer';
import { DuplicateDetectionService } from '../../electron/services/duplicates';
import { safePath } from '../../electron/services/paths';
import { hashFile } from '../../electron/services/hash';
import { Database } from '../../electron/services/database';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, link: vi.fn(actual.link) };
});

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  f = await fixture();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await f.cleanup();
});
const write = (name: string, content: string) =>
  fs.writeFile(path.join(f.root.path, name), content);
const preview = (organizer: FileOrganizerService, conflict: 'skip' | 'rename' = 'skip') =>
  organizer.preview({
    rootId: f.root.id,
    destination: f.root.path,
    strategy: 'category',
    recursive: true,
    conflict,
  });

describe('folder indexing', () => {
  it('recurses, excludes folders, tracks empty directories and supports Unicode', async () => {
    await fs.mkdir(path.join(f.root.path, 'nested'));
    await fs.mkdir(path.join(f.root.path, 'empty'));
    await fs.mkdir(path.join(f.root.path, 'node_modules'));
    await write('nested/ગુજરાતી.txt', 'hello');
    await write('node_modules/ignored.js', 'x');
    const summary = await f.scan();
    expect(summary.files).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(f.db.files()[0]?.name).toBe('ગુજરાતી.txt');
    expect(f.db.get<string[]>(`empty:${f.root.id}`, [])).toContain(path.join(f.root.path, 'empty'));
  });
  it('supports nonrecursive scans and maximum depth', async () => {
    await fs.mkdir(path.join(f.root.path, 'nested'));
    await write('nested/deep.txt', 'deep');
    await write('top.txt', 'top');
    await f.scanner.scan(f.root.id, false, new AbortController().signal, () => {});
    expect(f.db.files()).toHaveLength(1);
    f.db.set('settings', { ...f.db.settings(), maxDepth: 0 });
    await f.scan();
    expect(f.db.files()).toHaveLength(1);
  });
  it('preserves the previous snapshot on cancellation', async () => {
    await write('one.txt', 'one');
    await f.scan();
    await write('two.txt', 'two');
    const controller = new AbortController();
    controller.abort();
    const result = await f.scanner.scan(f.root.id, true, controller.signal, () => {});
    expect(result.cancelled).toBe(true);
    expect(f.db.files()).toHaveLength(1);
  });
  it('removes missing files on a completed rescan', async () => {
    await write('gone.txt', 'gone');
    await f.scan();
    await fs.unlink(path.join(f.root.path, 'gone.txt'));
    await f.scan();
    expect(f.db.files()).toHaveLength(0);
  });
  it('refuses a missing root without erasing the index', async () => {
    await write('a.txt', 'a');
    await f.scan();
    await fs.rename(f.root.path, `${f.root.path}-moved`);
    await expect(f.scan()).rejects.toThrow();
    expect(f.db.files()).toHaveLength(1);
  });
  it('skips symbolic-link directories and rejects destination traversal through junctions', async () => {
    const outside = path.join(f.base, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'private.txt'), 'secret');
    await fs.symlink(
      outside,
      path.join(f.root.path, 'alias'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await f.scan();
    expect(f.db.files()).toHaveLength(0);
    await expect(
      safePath(f.root.path, path.join(f.root.path, 'alias', 'new.txt'), true),
    ).rejects.toThrow(/links|junctions/i);
  });
});
describe('organization and recovery', () => {
  it('a preview never modifies files; approved moves and undo work', async () => {
    await write('report.txt', 'important');
    await f.scan();
    const service = new FileOrganizerService(f.db);
    const plan = await preview(service);
    expect(await fs.readFile(path.join(f.root.path, 'report.txt'), 'utf8')).toBe('important');
    await expect(fs.stat(path.join(f.root.path, 'Documents'))).rejects.toThrow();
    expect(await service.execute(plan.id, new AbortController().signal, () => {})).toMatchObject({
      completed: 1,
      failed: 0,
    });
    const operation = f.db.history()[0]!;
    expect(operation.status).toBe('completed');
    expect(await fs.readFile(operation.destination, 'utf8')).toBe('important');
    await service.undo(operation.id, new AbortController().signal);
    expect(await fs.readFile(operation.source, 'utf8')).toBe('important');
    expect(f.db.operation(operation.id).undone).toBe(1);
  });
  it('never overwrites a destination created after preview', async () => {
    await write('a.txt', 'source');
    await f.scan();
    const service = new FileOrganizerService(f.db);
    const plan = await preview(service);
    await fs.mkdir(path.join(f.root.path, 'Documents'));
    await write('Documents/a.txt', 'existing');
    const result = await service.execute(plan.id, new AbortController().signal, () => {});
    expect(result.failed).toBe(1);
    expect(await fs.readFile(path.join(f.root.path, 'a.txt'), 'utf8')).toBe('source');
    expect(await fs.readFile(path.join(f.root.path, 'Documents/a.txt'), 'utf8')).toBe('existing');
  });
  it('handles collisions with skip or deterministic suffixes', async () => {
    await fs.mkdir(path.join(f.root.path, 'Documents'));
    await write('a.txt', 'a');
    await write('Documents/a.txt', 'b');
    await f.scan();
    const service = new FileOrganizerService(f.db);
    const skip = await preview(service);
    expect(skip.items.filter((i) => i.status === 'ready')).toHaveLength(0);
    const rename = await preview(service, 'rename');
    expect(
      rename.items.find((i) => i.file.path === path.join(f.root.path, 'a.txt'))?.destination,
    ).toBe(path.join(f.root.path, 'Documents', 'a (1).txt'));
  });
  it('rejects unapproved destination directories', async () => {
    await write('a.txt', 'a');
    await f.scan();
    const service = new FileOrganizerService(f.db);
    await expect(
      service.preview({
        rootId: f.root.id,
        destination: f.base,
        strategy: 'category',
        recursive: true,
        conflict: 'skip',
      }),
    ).rejects.toThrow(/picker/);
  });
  it('detects changes between scanning and execution', async () => {
    await write('a.txt', 'before');
    await f.scan();
    const service = new FileOrganizerService(f.db);
    const plan = await preview(service);
    await write('a.txt', 'changed content');
    expect((await service.execute(plan.id, new AbortController().signal, () => {})).failed).toBe(1);
    expect(await fs.readFile(path.join(f.root.path, 'a.txt'), 'utf8')).toBe('changed content');
  });
  it('stops before moving a file when cancelled', async () => {
    await write('a.txt', 'a');
    await f.scan();
    const service = new FileOrganizerService(f.db);
    const plan = await preview(service);
    const controller = new AbortController();
    controller.abort();
    expect(await service.execute(plan.id, controller.signal, () => {})).toMatchObject({
      completed: 0,
      cancelled: true,
    });
    expect(await fs.readFile(path.join(f.root.path, 'a.txt'), 'utf8')).toBe('a');
  });
  it('verifies copy-then-remove when hard links report EXDEV', async () => {
    await write('a.txt', 'cross-volume-content');
    await f.scan();
    vi.mocked(fs.link).mockRejectedValueOnce(
      Object.assign(new Error('different volume'), { code: 'EXDEV' }),
    );
    const service = new FileOrganizerService(f.db);
    const plan = await preview(service);
    expect((await service.execute(plan.id, new AbortController().signal, () => {})).completed).toBe(
      1,
    );
    expect(await fs.readFile(path.join(f.root.path, 'Documents', 'a.txt'), 'utf8')).toBe(
      'cross-volume-content',
    );
    await expect(fs.stat(path.join(f.root.path, 'a.txt'))).rejects.toThrow();
  });
  it('refuses undo when original path is occupied or destination changed', async () => {
    await write('a.txt', 'original');
    await f.scan();
    const service = new FileOrganizerService(f.db);
    const plan = await preview(service);
    await service.execute(plan.id, new AbortController().signal, () => {});
    const operation = f.db.history()[0]!;
    await write('a.txt', 'new file');
    await expect(service.undo(operation.id, new AbortController().signal)).rejects.toThrow(
      /exists/,
    );
    await fs.unlink(operation.source);
    await fs.writeFile(operation.destination, 'changed');
    await expect(service.undo(operation.id, new AbortController().signal)).rejects.toThrow(
      /changed/,
    );
  });
  it('preserves dotfiles and no-extension files use a safe folder', async () => {
    await write('.env', 'private');
    await write('README', 'readme');
    await f.scan();
    const service = new FileOrganizerService(f.db);
    const plan = await service.preview({
      rootId: f.root.id,
      destination: f.root.path,
      strategy: 'extension',
      recursive: true,
      conflict: 'skip',
    });
    expect(plan.items.find((i) => i.file.name === '.env')?.status).toBe('skip');
    expect(plan.items.find((i) => i.file.name === 'README')?.destination).toContain('no-extension');
  });
});
describe('duplicates, search and persistence', () => {
  it('hashes content instead of trusting equal sizes or names', async () => {
    await write('a.txt', 'same');
    await write('b.dat', 'same');
    await write('c.txt', 'nope');
    await f.scan();
    const result = await new DuplicateDetectionService(f.db).detect(
      'exact',
      '',
      6,
      new AbortController().signal,
      () => {},
    );
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.files.map((file) => file.name).sort()).toEqual(['a.txt', 'b.dat']);
    expect(result.groups[0]?.reclaimable).toBe(4);
  });
  it('labels filename matches separately from content duplicates', async () => {
    await fs.mkdir(path.join(f.root.path, 'nested'));
    await write('a.txt', 'first');
    await write('nested/a.txt', 'second');
    await f.scan();
    const result = await new DuplicateDetectionService(f.db).detect(
      'name',
      '',
      6,
      new AbortController().signal,
      () => {},
    );
    expect(result.groups[0]?.kind).toBe('name');
    expect(result.groups[0]?.reclaimable).toBe(0);
  });
  it('supports hashing cancellation', async () => {
    await write('a.txt', 'content');
    const controller = new AbortController();
    controller.abort();
    await expect(hashFile(path.join(f.root.path, 'a.txt'), controller.signal)).rejects.toThrow(
      /cancelled/,
    );
  });
  it('escapes search wildcards and combines metadata filters', async () => {
    await write('100%report.txt', 'hello');
    await write('100xreport.txt', 'xx');
    await f.scan();
    expect(f.db.search({ query: '%' }).files).toHaveLength(1);
    expect(f.db.search({ extension: 'txt', minSize: 4 }).files[0]?.name).toBe('100%report.txt');
    expect(f.db.search({ query: "' OR 1=1 --" }).total).toBe(0);
  });
  it('persists preferences/history and marks pending operations interrupted after reopening', async () => {
    const filename = path.join(f.base, 'persist.sqlite');
    const first = new Database(filename);
    first.set('settings', { ...first.settings(), theme: 'dark' });
    const id = crypto.randomUUID();
    first.record({
      id,
      time: new Date().toISOString(),
      type: 'move',
      source: 'a',
      destination: 'b',
      status: 'pending',
      error: null,
      hash: null,
      undone: 0,
      parentId: null,
    });
    first.close();
    const second = new Database(filename);
    try {
      expect(second.settings().theme).toBe('dark');
      expect(second.operation(id).status).toBe('interrupted');
    } finally {
      second.close();
    }
  });
});
