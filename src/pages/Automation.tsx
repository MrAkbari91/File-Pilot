import { useState } from 'react';
import { Play, Pause, Trash2, Plus } from 'lucide-react';
import type { Rule, OperationPlan } from '../../shared/contracts';
import { api, date } from '../api';
import { useApp } from '../context';
import { PageHeading, Panel, RootSelect, Empty, SafetyNote } from '../components/ui';
import { PlanPreview } from './Organizer';
export function Automation() {
  const { snapshot, busy, run } = useApp();
  const [editing, setEditing] = useState<Rule | null>(null);
  const [plan, setPlan] = useState<OperationPlan | null>(null);
  const create = () =>
    setEditing({
      id: crypto.randomUUID(),
      name: '',
      rootId: '',
      extension: '',
      strategy: 'category',
      trigger: 'manual',
      intervalMinutes: 60,
      enabled: false,
      lastRun: null,
    });
  return (
    <>
      <PageHeading
        eyebrow="LOCAL AUTOMATION"
        title="A routine for a tidier workspace."
        description="Rules prepare a preview. You approve every file change."
        action={
          <button className="primary" onClick={create}>
            <Plus size={18} />
            Create rule
          </button>
        }
      />
      <SafetyNote>
        Scheduled rules run only while FilePilot is open. They rescan the selected folder and
        prepare a dry run; they never move or delete files automatically.
      </SafetyNote>
      {snapshot && (
        <div className="form-footer">
          <span className="grow">
            Automation is {snapshot.settings.automationPaused ? 'paused' : 'available'}
          </span>
          <button
            disabled={busy}
            onClick={() =>
              void run(() =>
                api('settings', {
                  ...snapshot.settings,
                  automationPaused: !snapshot.settings.automationPaused,
                }),
              )
            }
          >
            {snapshot.settings.automationPaused ? <Play size={16} /> : <Pause size={16} />}{' '}
            {snapshot.settings.automationPaused ? 'Resume schedules' : 'Pause all schedules'}
          </button>
        </div>
      )}
      {editing && (
        <Panel
          title={
            snapshot?.rules.some((r) => r.id === editing.id) ? 'Edit rule' : 'New preview rule'
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api('saveRule', editing)).then((value) => {
                if (value) setEditing(null);
              });
            }}
          >
            <div className="form-grid">
              <label className="field">
                Rule name
                <input
                  required
                  maxLength={80}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <RootSelect
                roots={snapshot?.roots ?? []}
                value={editing.rootId}
                onChange={(rootId) => setEditing({ ...editing, rootId })}
              />
              <label className="field">
                Extension (blank for all)
                <input
                  value={editing.extension}
                  pattern="[a-z0-9]{0,20}"
                  placeholder="pdf"
                  onChange={(e) =>
                    setEditing({ ...editing, extension: e.target.value.toLowerCase() })
                  }
                />
              </label>
              <label className="field">
                Strategy
                <select
                  value={editing.strategy}
                  onChange={(e) =>
                    setEditing({ ...editing, strategy: e.target.value as Rule['strategy'] })
                  }
                >
                  <option value="category">Category</option>
                  <option value="extension">Category + extension</option>
                  <option value="timeline">Modification year/month</option>
                </select>
              </label>
              <label className="field">
                Trigger
                <select
                  value={editing.trigger}
                  onChange={(e) =>
                    setEditing({ ...editing, trigger: e.target.value as Rule['trigger'] })
                  }
                >
                  <option value="manual">Manual preview</option>
                  <option value="interval">Scheduled preview</option>
                </select>
              </label>
              {editing.trigger === 'interval' && (
                <label className="field">
                  Interval (minutes)
                  <input
                    required
                    type="number"
                    min={5}
                    max={10080}
                    value={editing.intervalMinutes}
                    onChange={(e) =>
                      setEditing({ ...editing, intervalMinutes: Number(e.target.value) })
                    }
                  />
                </label>
              )}
            </div>
            <div className="form-footer">
              <span className="badge green">Dry run · approval required</span>
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="primary" disabled={busy || !editing.rootId}>
                Save rule
              </button>
            </div>
          </form>
        </Panel>
      )}
      {!snapshot?.rules.length && !editing ? (
        <Empty
          title="Start with one useful rule"
          description="For example, group PDF files in your Downloads folder. New rules are paused until you enable them."
          action={
            <button onClick={create}>
              <Plus size={16} />
              Create your first rule
            </button>
          }
        />
      ) : (
        snapshot?.rules.map((rule) => (
          <Panel
            key={rule.id}
            title={rule.name}
            subtitle={`${rule.extension ? `.${rule.extension}` : 'All extensions'} · ${rule.strategy} · ${rule.trigger === 'manual' ? 'Manual' : `Every ${rule.intervalMinutes} minutes`} · ${rule.enabled ? 'Enabled' : 'Paused'}`}
            action={
              <div className="row-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() => api('runRule', { id: rule.id })).then((value) => {
                      if (value) setPlan(value);
                    })
                  }
                >
                  <Play size={15} />
                  Preview
                </button>
                <button onClick={() => setEditing(rule)}>Edit</button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() => api('saveRule', { ...rule, enabled: !rule.enabled }))
                  }
                >
                  {rule.enabled ? 'Pause' : 'Enable'}
                </button>
                <button
                  title="Delete rule"
                  aria-label={`Delete ${rule.name}`}
                  disabled={busy}
                  onClick={() => void run(() => api('deleteRule', { id: rule.id }))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            }
          >
            <div className="table-footer">
              {rule.lastRun ? `Last preview: ${date(rule.lastRun)}` : 'No runs yet'} · Destination:
              selected source folder
            </div>
          </Panel>
        ))
      )}
      {plan && <PlanPreview key={plan.id} plan={plan} onApplied={() => setPlan(null)} />}
    </>
  );
}
