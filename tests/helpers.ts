import { mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Database } from '../electron/services/database';
import { FileScannerService } from '../electron/services/scanner';
export async function fixture() {
  const parent = await realpath(os.tmpdir());
  const base = await mkdtemp(path.join(parent, 'filepilot-test-'));
  const rootPath = path.join(base, 'source');
  await mkdir(rootPath);
  const db = new Database(path.join(base, 'metadata.sqlite'));
  const root = db.addRoot(await realpath(rootPath));
  const scanner = new FileScannerService(db);
  return {
    base,
    root,
    db,
    scanner,
    scan: () => scanner.scan(root.id, true, new AbortController().signal, () => {}),
    cleanup: async () => {
      if (db.sql.isOpen) db.close();
      if (path.dirname(base) !== parent || !path.basename(base).startsWith('filepilot-test-'))
        throw new Error('Unsafe test cleanup path');
      await rm(base, { recursive: true, force: true });
    },
  };
}
