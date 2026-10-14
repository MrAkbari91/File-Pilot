import { z } from 'zod';

export const categories = [
  'Images',
  'Documents',
  'Videos',
  'Audio',
  'Archives',
  'Code',
  'Spreadsheets',
  'Presentations',
  'Executables',
  'Other',
] as const;
export type Category = (typeof categories)[number];
export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  exclusions: z
    .array(z.string().min(1).max(200))
    .max(100)
    .default(['.git', 'node_modules', '$RECYCLE.BIN', 'System Volume Information']),
  maxDepth: z.number().int().min(0).max(100).default(30),
  similarityThreshold: z.number().int().min(0).max(16).default(6),
  automationPaused: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;
export interface Root {
  id: string;
  path: string;
  scannedAt: string | null;
}
export interface FileEntry {
  id: string;
  rootId: string;
  path: string;
  name: string;
  extension: string;
  category: Category;
  size: number;
  modified: number;
  ino: string;
  dev: string;
}
export interface ScanSummary {
  files: number;
  folders: number;
  skipped: number;
  errors: string[];
  cancelled: boolean;
}
export interface Progress {
  kind: string;
  completed: number;
  message: string;
}
export interface PlanItem {
  file: FileEntry;
  destination: string;
  status: 'ready' | 'skip';
  reason?: string;
}
export interface OperationPlan {
  id: string;
  rootId: string;
  destination: string;
  createdAt: string;
  items: PlanItem[];
}
export interface Operation {
  id: string;
  time: string;
  type: 'move' | 'undo' | 'trash';
  source: string;
  destination: string;
  status: 'pending' | 'completed' | 'failed' | 'interrupted';
  error: string | null;
  hash: string | null;
  undone: number;
  parentId: string | null;
}
export interface DuplicateGroup {
  id: string;
  kind: 'exact' | 'name' | 'pixels' | 'similar';
  files: FileEntry[];
  reclaimable: number;
  similarity?: number;
}
export interface DuplicateResult {
  groups: DuplicateGroup[];
  errors: string[];
  cancelled: boolean;
}
export const ruleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  rootId: z.string().uuid(),
  extension: z.string().regex(/^[a-z0-9]{0,20}$/),
  strategy: z.enum(['category', 'extension', 'timeline']),
  trigger: z.enum(['manual', 'interval']),
  intervalMinutes: z.number().int().min(5).max(10080),
  enabled: z.boolean(),
  lastRun: z.string().nullable(),
});
export type Rule = z.infer<typeof ruleSchema>;
export const searchSchema = z.object({
  query: z.string().max(500).default(''),
  rootId: z.string().default(''),
  category: z.string().default(''),
  extension: z.string().max(30).default(''),
  minSize: z.number().min(0).default(0),
  maxSize: z.number().min(0).optional(),
  modifiedAfter: z.number().optional(),
  modifiedBefore: z.number().optional(),
  sort: z.enum(['name', 'size', 'modified']).default('name'),
  page: z.number().int().min(0).default(0),
});
export type SearchInput = z.input<typeof searchSchema>;
export type AssistantIntent =
  | { supported: true; explanation: string; action: 'search'; filters: SearchInput }
  | { supported: true; explanation: string; action: 'organize' | 'duplicates' | 'automation' }
  | { supported: false; explanation: string };
export interface Snapshot {
  roots: Root[];
  selectedRootId: string;
  settings: Settings;
  fileCount: number;
  totalSize: number;
  duplicateGroups: number;
  duplicateBytes: number;
  history: Operation[];
  rules: Rule[];
  lastScan: ScanSummary | null;
}
export interface StorageSummary {
  categories: { category: string; size: number; count: number }[];
  largest: FileEntry[];
  folders: { path: string; size: number; count: number }[];
  emptyFolders: string[];
}

export const requestSchemas = {
  snapshot: z.object({}),
  chooseRoots: z.object({ single: z.boolean().default(false) }),
  selectRoot: z.object({ rootId: z.union([z.string().uuid(), z.literal('')]) }),
  chooseDestination: z.object({}),
  removeRoot: z.object({ rootId: z.string().uuid() }),
  scan: z.object({ rootId: z.string().uuid(), recursive: z.boolean().default(true) }),
  cancel: z.object({}),
  search: searchSchema,
  storage: z.object({}),
  preview: z.object({
    rootId: z.string().uuid(),
    destination: z.string().min(1),
    strategy: z.enum(['category', 'extension', 'timeline']),
    recursive: z.boolean(),
    conflict: z.enum(['skip', 'rename']),
    extension: z.string().default(''),
  }),
  execute: z.object({ planId: z.string().uuid() }),
  duplicates: z.object({
    mode: z.enum(['exact', 'name', 'images']),
    rootId: z.string().default(''),
    threshold: z.number().int().min(0).max(16),
  }),
  trash: z.object({ groupId: z.string().uuid(), fileIds: z.array(z.string().uuid()).min(1) }),
  undo: z.object({ operationId: z.string().uuid() }),
  history: z.object({ query: z.string().max(500).default('') }),
  openFile: z.object({ fileId: z.string().uuid(), reveal: z.boolean() }),
  thumbnail: z.object({ fileId: z.string().uuid() }),
  settings: settingsSchema,
  assistant: z.object({ text: z.string().min(1).max(500) }),
  saveRule: ruleSchema,
  deleteRule: z.object({ id: z.string().uuid() }),
  runRule: z.object({ id: z.string().uuid() }),
  resetIndex: z.object({}),
  clearHistory: z.object({}),
  exportData: z.object({ kind: z.enum(['history', 'duplicates', 'settings']) }),
  importSettings: z.object({}),
} as const;
export type Method = keyof typeof requestSchemas;
export type Request<K extends Method> = z.input<(typeof requestSchemas)[K]>;
export interface ResponseMap {
  snapshot: Snapshot;
  chooseRoots: Root[];
  selectRoot: void;
  chooseDestination: string | null;
  removeRoot: void;
  scan: ScanSummary;
  cancel: void;
  search: { files: FileEntry[]; total: number };
  storage: StorageSummary;
  preview: OperationPlan;
  execute: { completed: number; failed: number; skipped: number; cancelled: boolean };
  duplicates: DuplicateResult;
  trash: { completed: number; failed: number };
  undo: void;
  history: Operation[];
  openFile: void;
  thumbnail: string | null;
  settings: Settings;
  assistant: AssistantIntent;
  saveRule: Rule;
  deleteRule: void;
  runRule: OperationPlan;
  resetIndex: void;
  clearHistory: void;
  exportData: boolean;
  importSettings: Settings | null;
}
export type Result<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
export interface FilePilotAPI {
  request<K extends Method>(method: K, payload: Request<K>): Promise<Result<ResponseMap[K]>>;
  onProgress(callback: (progress: Progress) => void): () => void;
}
