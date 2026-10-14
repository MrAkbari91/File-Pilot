import { useEffect, useState } from 'react';
import type { StorageSummary } from '../../shared/contracts';
import { api, bytes } from '../api';
import { useApp } from '../context';
import { PageHeading, Panel, FileTable, SafetyNote, Empty } from '../components/ui';
export function Storage() {
  const { snapshot, busy, run } = useApp();
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    api('storage', {})
      .then((value) => {
        if (current) setStorage(value);
      })
      .catch((error) => {
        if (current) setError(String(error));
      });
    return () => {
      current = false;
    };
  }, [snapshot]);
  return (
    <>
      <PageHeading
        eyebrow="STORAGE ANALYZER"
        title="Know what’s taking up space."
        description="A useful view of your indexed folders, from the biggest files to the smallest details."
        action={
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run(() => api('chooseRoots', {}))}
          >
            Choose folder
          </button>
        }
      />
      {error && (
        <div className="warning" role="alert">
          {error}
        </div>
      )}
      <div className="dashboard-columns">
        <Panel
          title="Storage by category"
          subtitle={`${bytes(snapshot?.totalSize ?? 0)} across your indexed folders`}
        >
          {storage?.categories.length ? (
            <div className="distribution">
              {storage.categories.map((row, index) => (
                <div className="distribution-row" key={row.category}>
                  <div className="split">
                    <strong>{row.category}</strong>
                    <span>
                      {bytes(row.size)} <small>· {row.count} files</small>
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className={`bar-fill color-${index % 5}`}
                      style={{
                        width: `${Math.max(1, (row.size / (snapshot?.totalSize || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Your storage story starts here"
              description="Choose a folder to see its file type distribution."
            />
          )}
        </Panel>
        <Panel title="Largest folders" subtitle="Direct file sizes; subfolder totals are separate.">
          {storage?.folders.length ? (
            storage.folders.slice(0, 8).map((folder) => (
              <div className="storage-folder" key={folder.path}>
                <span className="wrap-path">{folder.path}</span>
                <strong>{bytes(folder.size)}</strong>
              </div>
            ))
          ) : (
            <div className="quiet-empty">No indexed folders yet.</div>
          )}
        </Panel>
      </div>
      <Panel title="Largest files" subtitle="The 20 largest files in your local index.">
        <FileTable files={storage?.largest ?? []} />
      </Panel>
      {!!storage?.emptyFolders.length && (
        <Panel title="Empty folders" subtitle="No folders are removed automatically.">
          {storage.emptyFolders.slice(0, 50).map((folder) => (
            <div className="storage-folder" key={folder}>
              {folder}
            </div>
          ))}
        </Panel>
      )}
      <SafetyNote>
        This is indexed file size, not complete disk usage. Hard links, filesystem compression, and
        files outside your selected roots can affect physical usage.
      </SafetyNote>
    </>
  );
}
