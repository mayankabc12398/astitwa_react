// Enterprise DataTable — sticky header, sort, global search, pagination,
// column chooser, CSV export, print, row selection & row click.
import { useState, useMemo } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, Download, Printer, Columns3, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SearchX } from 'lucide-react';
import { SearchBox } from './forms';
import { Dropdown, EmptyState, SkeletonRows } from './primitives';
import { exportCSV } from '../format.js';
import { printTable } from '../pdf.js';

const cellValue = (row, col) =>
  typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor ?? col.key];

export function DataTable({
  columns,
  rows,
  loading = false,
  searchable = true,
  searchPlaceholder = 'Search records…',
  pageSize: initialPageSize = 10,
  onRowClick,
  toolbarLeft,
  toolbarRight,
  exportName = 'export.csv',
  title,
  emptyTitle = 'No records found',
  emptyDesc = 'Try adjusting filters or search keywords.',
  selectable = false,
  selected = [],
  onSelect,
  maxHeight,
  footerSummary,
  // ---- opt-in server mode (payroll screens) ----
  // When serverMode is true the table renders `rows` exactly as given — search,
  // sort and pagination are delegated to the caller via the callbacks below and
  // executed by the API (LIMIT/OFFSET + TotalCount). Every existing consumer
  // omits these props and keeps today's fully client-side behaviour unchanged.
  serverMode = false,
  totalCount = 0,
  page: serverPage = 1,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onSearchChange,
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [hidden, setHidden] = useState(() => new Set(columns.filter((c) => c.hide).map((c) => c.key)));

  const visibleCols = columns.filter((c) => !hidden.has(c.key));

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (serverMode) return rows; // the server already searched, sorted and paged
    let out = rows;
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((r) =>
        columns.some((c) => {
          const v = cellValue(r, c);
          return v != null && String(v).toLowerCase().includes(q);
        })
      );
    }
    if (sort.key) {
      const col = columns.find((c) => c.key === sort.key);
      out = [...out].sort((a, b) => {
        const va = cellValue(a, col);
        const vb = cellValue(b, col);
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
        return String(va).localeCompare(String(vb)) * sort.dir;
      });
    }
    return out;
  }, [rows, query, sort, columns, serverMode]);

  const totalRows = serverMode ? totalCount : filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = serverMode ? Math.min(serverPage, pageCount) : Math.min(page, pageCount);
  const paged = serverMode ? filtered : filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const goToPage = (p) => {
    if (serverMode) onPageChange?.(p);
    else setPage(p);
  };

  const changePageSize = (n) => {
    setPageSize(n);
    if (serverMode) onPageSizeChange?.(n);
    else setPage(1);
  };

  const changeQuery = (v) => {
    setQuery(v);
    if (serverMode) onSearchChange?.(v);
    else setPage(1);
  };

  const toggleSort = (col) => {
    if (col.sortable === false) return;
    setSort((s) => {
      const next = s.key === col.key ? (s.dir === 1 ? { key: col.key, dir: -1 } : { key: null, dir: 1 }) : { key: col.key, dir: 1 };
      if (serverMode) onSortChange?.(next.key, next.dir === 1 ? 'ASC' : 'DESC');
      return next;
    });
  };

  const allChecked = selectable && paged.length > 0 && paged.every((r) => selected.includes(r.id));

  // Print ONLY the table (all filtered rows), not the whole page. Title falls
  // back to a humanised export filename; current search shows as the subtitle.
  const printTitle = title
    || exportName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  const doPrint = () =>
    printTable({
      columns: visibleCols,
      rows: filtered,
      title: printTitle,
      subtitle: query.trim() ? `Filtered by “${query.trim()}”` : '',
    });

  return (
    <div className="table-wrap anim-fade-up">
      <div className="table-toolbar">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          {searchable && (
            <SearchBox value={query} onChange={changeQuery} placeholder={searchPlaceholder} style={{ width: 250 }} />
          )}
          {toolbarLeft}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {toolbarRight}
          <Dropdown
            trigger={<button className="btn btn-outline btn-sm" title="Choose columns"><Columns3 size={14} /> Columns</button>}
            items={columns.map((c) => ({
              label: (
                <span className="flex items-center gap-2">
                  <input type="checkbox" className="checkbox" readOnly checked={!hidden.has(c.key)} />
                  {typeof c.header === 'string' ? c.header : c.key}
                </span>
              ),
              onClick: () =>
                setHidden((h) => {
                  const next = new Set(h);
                  if (next.has(c.key)) next.delete(c.key);
                  else if (next.size < columns.length - 1) next.add(c.key);
                  return next;
                }),
            }))}
          />
          <button className="btn btn-outline btn-sm" onClick={() => exportCSV(filtered, visibleCols.filter((c) => typeof c.header === 'string'), exportName)} title="Export CSV">
            <Download size={14} /> <span className="hide-sm">Export</span>
          </button>
          <button className="btn btn-outline btn-sm btn-icon hide-sm" onClick={doPrint} title="Print">
            <Printer size={14} />
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : paged.length === 0 ? (
        <EmptyState icon={<SearchX size={26} />} title={emptyTitle} desc={emptyDesc} />
      ) : (
        <div className="table-scroller" style={maxHeight ? { '--table-max-h': maxHeight } : undefined}>
          <table className="data-table">
            <thead>
              <tr>
                {selectable && (
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={allChecked}
                      onChange={(e) =>
                        onSelect?.(e.target.checked
                          ? [...new Set([...selected, ...paged.map((r) => r.id)])]
                          : selected.filter((id) => !paged.some((r) => r.id === id)))
                      }
                    />
                  </th>
                )}
                {visibleCols.map((c) => (
                  <th
                    key={c.key}
                    className={c.sortable === false ? '' : 'sortable'}
                    style={{ width: c.width, minWidth: c.minWidth ?? 80, textAlign: c.align }}
                    onClick={() => toggleSort(c)}
                  >
                    <span className="flex items-center gap-1" style={{ justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start' }}>
                      {c.header}
                      {c.sortable !== false && (
                        sort.key === c.key
                          ? sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                          : <ArrowUpDown size={12} style={{ opacity: 0.35 }} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* row animation fills "backwards" (not "both") — a retained end-state
                  transform would make every row a stacking context, so later rows
                  would paint over an open action dropdown from a row above */}
              {paged.map((row, ri) => (
                <tr
                  key={row.id ?? ri}
                  className={onRowClick ? 'row-click' : ''}
                  onClick={() => onRowClick?.(row)}
                  style={{ animation: `nhr-fadeUp var(--dur) var(--ease) backwards`, animationDelay: `${Math.min(ri * 24, 240)}ms` }}
                >
                  {selectable && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={(e) =>
                          onSelect?.(e.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))
                        }
                      />
                    </td>
                  )}
                  {visibleCols.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align, whiteSpace: c.nowrap ? 'nowrap' : undefined }}>
                      {c.render ? c.render(row) : (cellValue(row, c) ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-footer">
        <div className="t-sm ink-3">
          {footerSummary ?? (
            <>Showing <b className="ink-2">{totalRows === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, totalRows)}</b> of <b className="ink-2">{totalRows}</b></>
          )}
        </div>
        <div className="table-footer-nav">
          <select className="select dt-pagesize" aria-label="Rows per page" value={pageSize} onChange={(e) => changePageSize(+e.target.value)}>
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <div className="pager">
            <button disabled={safePage === 1} onClick={() => goToPage(1)}><ChevronsLeft size={14} /></button>
            <button disabled={safePage === 1} onClick={() => goToPage(safePage - 1)}><ChevronLeft size={14} /></button>
            {Array.from({ length: pageCount }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pageCount || Math.abs(p - safePage) <= 1)
              .reduce((acc, p, i, arr) => {
                if (i > 0 && p - arr[i - 1] > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '…' ? <span key={`e${i}`} className="t-sm ink-3" style={{ padding: '0 4px' }}>…</span> : (
                  <button key={p} className={p === safePage ? 'active' : ''} onClick={() => goToPage(p)}>{p}</button>
                )
              )}
            <button disabled={safePage === pageCount} onClick={() => goToPage(safePage + 1)}><ChevronRight size={14} /></button>
            <button disabled={safePage === pageCount} onClick={() => goToPage(pageCount)}><ChevronsRight size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
