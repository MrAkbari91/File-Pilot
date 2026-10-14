import { useEffect, useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { categories, type FileEntry, type SearchInput } from '../../shared/contracts';
import { api } from '../api';
import { useApp } from '../context';
import { PageHeading, Panel, RootSelect, FileTable } from '../components/ui';
export function Search({ initial }: { initial?: SearchInput }) {
  const { snapshot } = useApp();
  const [filters, setFilters] = useState<SearchInput>(initial ?? {});
  const [result, setResult] = useState<{ files: FileEntry[]; total: number }>({
    files: [],
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setLoading(true);
      api('search', filters)
        .then((value) => {
          if (current) {
            setResult(value);
            setError('');
          }
        })
        .catch((error) => {
          if (current) setError(String(error));
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 220);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [filters, snapshot]);
  const update = (next: Partial<SearchInput>) => setFilters({ ...filters, ...next, page: 0 });
  return (
    <>
      <PageHeading
        eyebrow="UNIFIED SEARCH"
        title="Less looking. More finding."
        description="Search the files you’ve indexed, wherever they live."
      />
      <Panel>
        <div className="large-search">
          <SearchIcon size={22} />
          <input
            autoFocus
            aria-label="Search filenames or paths"
            placeholder="Search by filename or path…"
            value={filters.query ?? ''}
            onChange={(e) => update({ query: e.target.value })}
          />
          <kbd>⌘ / Ctrl K</kbd>
        </div>
        <div className="search-filters">
          <RootSelect
            roots={snapshot?.roots ?? []}
            value={filters.rootId ?? ''}
            all
            onChange={(rootId) => update({ rootId })}
          />
          <label className="field">
            Category
            <select
              value={filters.category ?? ''}
              onChange={(e) => update({ category: e.target.value })}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Extension
            <input
              placeholder="e.g. pdf"
              value={filters.extension ?? ''}
              onChange={(e) => update({ extension: e.target.value })}
            />
          </label>
          <label className="field">
            Minimum size (MB)
            <input
              type="number"
              min="0"
              value={(filters.minSize ?? 0) / 1024 ** 2 || ''}
              onChange={(e) => update({ minSize: Math.max(0, Number(e.target.value)) * 1024 ** 2 })}
            />
          </label>
          <label className="field">
            Maximum size (MB)
            <input
              type="number"
              min="0"
              value={filters.maxSize === undefined ? '' : filters.maxSize / 1024 ** 2}
              onChange={(e) =>
                update({
                  maxSize: e.target.value
                    ? Math.max(0, Number(e.target.value)) * 1024 ** 2
                    : undefined,
                })
              }
            />
          </label>
          <label className="field">
            Sort by
            <select
              value={filters.sort ?? 'name'}
              onChange={(e) => update({ sort: e.target.value as SearchInput['sort'] })}
            >
              <option value="name">Name</option>
              <option value="size">Largest first</option>
              <option value="modified">Recently modified</option>
            </select>
          </label>
          <label className="field">
            Modified from
            <input
              type="date"
              onChange={(e) =>
                update({
                  modifiedAfter: e.target.value
                    ? new Date(`${e.target.value}T00:00:00`).getTime()
                    : undefined,
                })
              }
            />
          </label>
          <label className="field">
            Modified before
            <input
              type="date"
              onChange={(e) =>
                update({
                  modifiedBefore: e.target.value
                    ? new Date(`${e.target.value}T00:00:00`).getTime()
                    : undefined,
                })
              }
            />
          </label>
        </div>
      </Panel>
      {error && (
        <div role="alert" className="warning">
          {error}
        </div>
      )}
      <Panel title={loading ? 'Searching…' : `${result.total.toLocaleString()} results`}>
        <FileTable files={result.files} total={result.total} />
        <div className="pagination">
          <button
            disabled={!filters.page}
            onClick={() => setFilters({ ...filters, page: (filters.page ?? 0) - 1 })}
          >
            Previous
          </button>
          <span>Page {(filters.page ?? 0) + 1}</span>
          <button
            disabled={((filters.page ?? 0) + 1) * 100 >= result.total}
            onClick={() => setFilters({ ...filters, page: (filters.page ?? 0) + 1 })}
          >
            Next
          </button>
        </div>
      </Panel>
    </>
  );
}
