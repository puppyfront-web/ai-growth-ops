'use client';

import * as React from 'react';
import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type RowData,
  type SortingState,
  type RowSelectionState,
  type OnChangeFn
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { DataTableSkeleton } from './DataTableSkeleton';
import { DataTablePagination } from './DataTablePagination';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// Extend TanStack Table ColumnMeta for custom className support
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    headerClassName?: string;
    cellClassName?: string;
  }
}

type DataTablePagination = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

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
  toolbar?: React.ReactNode;
  /** 行稳定性键，行选择必传；缺省回落到 row.id */
  getRowId?: (row: TData) => string;
  /** 开启行选择（首列插入复选框） */
  enableSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  /** 服务端分页；传入即在表尾渲染分页器 */
  pagination?: DataTablePagination;
  className?: string;
};

export function DataTable<TData extends object, TValue>({
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
  getRowId,
  enableSelection = false,
  rowSelection: controlledSelection,
  onRowSelectionChange,
  pagination,
  className
}: DataTableProps<TData, TValue>) {
  const showLoading = isLoading ?? loading;
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>(
    {}
  );

  const tableColumns = React.useMemo(() => {
    if (!enableSelection) return columns;
    const selectColumn: ColumnDef<TData, unknown> = {
      id: '__select__',
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="全选本页"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label="选择此行"
        />
      ),
      meta: { headerClassName: 'w-10', cellClassName: 'w-10' }
    };
    return [selectColumn, ...columns];
  }, [columns, enableSelection]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    getRowId: getRowId
      ? getRowId
      : (row, index) => String((row as { id?: unknown }).id ?? index),
    state: {
      sorting: internalSorting,
      rowSelection: controlledSelection ?? internalSelection
    },
    onSortingChange: setInternalSorting,
    onRowSelectionChange:
      onRowSelectionChange ?? setInternalSelection,
    enableRowSelection: enableSelection,
    manualPagination: Boolean(pagination),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  if (showLoading) {
    return (
      <div className={className}>
        {toolbar}
        <DataTableSkeleton columns={tableColumns.length} rows={5} />
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
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {toolbar}
      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b bg-muted/50">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          'whitespace-nowrap px-4 py-3 text-left text-sm font-medium text-muted-foreground',
                          header.column.columnDef.meta?.headerClassName as
                            | string
                            | undefined
                        )}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                            aria-label={`按${String(
                              typeof header.column.columnDef.header ===
                                'string'
                                ? header.column.columnDef.header
                                : header.column.id
                            )}排序`}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {sorted === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <ArrowUpDown
                                className="h-3.5 w-3.5 opacity-40"
                                aria-hidden
                              />
                            )}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className="border-b last:border-0 transition-colors hover:bg-muted/30 data-[state=selected]:bg-muted/40"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-4 py-3 align-middle',
                        cell.column.columnDef.meta?.cellClassName as
                          | string
                          | undefined
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {pagination && (
        <DataTablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
        />
      )}
    </div>
  );
}
