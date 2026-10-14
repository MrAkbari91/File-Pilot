import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { interpret } from '../../electron/services/assistant';
import { categoryFor, extensionFor, inside, safeExtension } from '../../electron/services/paths';
import { dHash, hamming } from '../../electron/services/duplicates';
import { destinationFor } from '../../electron/services/organizer';
import { settingsSchema, ruleSchema, requestSchemas, type FileEntry } from '../../shared/contracts';

describe('safe paths and classification', () => {
  it('rejects prefix siblings and parent traversal', () => {
    const base = path.resolve('root');
    expect(inside(base, path.join(base, 'file'))).toBe(true);
    expect(inside(base, `${base}-other`)).toBe(false);
    expect(inside(base, path.join(base, '../escape'))).toBe(false);
  });
  it('handles dotfiles, uppercase extensions and extensionless files', () => {
    expect(extensionFor('.env')).toBe('');
    expect(extensionFor('PHOTO.JPG')).toBe('jpg');
    expect(extensionFor('README')).toBe('');
    expect(categoryFor('jpg')).toBe('Images');
    expect(categoryFor('mystery')).toBe('Other');
  });
  it('never turns extensions into directory traversal', () => {
    expect(safeExtension('../../escape')).toBe('no-extension');
    expect(safeExtension('')).toBe('no-extension');
    expect(safeExtension('PDF')).toBe('pdf');
  });
  it('constructs category, extension and modification timeline destinations', () => {
    const f = {
      name: 'report.pdf',
      category: 'Documents',
      extension: 'pdf',
      modified: new Date(2025, 2, 15).getTime(),
    } as FileEntry;
    expect(destinationFor(f, 'out', 'category')).toBe(path.join('out', 'Documents', 'report.pdf'));
    expect(destinationFor(f, 'out', 'extension')).toBe(
      path.join('out', 'Documents', 'pdf', 'report.pdf'),
    );
    expect(destinationFor(f, 'out', 'timeline')).toBe(path.join('out', '2025', '03', 'report.pdf'));
  });
});
describe('local assistant', () => {
  it('converts size units into exact byte filters', () => {
    expect(interpret('Show files larger than 500 MB')).toMatchObject({
      supported: true,
      action: 'search',
      filters: { minSize: 524288000 },
    });
  });
  it('uses previous calendar month including year boundaries', () => {
    expect(interpret('Show PDFs modified last month', new Date(2026, 0, 14))).toMatchObject({
      filters: {
        extension: 'pdf',
        modifiedAfter: new Date(2025, 11, 1).getTime(),
        modifiedBefore: new Date(2026, 0, 1).getTime(),
      },
    });
  });
  it('extracts literal filename terms', () => {
    expect(interpret('Find files with invoice in their name')).toMatchObject({
      filters: { query: 'invoice' },
    });
  });
  it('rejects arbitrary commands and unsupported qualifiers', () => {
    expect(interpret('delete all files')).toMatchObject({ supported: false });
    expect(interpret('Show files larger than 500 MB and delete them')).toMatchObject({
      supported: false,
    });
  });
  it('routes organization to a user-reviewed plan', () => {
    expect(interpret('Organize my Downloads folder by file type')).toMatchObject({
      supported: true,
      action: 'organize',
    });
  });
});
describe('validation and image hashing', () => {
  it('uses safe defaults and rejects unsafe thresholds', () => {
    expect(settingsSchema.parse({})).toMatchObject({
      theme: 'system',
      maxDepth: 30,
      automationPaused: false,
    });
    expect(settingsSchema.safeParse({ similarityThreshold: 65 }).success).toBe(false);
  });
  it('rejects invalid operation IDs and rule paths disguised as extensions', () => {
    expect(requestSchemas.execute.safeParse({ planId: '../../x' }).success).toBe(false);
    expect(
      ruleSchema.safeParse({
        id: crypto.randomUUID(),
        name: 'test',
        rootId: crypto.randomUUID(),
        extension: '../x',
        strategy: 'category',
        trigger: 'manual',
        intervalMinutes: 60,
        enabled: false,
        lastRun: null,
      }).success,
    ).toBe(false);
  });
  it('calculates a 64-bit horizontal gradient hash', () => {
    const ascending = Uint8Array.from({ length: 72 }, (_, i) => i % 9);
    const descending = Uint8Array.from({ length: 72 }, (_, i) => 9 - (i % 9));
    expect(dHash(ascending)).toBe('0000000000000000');
    expect(dHash(descending)).toBe('ffffffffffffffff');
    expect(hamming(dHash(ascending), dHash(descending))).toBe(64);
    expect(hamming('0000000000000001', '0000000000000003')).toBe(1);
  });
});
