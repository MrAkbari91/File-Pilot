import type { FilePilotAPI, Method, Request, ResponseMap } from '../shared/contracts';
declare global {
  interface Window {
    filepilot?: FilePilotAPI;
  }
}
export async function api<K extends Method>(
  method: K,
  payload: Request<K>,
): Promise<ResponseMap[K]> {
  if (!window.filepilot)
    throw new Error(
      'Start FilePilot with npm run dev. Filesystem features require the secure desktop app.',
    );
  const result = await window.filepilot.request(method, payload);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
export function bytes(value: number): string {
  if (value === 0) return '0 B';
  const exponent = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** exponent).toLocaleString(undefined, { maximumFractionDigits: exponent ? 1 : 0 })} ${['B', 'KB', 'MB', 'GB', 'TB'][exponent]}`;
}
export const date = (value: number | string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
