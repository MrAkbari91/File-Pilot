import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'vite';

test('desktop workflow, secure IPC, real files, themes, and restart persistence', async () => {
  const parent = await realpath(os.tmpdir());
  const base = await mkdtemp(path.join(parent, 'filepilot-e2e-'));
  const root = path.join(base, 'Documents');
  await mkdir(root);
  await writeFile(path.join(root, 'invoice.txt'), 'invoice content');
  await writeFile(path.join(root, 'invoice-copy.txt'), 'invoice content');
  await writeFile(path.join(root, 'notes.md'), 'meeting notes');
  let application: ElectronApplication | undefined;
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    FILEPILOT_DATA_DIR: path.join(base, 'app-data'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    application = await electron.launch({ args: ['.'], env });
    const page = await application.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(
      page.getByRole('heading', { name: 'A little order. A lot of clarity.' }),
    ).toBeVisible();
    expect(
      await application.evaluate(({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0]!.webContents as unknown as {
          getLastWebPreferences: () => {
            sandbox: boolean;
            contextIsolation: boolean;
            nodeIntegration: boolean;
          };
        };
        const prefs = contents.getLastWebPreferences();
        return {
          sandbox: prefs.sandbox,
          contextIsolation: prefs.contextIsolation,
          nodeIntegration: prefs.nodeIntegration,
        };
      }),
    ).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false });
    expect(
      await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
    ).toBe('undefined');
    const invalid = await page.evaluate(async () =>
      window.filepilot!.request('execute', { planId: 'not-a-uuid' }),
    );
    expect(invalid.ok).toBe(false);
    await application.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
    }, root);
    await page.getByRole('button', { name: 'Scan a folder', exact: true }).click();
    await expect(page.getByText('3', { exact: true })).toBeVisible();
    await mkdir('.local', { recursive: true });
    await page.screenshot({ path: '.local/dashboard-light.png', fullPage: true });
    await page.getByRole('button', { name: 'Duplicate Center', exact: true }).click();
    await page.getByRole('button', { name: 'Find matches', exact: true }).click();
    await expect(page.getByRole('heading', { name: '2 matching files' })).toBeVisible();
    const selections = page.getByRole('checkbox');
    await selections.first().check();
    await expect(selections.nth(1)).toBeDisabled();
    await page.getByRole('button', { name: 'Smart Organizer', exact: true }).click();
    await page.getByLabel('Folder', { exact: true }).selectOption({ label: root });
    await page.getByRole('button', { name: 'Generate preview' }).click();
    await expect(page.getByRole('heading', { name: 'Review your plan' })).toBeVisible();
    expect(await readFile(path.join(root, 'invoice.txt'), 'utf8')).toBe('invoice content');
    // Exercise the native confirmation denial before approval, without showing modal OS dialogs in CI.
    await application.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    });
    await page.getByRole('button', { name: 'Apply 3 moves' }).click();
    await expect(page.getByText('No changes made.')).toBeVisible();
    expect(await readFile(path.join(root, 'invoice.txt'), 'utf8')).toBe('invoice content');
    await application.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    await page.getByRole('button', { name: 'Apply 3 moves' }).click();
    await expect(page.getByRole('heading', { name: 'A plan before a change' })).toBeVisible();
    expect(await readFile(path.join(root, 'Documents', 'invoice.txt'), 'utf8')).toBe(
      'invoice content',
    );
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo move' })).toHaveCount(3);
    await page.getByRole('button', { name: 'Undo move' }).first().click();
    await expect(page.getByRole('button', { name: 'Undo move' })).toHaveCount(2);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await page.screenshot({ path: '.local/dashboard-dark.png', fullPage: true });
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setSize(800, 650),
    );
    await page.screenshot({ path: '.local/dashboard-small.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('heading', { name: 'Less looking. More finding.' })).toBeVisible();
    expect(errors).toEqual([]);
    await application.close();
    application = undefined;
    application = await electron.launch({ args: ['.'], env });
    const reopened = await application.firstWindow();
    await expect(reopened.locator('html')).toHaveAttribute('data-theme', 'dark');
    await reopened.getByRole('button', { name: 'History', exact: true }).click();
    await expect(reopened.getByRole('button', { name: 'Undo move' })).toHaveCount(2);
  } finally {
    await application?.close();
    if (path.dirname(base) !== parent || !path.basename(base).startsWith('filepilot-e2e-'))
      throw new Error('Unsafe fixture path');
    await rm(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

test('Vite development startup keeps CSP and the desktop bridge working', async () => {
  const parent = await realpath(os.tmpdir());
  const base = await mkdtemp(path.join(parent, 'filepilot-e2e-'));
  const server = await createServer();
  let application: ElectronApplication | undefined;
  try {
    await server.listen();
    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      FILEPILOT_DATA_DIR: base,
      FILEPILOT_DEV_URL: 'http://127.0.0.1:5173',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    application = await electron.launch({ args: ['.'], env });
    const page = await application.firstWindow();
    await expect(
      page.getByRole('heading', { name: 'A little order. A lot of clarity.' }),
    ).toBeVisible();
    expect((await page.evaluate(() => window.filepilot!.request('snapshot', {}))).ok).toBe(true);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  } finally {
    await application?.close();
    await server.close();
    if (path.dirname(base) !== parent || !path.basename(base).startsWith('filepilot-e2e-'))
      throw new Error('Unsafe fixture path');
    await rm(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
