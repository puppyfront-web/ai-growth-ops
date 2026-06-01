'use client';

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { DataTableSkeleton } from './DataTableSkeleton';
import { cn } from '@/lib/utils';

// Extend TanStack Table ColumnMeta for custom className support
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    headerClassName?: string;
    cellClassName?: string;
  }
}

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  /** @deprecated Use isLoading instead */
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRetry?: () => void;
  searchable?: boolean;
  toolbar?: React.ReactNode;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  };
  className?: string;
};

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  loading,
  error,
  emptyTitle = '暂无数据',
  emptyDescription,
  emptyAction,
  onRetry,
  toolbar,
  pagination: _pagination,
  className,
}: DataTableProps<TData, TValue>) {
  const showLoading = isLoading ?? loading;
  // pagination will be used when server-side pagination is wired in M2+
  void _pagination;
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (showLoading) {
    return (
      <div className={className}>
        {toolbar}
        <DataTableSkeleton columns={columns.length} rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        {toolbar}
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={className}>
        {toolbar}
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  return (
    <div className={className}>
      {toolbar}
      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-4 py-3 text-left text-sm font-medium text-muted-foreground',
                      header.column.columnDef.meta?.headerClassName as string | undefined,
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      'px-4 py-3 text-sm',
                      cell.column.columnDef.meta?.cellClassName as string | undefined,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
