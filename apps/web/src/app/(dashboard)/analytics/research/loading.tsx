import { LoadingState } from '@/components/shared/LoadingState';

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      <LoadingState rows={5} />
    </div>
  );
}
