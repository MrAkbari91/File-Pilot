import { useEffect, useState } from 'react';
import { Download, Undo2 } from 'lucide-react';
import type { Operation } from '../../shared/contracts';
import { api, date } from '../api';
import { useApp } from '../context';
import { PageHeading, Panel, Empty } from '../components/ui';
export function History() {
  const { snapshot, busy, run } = useApp();
  const [query, setQuery] = useState('');
  const [operations, setOperations] = useState<Operation[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      api('history', { query })
        .then((value) => {
          if (current) setOperations(value);
        })
        .catch((error) => {
          if (current) setError(String(error));
        });
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, snapshot]);
  const filtered = operations.filter((o) => !status || o.status === status);
  return (
    <>
      <PageHeading
        eyebrow="OPERATION HISTORY"
        title="Every change, accounted for."
        description="Review what happened and safely reverse eligible moves."
        action={
          <button
            disabled={busy}
            onClick={() => void run(() => api('exportData', { kind: 'history' }))}
          >
            <Download size={17} />
            Export history
          </button>
        }
      />
      <Panel>
        <div className="form-grid">
          <label className="field">
            Search paths
            <input
              value={query}
              placeholder="Find an operation…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="field">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {['completed', 'failed', 'interrupted', 'pending'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </Panel>
      {error && <div className="warning">{error}</div>}
      {!filtered.length ? (
        <Empty
          title="A clean slate"
          description="Approved moves, Trash actions, and their results will appear here."
        />
      ) : (
        <Panel
          title="Recorded operations"
          subtitle="Showing the most recent 500 matching records. Export includes all records."
        >
          {filtered.map((operation) => (
            <div className="history-item" key={operation.id}>
              <div className="split">
                <strong className="capitalize">
                  {operation.type}{' '}
                  <span className={`badge ${operation.status === 'completed' ? 'green' : ''}`}>
                    {operation.status}
                  </span>
                </strong>
                <small>{date(operation.time)}</small>
              </div>
              <p className="wrap-path">From: {operation.source}</p>
              <p className="wrap-path">To: {operation.destination}</p>
              {operation.error && <p className="error-text">{operation.error}</p>}
              <div className="split">
                <small>
                  {operation.undone
                    ? 'Reversed'
                    : operation.type === 'move' && operation.status === 'completed'
                      ? 'Undo available if unchanged and original path is free'
                      : 'Undo unavailable'}
                </small>
                {operation.type === 'move' &&
                  operation.status === 'completed' &&
                  !operation.undone && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => api('undo', { operationId: operation.id }),
                          'Move undone. Rescan the folder to refresh its index.',
                        )
                      }
                    >
                      <Undo2 size={15} />
                      Undo move
                    </button>
                  )}
              </div>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}
