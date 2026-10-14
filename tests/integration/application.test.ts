import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { fixture } from '../helpers';
import { Application } from '../../electron/services/application';
import type { Rule, Root, OperationPlan, DuplicateResult } from '../../shared/contracts';

const electronMock = vi.hoisted(() => ({ confirm: vi.fn(), trash: vi.fn(), pick: vi.fn() }));
vi.mock('electron', () => ({
  dialog: { showMessageBox: electronMock.confirm, showOpenDialog: electronMock.pick },
  shell: { trashItem: electronMock.trash },
}));
let f: Awaited<ReturnType<typeof fixture>>;
let application: Application;
beforeEach(async () => {
  f = await fixture();
  application = new Application(
    f.db,
    () => ({}) as BrowserWindow,
    () => {},
  );
  electronMock.confirm.mockReset().mockResolvedValue({ response: 1 });
  electronMock.pick.mockReset().mockResolvedValue({ canceled: false, filePaths: [f.root.path] });
  electronMock.trash.mockReset().mockImplementation((filename: string) => unlink(filename));
});

it('chooses and indexes a new folder directly, remembering the selected folder', async () => {
  const folder = path.join(f.base, 'new-folder');
  await mkdir(folder);
  await writeFile(path.join(folder, 'direct.txt'), 'direct');
  electronMock.pick.mockResolvedValue({ canceled: false, filePaths: [folder] });
  const roots = (await application.handle('chooseRoots', { single: true })) as Root[];
  expect(roots).toHaveLength(1);
  expect(roots[0]!.scannedAt).not.toBeNull();
  expect(application.snapshot().selectedRootId).toBe(roots[0]!.id);
  expect(f.db.search({ rootId: roots[0]!.id }).files[0]?.name).toBe('direct.txt');
  expect(electronMock.pick).toHaveBeenCalledWith(
    expect.objectContaining({ properties: ['openDirectory'] }),
  );
});
it('reuses a saved index and cancelling a picker leaves selection untouched', async () => {
  await f.scan();
  const scan = vi.spyOn(application.scanner, 'scan');
  await application.handle('chooseRoots', {});
  expect(scan).not.toHaveBeenCalled();
  expect(f.db.roots()).toHaveLength(1);
  electronMock.pick.mockResolvedValueOnce({ canceled: true, filePaths: [] });
  expect(await application.handle('chooseRoots', {})).toEqual([]);
  expect(application.snapshot().selectedRootId).toBe(f.root.id);
  await application.handle('removeRoot', { rootId: f.root.id });
  expect(application.snapshot().selectedRootId).toBe('');
});
it('rejects overlapping selections before registering any new folder', async () => {
  const other = path.join(f.base, 'other');
  const child = path.join(f.root.path, 'child');
  await mkdir(other);
  await mkdir(child);
  electronMock.pick.mockResolvedValueOnce({ canceled: false, filePaths: [other, child] });
  await expect(application.handle('chooseRoots', {})).rejects.toThrow(/overlaps/);
  expect(f.db.roots()).toHaveLength(1);
});
it('refreshes new files for organizer and duplicate actions without a manual scan', async () => {
  await application.handle('chooseRoots', {});
  await writeFile(path.join(f.root.path, 'new.txt'), 'new-content');
  await writeFile(path.join(f.root.path, 'copy.txt'), 'new-content');
  const plan = (await application.handle('preview', {
    rootId: f.root.id,
    destination: f.root.path,
    strategy: 'category',
    recursive: true,
    conflict: 'skip',
  })) as OperationPlan;
  expect(plan.items).toHaveLength(2);
  const result = (await application.handle('duplicates', {
    mode: 'exact',
    rootId: f.root.id,
    threshold: 6,
  })) as DuplicateResult;
  expect(result.groups).toHaveLength(1);
});
it('does not create a preview after cancelling automatic preparation', async () => {
  const preview = vi.spyOn(application.organizer, 'preview');
  vi.spyOn(application.scanner, 'scan').mockImplementationOnce(async () => {
    await application.handle('cancel', {});
    return { files: 0, folders: 0, skipped: 0, errors: [], cancelled: true };
  });
  await expect(
    application.handle('preview', {
      rootId: f.root.id,
      destination: f.root.path,
      strategy: 'category',
      recursive: true,
      conflict: 'skip',
    }),
  ).rejects.toThrow(/cancel/i);
  expect(preview).not.toHaveBeenCalled();
  expect(application.busy).toBe(false);
});
afterEach(async () => {
  vi.useRealTimers();
  application.close();
  await f.cleanup();
});

it('rejects deleting every member of an exact group before confirmation', async () => {
  await writeFile(path.join(f.root.path, 'a.txt'), 'same');
  await writeFile(path.join(f.root.path, 'b.txt'), 'same');
  await f.scan();
  const result = await application.duplicates.detect(
    'exact',
    '',
    6,
    new AbortController().signal,
    () => {},
  );
  const group = result.groups[0]!;
  await expect(
    application.handle('trash', { groupId: group.id, fileIds: group.files.map((file) => file.id) }),
  ).rejects.toThrow(/at least one/);
  expect(electronMock.trash).not.toHaveBeenCalled();
});
it('retains a verified keeper and records simulated Trash without a permanent fallback', async () => {
  await writeFile(path.join(f.root.path, 'a.txt'), 'same');
  await writeFile(path.join(f.root.path, 'b.txt'), 'same');
  await f.scan();
  const result = await application.duplicates.detect(
    'exact',
    '',
    6,
    new AbortController().signal,
    () => {},
  );
  const group = result.groups[0]!;
  expect(
    await application.handle('trash', { groupId: group.id, fileIds: [group.files[0]!.id] }),
  ).toEqual({ completed: 1, failed: 0 });
  expect(await readFile(group.files[1]!.path, 'utf8')).toBe('same');
  expect(f.db.history()[0]?.type).toBe('trash');
  expect(f.db.groups()).toHaveLength(0);
});
it('stops duplicate removal if the keeper changes', async () => {
  await writeFile(path.join(f.root.path, 'a.txt'), 'same');
  await writeFile(path.join(f.root.path, 'b.txt'), 'same');
  await f.scan();
  const group = (
    await application.duplicates.detect('exact', '', 6, new AbortController().signal, () => {})
  ).groups[0]!;
  await writeFile(group.files[1]!.path, 'changed keeper');
  expect(
    await application.handle('trash', { groupId: group.id, fileIds: [group.files[0]!.id] }),
  ).toEqual({ completed: 0, failed: 1 });
  expect(electronMock.trash).not.toHaveBeenCalled();
});
it('native denial preserves files and the preview can be approved later', async () => {
  await writeFile(path.join(f.root.path, 'a.txt'), 'a');
  await f.scan();
  const plan = await application.organizer.preview({
    rootId: f.root.id,
    destination: f.root.path,
    strategy: 'category',
    recursive: true,
    conflict: 'skip',
  });
  electronMock.confirm.mockResolvedValueOnce({ response: 0 });
  await expect(application.handle('execute', { planId: plan.id })).rejects.toThrow(
    'No changes made',
  );
  expect(await readFile(path.join(f.root.path, 'a.txt'), 'utf8')).toBe('a');
  expect(application.organizer.plans.has(plan.id)).toBe(true);
});
it('manual automation filters extensions and only prepares a plan', async () => {
  await writeFile(path.join(f.root.path, 'a.pdf'), 'pdf');
  await writeFile(path.join(f.root.path, 'b.txt'), 'text');
  await f.scan();
  const rule: Rule = {
    id: crypto.randomUUID(),
    name: 'PDFs',
    rootId: f.root.id,
    extension: 'pdf',
    strategy: 'category',
    trigger: 'manual',
    intervalMinutes: 5,
    enabled: false,
    lastRun: null,
  };
  await application.handle('saveRule', rule);
  const plan = await application.runRule(rule.id);
  expect(plan.items).toHaveLength(1);
  expect(plan.items[0]?.file.name).toBe('a.pdf');
  expect(await readFile(path.join(f.root.path, 'a.pdf'), 'utf8')).toBe('pdf');
  expect(f.db.rules()[0]?.lastRun).not.toBeNull();
});
it('scheduled previews respect global pause and run while the app is active', async () => {
  await writeFile(path.join(f.root.path, 'a.txt'), 'text');
  await f.scan();
  const rule: Rule = {
    id: crypto.randomUUID(),
    name: 'Scheduled',
    rootId: f.root.id,
    extension: '',
    strategy: 'category',
    trigger: 'interval',
    intervalMinutes: 5,
    enabled: true,
    lastRun: null,
  };
  f.db.saveRule(rule);
  f.db.set('settings', { ...f.db.settings(), automationPaused: true });
  const scan = vi
    .spyOn(application.scanner, 'scan')
    .mockResolvedValue({ files: 1, folders: 1, skipped: 0, errors: [], cancelled: false });
  // Recreate the scheduler under fake timers without sharing a live OS timer.
  vi.useFakeTimers();
  const scheduled = new Application(
    f.db,
    () => ({}) as BrowserWindow,
    () => {},
  );
  const scheduledScan = vi.spyOn(scheduled.scanner, 'scan').mockImplementation(scan);
  const preview = vi.spyOn(scheduled, 'runRule').mockResolvedValue({
    id: crypto.randomUUID(),
    rootId: f.root.id,
    destination: f.root.path,
    createdAt: new Date().toISOString(),
    items: [],
  });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(preview).not.toHaveBeenCalled();
  f.db.set('settings', { ...f.db.settings(), automationPaused: false });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(preview).toHaveBeenCalledOnce();
  expect(scheduledScan).toHaveBeenCalledOnce();
  // Clear this fake timer; the original application's timer is disposed by afterEach.
  vi.clearAllTimers();
  vi.useRealTimers();
});
