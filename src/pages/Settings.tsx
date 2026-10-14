import { useEffect, useState } from 'react';
import { Monitor, Sun, Moon, Download, Upload, Trash2 } from 'lucide-react';
import type { Settings as SettingsType } from '../../shared/contracts';
import { api } from '../api';
import { useApp } from '../context';
import { PageHeading, Panel, SafetyNote } from '../components/ui';
export function Settings() {
  const { snapshot, busy, run } = useApp();
  const [draft, setDraft] = useState<SettingsType | null>(null);
  const [exclusions, setExclusions] = useState('');
  useEffect(() => {
    if (snapshot) {
      setDraft(snapshot.settings);
      setExclusions(snapshot.settings.exclusions.join('\n'));
    }
  }, [snapshot]);
  if (!draft || !snapshot) return null;
  return (
    <>
      <PageHeading
        eyebrow="SETTINGS"
        title="Make FilePilot feel like yours."
        description="Local preferences, thoughtful defaults, and control over your data."
      />
      <Panel title="Appearance" subtitle="Choose a theme or follow your device.">
        <div className="theme-options">
          {[
            { id: 'light', icon: Sun, label: 'Light' },
            { id: 'dark', icon: Moon, label: 'Dark' },
            { id: 'system', icon: Monitor, label: 'System' },
          ].map((theme) => (
            <button
              aria-pressed={draft.theme === theme.id}
              className={draft.theme === theme.id ? 'active' : ''}
              disabled={busy}
              key={theme.id}
              onClick={() =>
                void run(() =>
                  api('settings', {
                    ...snapshot.settings,
                    theme: theme.id as SettingsType['theme'],
                  }),
                )
              }
            >
              <theme.icon size={22} />
              {theme.label}
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Scanning & comparison" subtitle="Changes take effect the next time you scan.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                api('settings', {
                  ...draft,
                  exclusions: exclusions
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                }),
              'Preferences saved',
            );
          }}
        >
          <div className="form-grid">
            <label className="field">
              Excluded folder names or relative paths
              <textarea
                rows={5}
                value={exclusions}
                onChange={(e) => setExclusions(e.target.value)}
              />
              <small>
                One per line. Exact names or relative paths, using / separators; no globs.
              </small>
            </label>
            <div>
              <label className="field">
                Maximum subfolder depth
                <input
                  required
                  type="number"
                  min={0}
                  max={100}
                  value={draft.maxDepth}
                  onChange={(e) => setDraft({ ...draft, maxDepth: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                Image similarity distance: {draft.similarityThreshold}
                <input
                  type="range"
                  min={0}
                  max={16}
                  value={draft.similarityThreshold}
                  onChange={(e) =>
                    setDraft({ ...draft, similarityThreshold: Number(e.target.value) })
                  }
                />
                <small>
                  Lower is stricter. A perceptual hash match never proves identical content.
                </small>
              </label>
            </div>
          </div>
          <div className="form-footer">
            <button className="primary" disabled={busy}>
              Save preferences
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => api('exportData', { kind: 'settings' }))}
            >
              <Download size={16} />
              Export
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => api('importSettings', {}))}
            >
              <Upload size={16} />
              Import settings
            </button>
          </div>
        </form>
      </Panel>
      <Panel
        title="Indexed folders"
        subtitle="Removing a folder revokes access and removes its metadata, not its files."
      >
        {snapshot.roots.map((root) => (
          <div className="storage-folder" key={root.id}>
            <span className="wrap-path">{root.path}</span>
            <button
              disabled={busy}
              onClick={() => void run(() => api('removeRoot', { rootId: root.id }))}
            >
              Remove
            </button>
          </div>
        ))}
        {!snapshot.roots.length && <div className="quiet-empty">No folders selected yet.</div>}
      </Panel>
      <Panel title="Local data" subtitle="These actions require confirmation.">
        <div className="form-footer">
          <button disabled={busy} onClick={() => void run(() => api('resetIndex', {}))}>
            Reset index
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => void run(() => api('clearHistory', {}))}
          >
            <Trash2 size={16} />
            Clear history & undo records
          </button>
        </div>
      </Panel>
      <SafetyNote>
        FilePilot 0.1.0 · Preferences and metadata are stored on this device. No telemetry or
        automatic updates are enabled.
      </SafetyNote>
    </>
  );
}
