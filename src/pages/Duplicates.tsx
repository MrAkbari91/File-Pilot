import { useState } from 'react';
import { Copy, Download, FolderOpen, Trash2 } from 'lucide-react';
import type { DuplicateGroup, DuplicateResult } from '../../shared/contracts';
import { api, bytes } from '../api';
import { useApp } from '../context';
import { Empty, PageHeading, Panel, RootSelect, SafetyNote, Thumbnail } from '../components/ui';
function Group({ group, refresh }: { group: DuplicateGroup; refresh: () => void }) {
  const { busy, run } = useApp();
  const [selected, setSelected] = useState<string[]>([]);
  const exact = group.kind === 'exact';
  return (
    <Panel
      title={`${group.files.length} ${group.kind === 'name' ? 'name matches' : group.kind === 'similar' ? 'similar images' : 'matching files'}`}
      subtitle={`${group.kind === 'exact' ? 'SHA-256 verified content' : group.kind === 'pixels' ? 'Identical decoded pixels · first frame' : group.kind === 'name' ? 'Names match; content may differ' : `${group.similarity}% hash similarity · inspect visually`}${group.reclaimable ? ` · up to ${bytes(group.reclaimable)} estimated` : ''}`}
      action={
        exact && (
          <button
            className="danger"
            disabled={busy || !selected.length || selected.length >= group.files.length}
            onClick={() =>
              void run(() => api('trash', { groupId: group.id, fileIds: selected })).then(
                (value) => {
                  if (value) refresh();
                },
              )
            }
          >
            <Trash2 size={15} />
            Trash selected
          </button>
        )
      }
    >
      <div className="duplicate-files">
        {group.files.map((file) => (
          <div
            className={`duplicate-file ${selected.includes(file.id) ? 'selected' : ''}`}
            key={file.id}
          >
            {file.category === 'Images' && <Thumbnail file={file} />}
            <div className="duplicate-detail">
              <label className="check">
                {exact && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${file.name}`}
                    checked={selected.includes(file.id)}
                    disabled={
                      !selected.includes(file.id) && selected.length >= group.files.length - 1
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, file.id]
                          : selected.filter((id) => id !== file.id),
                      )
                    }
                  />
                )}
                <strong>{file.name}</strong>
              </label>
              <p className="wrap-path">{file.path}</p>
              <div className="split">
                <span className="muted">
                  {bytes(file.size)} · {file.extension.toUpperCase() || 'FILE'}
                </span>
                <button
                  className="icon-button"
                  title="Show in folder"
                  onClick={() => void run(() => api('openFile', { fileId: file.id, reveal: true }))}
                >
                  <FolderOpen size={17} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="table-footer">
        {exact
          ? 'Choose the copies to remove. At least one copy must remain; its content is checked again before Trash.'
          : 'Review candidates side by side. Automatic removal is unavailable for this match type.'}
      </div>
    </Panel>
  );
}
export function Duplicates() {
  const { snapshot, busy, run } = useApp();
  const [mode, setMode] = useState<'exact' | 'name' | 'images'>('exact');
  const [rootId, setRootId] = useState('');
  const [result, setResult] = useState<DuplicateResult | null>(null);
  const [limit, setLimit] = useState(20);
  return (
    <>
      <PageHeading
        eyebrow="DUPLICATE CENTER"
        title="Find the copies. Keep the memories."
        description="Compare what’s inside your files, with the final decision always yours."
        action={
          <button
            disabled={!result?.groups.length || busy}
            onClick={() => void run(() => api('exportData', { kind: 'duplicates' }))}
          >
            <Download size={17} />
            Export results
          </button>
        }
      />
      <Panel>
        <div className="comparison-tabs">
          {[
            { id: 'exact', title: 'Exact content', text: 'Same bytes, different names' },
            { id: 'name', title: 'Same filename', text: 'Name matches, not verified copies' },
            { id: 'images', title: 'Similar images', text: 'Pixels and perceptual similarity' },
          ].map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? 'active' : ''}
              onClick={() => {
                setMode(item.id as typeof mode);
                setResult(null);
              }}
            >
              <Copy size={20} />
              <span>
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="form-footer">
          <RootSelect
            roots={snapshot?.roots ?? []}
            value={rootId}
            all
            onChange={(value) => {
              setRootId(value);
              setResult(null);
            }}
          />
          <button
            className="primary"
            disabled={busy || !snapshot?.fileCount}
            onClick={() =>
              void run(() =>
                api('duplicates', {
                  mode,
                  rootId,
                  threshold: snapshot?.settings.similarityThreshold ?? 6,
                }),
              ).then((value) => {
                if (value) {
                  setResult(value);
                  setLimit(20);
                }
              })
            }
          >
            Find matches
          </button>
        </div>
      </Panel>
      {result?.cancelled ? (
        <Empty
          title="Comparison cancelled"
          description="Partial matches were discarded. Run a new comparison when ready."
        />
      ) : result?.groups.length ? (
        <>
          <div className="section-caption">
            {result.groups.length} groups found · No files selected for removal
          </div>
          {result.groups.slice(0, limit).map((group) => (
            <Group key={group.id} group={group} refresh={() => setResult(null)} />
          ))}
          {result.groups.length > limit && (
            <button onClick={() => setLimit(limit + 20)}>Show 20 more groups</button>
          )}
        </>
      ) : (
        <Empty
          title={result ? 'No matches found' : 'More space starts with a closer look'}
          description={
            result
              ? 'No matches were found in the selected indexed files for this comparison mode.'
              : 'Scan a folder, choose how to compare, and review the results here.'
          }
        />
      )}
      {!!result?.errors.length && (
        <details className="panel warning">
          <summary>{result.errors.length} files could not be compared</summary>
          {result.errors.map((error, index) => (
            <p key={index}>{error}</p>
          ))}
        </details>
      )}
      <SafetyNote>
        Perceptual matches are suggestions, not proof. PNG-to-JPEG conversions usually change
        pixels. Animated images use their first frame. Image decoding is limited to 25 megapixels.
      </SafetyNote>
    </>
  );
}
