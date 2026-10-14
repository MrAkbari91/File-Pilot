import { useEffect, useState, type ReactNode } from 'react';
import { FolderOpen, File, ArrowUpRight, Copy, ImageOff, ShieldCheck } from 'lucide-react';
import type { FileEntry, Root } from '../../shared/contracts';
import { api, bytes, date } from '../api';
import { useApp } from '../context';
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <FolderOpen size={29} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function RootSelect({
  roots,
  value,
  onChange,
  all = false,
}: {
  roots: Root[];
  value: string;
  onChange: (id: string) => void;
  all?: boolean;
}) {
  const { busy, run, snapshot } = useApp();
  useEffect(() => {
    if (!all && !value) {
      const saved = roots.find((root) => root.id === snapshot?.selectedRootId);
      if (saved) onChange(saved.id);
    }
  }, [all, value, roots, snapshot?.selectedRootId, onChange]);
  return (
    <div className="field">
      <span>Folder</span>
      <div className="folder-picker">
        <select
          aria-label="Folder"
          value={value}
          disabled={busy}
          onChange={(e) => {
            onChange(e.target.value);
            void run(() => api('selectRoot', { rootId: e.target.value }));
          }}
        >
          <option value="">{all ? 'All indexed folders' : 'Select a folder'}</option>
          {roots.map((root) => (
            <option key={root.id} value={root.id}>
              {root.path}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() => api('chooseRoots', { single: true })).then((roots) => {
              if (roots?.[0]) onChange(roots[0].id);
            })
          }
        >
          <FolderOpen size={17} />
          Choose folder
        </button>
      </div>
      <small>Choose a folder directly. FilePilot prepares it automatically.</small>
    </div>
  );
}
export function SafetyNote({ children }: { children: ReactNode }) {
  return (
    <div className="safety-note">
      <ShieldCheck size={18} />
      <span>{children}</span>
    </div>
  );
}
export function FileTable({ files, total }: { files: FileEntry[]; total?: number }) {
  const { run } = useApp();
  if (!files.length)
    return (
      <Empty
        title="No files to show"
        description="Choose a folder or adjust your search filters."
      />
    );
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name / location</th>
              <th>Category</th>
              <th>Size</th>
              <th>Modified</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id}>
                <td>
                  <div className="file-name">
                    <File size={17} />
                    <strong>{file.name}</strong>
                  </div>
                  <div className="file-path" title={file.path}>
                    {file.path}
                  </div>
                </td>
                <td>
                  <span className="badge">{file.category}</span>
                </td>
                <td className="nowrap">{bytes(file.size)}</td>
                <td className="nowrap muted">{date(file.modified)}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      title="Open file"
                      aria-label={`Open ${file.name}`}
                      onClick={() =>
                        void run(() => api('openFile', { fileId: file.id, reveal: false }))
                      }
                    >
                      <ArrowUpRight size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Show in folder"
                      aria-label={`Show ${file.name} in folder`}
                      onClick={() =>
                        void run(() => api('openFile', { fileId: file.id, reveal: true }))
                      }
                    >
                      <FolderOpen size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Copy path"
                      aria-label={`Copy path for ${file.name}`}
                      onClick={() =>
                        void run(() => navigator.clipboard.writeText(file.path), 'Path copied')
                      }
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total !== undefined && (
        <div className="table-footer">
          {total.toLocaleString()} indexed results · Showing up to 100 per page
        </div>
      )}
    </>
  );
}
export function Thumbnail({ file }: { file: FileEntry }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    api('thumbnail', { fileId: file.id })
      .then((value) => {
        if (current) setUrl(value);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [file.id]);
  return (
    <div className="thumbnail">
      {url ? <img src={url} alt={file.name} /> : <ImageOff size={24} />}
    </div>
  );
}
