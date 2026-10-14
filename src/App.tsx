import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Sparkles,
  Copy,
  Search as SearchIcon,
  ChartPie,
  Zap,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  FolderOpen,
  ShieldCheck,
  X,
  LoaderCircle,
  ArrowUpRight,
} from 'lucide-react';
import type { SearchInput } from '../shared/contracts';
import { api } from './api';
import { useApp } from './context';
import { Dashboard } from './pages/Dashboard';
import { Organizer } from './pages/Organizer';
import { Duplicates } from './pages/Duplicates';
import { Search } from './pages/Search';
import { Storage } from './pages/Storage';
import { History } from './pages/History';
import { Automation } from './pages/Automation';
import { Settings } from './pages/Settings';
import { Assistant } from './pages/Assistant';
import { PageHeading, Panel } from './components/ui';
const navigation = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Smart Organizer', icon: Sparkles },
  { name: 'Duplicate Center', icon: Copy },
  { name: 'Search', icon: SearchIcon },
  { name: 'Storage Analyzer', icon: ChartPie },
  { name: 'Automation', icon: Zap },
  { name: 'History', icon: HistoryIcon },
];
export function App() {
  const { snapshot, busy, progress, notice, dismiss, run, refresh } = useApp();
  const [page, setPage] = useState('Dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [filters, setFilters] = useState<SearchInput>({});
  const [searchKey, setSearchKey] = useState(0);
  const [summary, setSummary] = useState('');
  const navigate = (name: string) => {
    setPage(name);
    if (name === 'Search') {
      setFilters({});
      setSearchKey((value) => value + 1);
    }
  };
  useEffect(() => {
    const listener = (event: Event) => setSummary((event as CustomEvent<string>).detail);
    window.addEventListener('filepilot:summary', listener);
    return () => window.removeEventListener('filepilot:summary', listener);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && ['k', 'f', ','].includes(event.key.toLowerCase())) {
        event.preventDefault();
        setPage(event.key === ',' ? 'Settings' : 'Search');
      }
      if (event.key === 'Escape') {
        dismiss();
        setSummary('');
      }
      if (event.key === 'F5') {
        event.preventDefault();
        void refresh();
      }
      const editing =
        event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName);
      if (modifier && event.key.toLowerCase() === 'z' && !editing && !busy) {
        event.preventDefault();
        const latest = snapshot?.history.find(
          (o) => o.type === 'move' && o.status === 'completed' && !o.undone,
        );
        if (latest)
          void run(
            () => api('undo', { operationId: latest.id }),
            'Move undone. Rescan to refresh your index.',
          );
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [snapshot, busy, run, refresh, dismiss]);
  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <FolderOpen size={23} />
          </div>
          <span>
            FilePilot<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.name}
              title={collapsed ? item.name : undefined}
              aria-label={item.name}
              className={`nav-item ${page === item.name ? 'active' : ''}`}
              aria-current={page === item.name ? 'page' : undefined}
              onClick={() => navigate(item.name)}
            >
              <item.icon size={19} />
              <span>{item.name}</span>
              {item.name === 'Duplicate Center' && !!snapshot?.duplicateGroups && (
                <b>{snapshot.duplicateGroups}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <button
          className={`assistant-nav ${page === 'AI Assistant' ? 'active' : ''}`}
          onClick={() => navigate('AI Assistant')}
          title="Local AI Assistant"
          aria-label="Local AI Assistant"
        >
          <Sparkles size={19} />
          <span>
            <strong>Local assistant</strong>
            <small>A little help, on your device</small>
          </span>
          <ArrowUpRight size={16} />
        </button>
        <div className="sidebar-bottom">
          {[
            { name: 'Settings', icon: SettingsIcon },
            { name: 'About FilePilot', icon: Info },
          ].map((item) => (
            <button
              key={item.name}
              title={item.name}
              aria-label={item.name}
              className={`nav-item ${page === item.name ? 'active' : ''}`}
              onClick={() => navigate(item.name)}
            >
              <item.icon size={18} />
              <span>{item.name}</span>
            </button>
          ))}
          <div className="privacy-indicator">
            <span />
            <span>Private by default</span>
            <ShieldCheck size={15} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title="Toggle sidebar"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
          <div className="breadcrumb">
            Workspace<span>/</span>
            <strong>{page}</strong>
          </div>
          <button className="top-search" onClick={() => navigate('Search')}>
            <SearchIcon size={16} />
            <span>Find a file</span>
            <kbd>Ctrl K</kbd>
          </button>
          <span className="local-badge">
            <span />
            Local workspace
          </span>
        </header>
        <main id="main-content">
          <div className="content">
            {!snapshot && !notice ? (
              <div className="skeleton" aria-label="Loading workspace" />
            ) : (
              <>
                {page === 'Dashboard' && <Dashboard navigate={navigate} />}
                {page === 'Smart Organizer' && <Organizer />}
                {page === 'Duplicate Center' && <Duplicates />}
                {page === 'Search' && <Search key={searchKey} initial={filters} />}
                {page === 'Storage Analyzer' && <Storage />}
                {page === 'History' && <History />}
                {page === 'Automation' && <Automation />}
                {page === 'Settings' && <Settings />}
                {page === 'AI Assistant' && (
                  <Assistant
                    navigate={navigate}
                    search={(value) => {
                      setFilters(value);
                      setSearchKey((k) => k + 1);
                      setPage('Search');
                    }}
                  />
                )}
                {page === 'About FilePilot' && (
                  <>
                    <PageHeading
                      eyebrow="FILEPILOT / 0.1.0"
                      title="Your files. Your device. Your control."
                      description="A free, local-first workspace built to make file management feel simpler."
                    />
                    <Panel title="Built around trust">
                      <div className="about-copy">
                        <p>
                          FilePilot reads only folders you select. Its index, preferences, and
                          history stay in a local SQLite database. Core features require no account,
                          network connection, or paid API.
                        </p>
                        <p>
                          Organization starts with a preview. Exact duplicate removal uses your
                          operating system’s Trash and never falls back to permanent deletion. Undo
                          checks the file’s content before restoring a move.
                        </p>
                        <p>
                          This is an initial development build. Keep backups of important files.
                          File operations cannot be fully atomic across every filesystem, and
                          interrupted moves can leave a second copy requiring manual review.
                        </p>
                        <p>
                          Image similarity suggests candidates; it does not establish identity.
                          Scheduled automations create previews only. Automatic updates and model
                          downloads are disabled.
                        </p>
                        <p>
                          MIT licensed · Windows, macOS, and Linux build targets are configured. See
                          README and the implementation checklist for verified platforms and known
                          limitations.
                        </p>
                      </div>
                    </Panel>
                  </>
                )}
              </>
            )}
          </div>
          <footer className="workspace-footer">
            <span>FILEPILOT</span>
            <span>A calmer place for your files.</span>
            <span>0.1.0 · Local-first</span>
          </footer>
        </main>
        {(busy || notice || summary) && (
          <div
            className={`notification ${notice?.error ? 'error' : ''}`}
            role={notice?.error ? 'alert' : 'status'}
          >
            {busy ? (
              <>
                <LoaderCircle className="spin" size={19} />
                <span>{progress?.message ?? 'Working…'}</span>
                <button onClick={() => void api('cancel', {}).catch(() => {})}>Cancel job</button>
              </>
            ) : (
              <>
                <span>{notice?.text || summary}</span>
                <button
                  className="icon-button"
                  aria-label="Dismiss notification"
                  onClick={() => {
                    dismiss();
                    setSummary('');
                  }}
                >
                  <X size={17} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
