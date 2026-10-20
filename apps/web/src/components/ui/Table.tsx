import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { PageLoading } from './Spinner';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  /** esconde em telas pequenas */
  hideOnMobile?: boolean;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  dense?: boolean;
}

export function Table<T>({ columns, rows, rowKey, loading, emptyTitle, emptyDescription, emptyAction, onRowClick, dense }: TableProps<T>) {
  if (loading && !rows) return <PageLoading />;
  if (!rows || rows.length === 0) return <EmptyState title={emptyTitle ?? '-'} description={emptyDescription} action={emptyAction} />;
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn('px-4 py-2 font-medium', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn('bg-white transition-colors', onRowClick && 'cursor-pointer hover:bg-slate-50')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn(dense ? 'px-4 py-1.5' : 'px-4 py-2.5', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
