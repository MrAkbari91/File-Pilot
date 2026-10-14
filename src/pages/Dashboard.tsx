import {
  ArrowRight,
  FolderPlus,
  Files,
  HardDrive,
  Copy,
  FolderOpen,
  ScanLine,
  Sparkles,
  Search,
} from 'lucide-react';
import { api, bytes, date } from '../api';
import { useApp } from '../context';
import { Empty, PageHeading, Panel, SafetyNote } from '../components/ui';
export function Dashboard({ navigate }: { navigate: (page: string) => void }) {
  const { snapshot, busy, run } = useApp();
  const addFolders = () => run(() => api('chooseRoots', {}));
  return (
    <>
      <PageHeading
        eyebrow="YOUR FILES, UNDER CONTROL"
        title="A little order. A lot of clarity."
        description="Find what matters. Make room for what’s next."
        action={
          <button className="primary" disabled={busy} onClick={() => void addFolders()}>
            <FolderPlus size={18} />
            Choose folder
          </button>
        }
      />
      <div className="stats-grid">
        {[
          {
            label: 'Indexed folders',
            value: snapshot?.roots.length ?? 0,
            icon: FolderOpen,
            note: 'Only folders you choose',
          },
          {
            label: 'Files indexed',
            value: (snapshot?.fileCount ?? 0).toLocaleString(),
            icon: Files,
            note: 'Your local file catalog',
          },
          {
            label: 'Indexed storage',
            value: bytes(snapshot?.totalSize ?? 0),
            icon: HardDrive,
            note: 'Across selected folders',
          },
          {
            label: 'Duplicate candidates',
            value: snapshot?.duplicateGroups ?? 0,
            icon: Copy,
            note: `${bytes(snapshot?.duplicateBytes ?? 0)} potentially reclaimable`,
          },
        ].map((stat) => (
          <div className="stat" key={stat.label}>
            <div className="stat-label">
              {stat.label}
              <stat.icon size={18} />
            </div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-note">{stat.note}</div>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <Panel
          title="Your folders"
          subtitle="A clearer view starts here."
          action={<span className="badge">{snapshot?.roots.length ?? 0} connected</span>}
        >
          {!snapshot?.roots.length ? (
            <Empty
              title="Give your files a home base"
              description="Choose a folder to build your private index. FilePilot will read its metadata and leave every file in place."
              action={
                <button disabled={busy} onClick={() => void addFolders()}>
                  <FolderPlus size={17} />
                  Choose your first folder
                </button>
              }
            />
          ) : (
            <div className="folder-list">
              {snapshot.roots.map((root) => (
                <div className="folder-row" key={root.id}>
                  <div className="folder-symbol">
                    <FolderOpen size={24} />
                  </div>
                  <div className="grow">
                    <strong>{root.path.split(/[\\/]/).pop() || root.path}</strong>
                    <p className="file-path" title={root.path}>
                      {root.path}
                    </p>
                    <small>
                      {root.scannedAt
                        ? `Last scanned ${date(root.scannedAt)}`
                        : 'Ready for its first scan'}
                    </small>
                  </div>
                  <button
                    title="Rescan folder"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => api('scan', { rootId: root.id, recursive: true }),
                        'Folder index refreshed',
                      )
                    }
                  >
                    <ScanLine size={16} />
                    Rescan
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Make your next move" subtitle="Small actions. A tidier workspace.">
          <div className="quick-actions">
            {[
              {
                page: 'Smart Organizer',
                icon: Sparkles,
                title: 'Put everything in place',
                text: 'Preview a smarter folder structure',
              },
              {
                page: 'Duplicate Center',
                icon: Copy,
                title: 'Spot the extra copies',
                text: 'Compare content, names, or images',
              },
              {
                page: 'Search',
                icon: Search,
                title: 'Find that one file',
                text: 'Search across your selected folders',
              },
              {
                page: 'Storage Analyzer',
                icon: HardDrive,
                title: 'See where space goes',
                text: 'Explore your indexed storage',
              },
            ].map((item) => (
              <button key={item.page} className="quick-action" onClick={() => navigate(item.page)}>
                <div className="quick-icon">
                  <item.icon size={20} />
                </div>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <Panel
        title="Recent activity"
        subtitle="A record of the changes you approve."
        action={
          <button className="text-button" onClick={() => navigate('History')}>
            View history
            <ArrowRight size={15} />
          </button>
        }
      >
        {!snapshot?.history.length ? (
          <div className="quiet-empty">
            No file changes yet. Your next approved operation will appear here.
          </div>
        ) : (
          snapshot.history.map((item) => (
            <div className="activity-row" key={item.id}>
              <span className={`status-dot ${item.status}`} />
              <strong>
                {item.type === 'move'
                  ? 'Moved file'
                  : item.type === 'undo'
                    ? 'Undo move'
                    : 'Moved to Trash'}
              </strong>
              <span className="file-path grow" title={item.source}>
                {item.source}
              </span>
              <span className="badge">{item.status}</span>
              <small>{date(item.time)}</small>
            </div>
          ))
        )}
      </Panel>
      {snapshot?.lastScan && (
        <div className="scan-summary">
          Latest scan: {snapshot.lastScan.files} files · {snapshot.lastScan.folders} folders ·{' '}
          {snapshot.lastScan.skipped} skipped
          {snapshot.lastScan.errors.length > 0 && (
            <details>
              <summary>{snapshot.lastScan.errors.length} scan warnings</summary>
              {snapshot.lastScan.errors.map((error, i) => (
                <p key={i}>{error}</p>
              ))}
            </details>
          )}
        </div>
      )}
      <SafetyNote>
        Your files stay on your device. No account, no uploads, no subscription.
      </SafetyNote>
    </>
  );
}
