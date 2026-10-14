import type { Root, Settings, ScanSummary, Progress } from '../../shared/contracts';

export const SCAN_BATCH_SIZE = 256;
export interface ScanWorkerInput {
  filename: string;
  jobId: string;
  root: Root;
  settings: Settings;
  recursive: boolean;
  cancellation: SharedArrayBuffer;
}
export type ScanWorkerMessage =
  | { type: 'progress'; progress: Progress }
  | { type: 'result'; summary: ScanSummary }
  | { type: 'failure'; message: string; summary: ScanSummary };
