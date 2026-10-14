import { useState } from 'react';
import { ArrowRight, FolderOpen, Play, Eye } from 'lucide-react';
import type { OperationPlan } from '../../shared/contracts';
import { api, bytes } from '../api';
import { useApp } from '../context';
import { Empty, PageHeading, Panel, RootSelect, SafetyNote } from '../components/ui';
export function PlanPreview({ plan, onApplied }: { plan: OperationPlan; onApplied: () => void }) {
  const { busy, run } = useApp();
  const [page, setPage] = useState(0);
  const ready = plan.items.filter((i) => i.status === 'ready');
  return (
    <Panel
      title="Review your plan"
      subtitle={`${ready.length} moves · ${bytes(ready.reduce((s, i) => s + i.file.size, 0))} · ${plan.items.length - ready.length} skipped`}
      action={
        <button
          className="primary"
          disabled={busy || !ready.length}
          onClick={() =>
            void run(async () => {
              const result = await api('execute', { planId: plan.id });
              onApplied();
              return result;
            }).then((result) => {
              if (result)
                window.dispatchEvent(
                  new CustomEvent('filepilot:summary', {
                    detail: `${result.completed} moved · ${result.failed} failed · ${result.skipped} skipped${result.cancelled ? ' · cancelled' : ''}. Rescan affected folders to refresh the index.`,
                  }),
                );
            })
          }
        >
          <Play size={16} />
          Apply {ready.length} moves
        </button>
      }
    >
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Destination</th>
              <th>Size</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {plan.items.slice(page * 100, page * 100 + 100).map((item, index) => (
              <tr key={`${item.file.id}-${index}`}>
                <td>
                  <strong>{item.file.name}</strong>
                  <div className="file-path" title={item.file.path}>
                    {item.file.path}
                  </div>
                </td>
                <td>
                  <div className="destination">
                    <ArrowRight size={14} />
                    <span title={item.destination}>{item.destination}</span>
                  </div>
                </td>
                <td>{bytes(item.file.size)}</td>
                <td>
                  <span className={`badge ${item.status === 'ready' ? 'green' : ''}`}>
                    {item.status === 'ready' ? 'Move' : item.reason}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page + 1} of {Math.max(1, Math.ceil(plan.items.length / 100))}
        </span>
        <button disabled={(page + 1) * 100 >= plan.items.length} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </Panel>
  );
}
export function Organizer() {
  const { snapshot, busy, run } = useApp();
  const [rootId, setRootId] = useState('');
  const [destination, setDestination] = useState('');
  const [strategy, setStrategy] = useState<'category' | 'extension' | 'timeline'>('category');
  const [recursive, setRecursive] = useState(true);
  const [conflict, setConflict] = useState<'skip' | 'rename'>('skip');
  const [plan, setPlan] = useState<OperationPlan | null>(null);
  const root = snapshot?.roots.find((r) => r.id === rootId);
  return (
    <>
      <PageHeading
        eyebrow="SMART ORGANIZER"
        title="Everything in its right place."
        description="Turn a busy folder into a structure that makes sense to you."
      />
      <Panel title="Set up your organization" subtitle="Preview first. You stay in control.">
        <div className="form-grid">
          <RootSelect
            roots={snapshot?.roots ?? []}
            value={rootId}
            onChange={(value) => {
              setRootId(value);
              setPlan(null);
            }}
          />
          <label className="field">
            Sort by
            <select
              value={strategy}
              onChange={(e) => {
                setStrategy(e.target.value as typeof strategy);
                setPlan(null);
              }}
            >
              <option value="category">Category · Images, Documents, and more</option>
              <option value="extension">Category + extension · Images/png</option>
              <option value="timeline">Timeline · Year/month of modification</option>
            </select>
          </label>
          <label className="field">
            When a filename exists
            <select
              value={conflict}
              onChange={(e) => {
                setConflict(e.target.value as typeof conflict);
                setPlan(null);
              }}
            >
              <option value="skip">Skip the file</option>
              <option value="rename">Add a unique numeric suffix</option>
            </select>
          </label>
          <div className="field">
            Destination
            <button
              className="destination-picker"
              onClick={() =>
                void run(() => api('chooseDestination', {})).then((value) => {
                  if (value) {
                    setDestination(value);
                    setPlan(null);
                  }
                })
              }
            >
              <FolderOpen size={17} />
              <span>{destination || root?.path || 'Use the selected source folder'}</span>
            </button>
            {destination && (
              <button
                className="text-button"
                onClick={() => {
                  setDestination('');
                  setPlan(null);
                }}
              >
                Use source folder
              </button>
            )}
          </div>
        </div>
        <div className="form-footer">
          <label className="check">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => {
                setRecursive(e.target.checked);
                setPlan(null);
              }}
            />
            Include subfolders
          </label>
          <span className="badge green">
            <Eye size={14} />
            Preview only by default
          </span>
          <button
            className="primary"
            disabled={!root || busy}
            onClick={() =>
              void run(() =>
                api('preview', {
                  rootId,
                  destination: destination || root!.path,
                  strategy,
                  recursive,
                  conflict,
                }),
              ).then((value) => {
                if (value) setPlan(value);
              })
            }
          >
            Generate preview
            <ArrowRight size={17} />
          </button>
        </div>
      </Panel>
      {plan ? (
        <PlanPreview plan={plan} onApplied={() => setPlan(null)} />
      ) : (
        <Empty
          title="A plan before a change"
          description="Choose an indexed folder and a strategy to see exactly where each file would go."
        />
      )}
      <SafetyNote>
        Existing files are never overwritten. Hidden files stay in place. Timeline uses the file’s
        modification date. Empty folders are preserved.
      </SafetyNote>
    </>
  );
}
