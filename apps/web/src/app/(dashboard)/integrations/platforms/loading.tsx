import { DataTableSkeleton } from '@/components/shared/DataTableSkeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      <DataTableSkeleton columns={5} rows={8} />
    </div>
  );
}
