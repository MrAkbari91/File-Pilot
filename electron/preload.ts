import { contextBridge, ipcRenderer } from 'electron';
import type {
  FilePilotAPI,
  Method,
  Progress,
  Request,
  ResponseMap,
  Result,
} from '../shared/contracts';

const api: FilePilotAPI = {
  request: <K extends Method>(method: K, payload: Request<K>) =>
    ipcRenderer.invoke('filepilot:request', method, payload) as Promise<Result<ResponseMap[K]>>,
  onProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: Progress) => callback(progress);
    ipcRenderer.on('filepilot:progress', handler);
    return () => ipcRenderer.removeListener('filepilot:progress', handler);
  },
};
contextBridge.exposeInMainWorld('filepilot', api);
