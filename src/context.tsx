import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Snapshot, Progress } from '../shared/contracts';
import { api } from './api';
interface AppContext {
  snapshot: Snapshot | null;
  busy: boolean;
  progress: Progress | null;
  notice: { text: string; error: boolean } | null;
  refresh: () => Promise<void>;
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;
  dismiss: () => void;
}
const Context = createContext<AppContext | null>(null);
export const useApp = () => useContext(Context)!;
export function AppProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [notice, setNotice] = useState<AppContext['notice']>(null);
  const refresh = useCallback(async () => setSnapshot(await api('snapshot', {})), []);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(true);
      setProgress(null);
      setNotice(null);
      try {
        const result = await fn();
        await refresh();
        if (success) setNotice({ text: success, error: false });
        return result;
      } catch (error) {
        setNotice({ text: error instanceof Error ? error.message : String(error), error: true });
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );
  useEffect(() => {
    void refresh().catch((error) => setNotice({ text: String(error), error: true }));
    return window.filepilot?.onProgress(setProgress);
  }, [refresh]);
  useEffect(() => {
    const theme = snapshot?.settings.theme ?? 'system';
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [snapshot?.settings.theme]);
  return (
    <Context.Provider
      value={{ snapshot, busy, progress, notice, refresh, run, dismiss: () => setNotice(null) }}
    >
      {children}
    </Context.Provider>
  );
}
