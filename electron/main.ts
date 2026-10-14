import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { requestSchemas, type Method } from '../shared/contracts';
import { Database } from './services/database';
import { Application } from './services/application';
import { AppError, messageOf } from './services/paths';

let window: BrowserWindow | null = null;
let application: Application | undefined;
const rendererPath = path.join(__dirname, '../dist/index.html');
const devUrl =
  !app.isPackaged && process.env.FILEPILOT_DEV_URL === 'http://127.0.0.1:5173'
    ? process.env.FILEPILOT_DEV_URL
    : undefined;
const trustedUrl = devUrl ?? pathToFileURL(rendererPath).href;
function trusted(url: string): boolean {
  try {
    const candidate = new URL(url);
    const allowed = new URL(trustedUrl);
    return (
      candidate.protocol === allowed.protocol &&
      candidate.host === allowed.host &&
      candidate.pathname === allowed.pathname
    );
  } catch {
    return false;
  }
}
if (!app.isPackaged && process.env.FILEPILOT_DATA_DIR) {
  mkdirSync(process.env.FILEPILOT_DATA_DIR, { recursive: true });
  app.setPath('userData', process.env.FILEPILOT_DATA_DIR);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    window?.show();
    window?.focus();
  });
  app
    .whenReady()
    .then(() => {
      const dataDir = app.getPath('userData');
      mkdirSync(dataDir, { recursive: true });
      application = new Application(
        new Database(path.join(dataDir, 'filepilot.sqlite')),
        () => window,
        (progress) => {
          if (window && !window.isDestroyed())
            window.webContents.send('filepilot:progress', progress);
        },
      );
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      ipcMain.handle('filepilot:request', async (event, method: unknown, payload: unknown) => {
        try {
          if (
            !window ||
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame ||
            !trusted(event.senderFrame.url)
          )
            throw new AppError('ORIGIN', 'Untrusted request rejected.');
          if (typeof method !== 'string' || !Object.hasOwn(requestSchemas, method))
            throw new AppError('METHOD', 'Unsupported operation.');
          const key = method as Method;
          const validated = requestSchemas[key].parse(payload);
          return { ok: true, data: await application!.handle(key, validated) };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: error instanceof AppError ? error.code : 'REQUEST_FAILED',
              message: messageOf(error),
            },
          };
        }
      });
      const createWindow = () => {
        window = new BrowserWindow({
          width: 1320,
          height: 880,
          minWidth: 760,
          minHeight: 560,
          title: 'FilePilot',
          backgroundColor: '#f6f7f9',
          autoHideMenuBar: true,
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            devTools: !app.isPackaged,
          },
        });
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', (event, url) => {
          if (!trusted(url)) event.preventDefault();
        });
        window.webContents.on('will-attach-webview', (event) => event.preventDefault());
        window.on('close', (event) => {
          if (application?.busy) {
            event.preventDefault();
            void dialog.showMessageBox(window!, {
              message: 'A file job is still running.',
              detail: 'Cancel it and wait for completion before closing FilePilot.',
              buttons: ['OK'],
            });
          }
        });
        window.on('closed', () => {
          window = null;
        });
        if (devUrl) void window.loadURL(devUrl);
        else void window.loadFile(rendererPath);
      };
      createWindow();
      app.on('activate', () => {
        if (!window) createWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox(
        'FilePilot could not start',
        `${messageOf(error)}\nYour files have not been modified. Preserve the metadata database before troubleshooting.`,
      );
      app.quit();
    });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', (event) => {
    if (application?.busy) event.preventDefault();
  });
  app.on('will-quit', () => application?.close());
}
