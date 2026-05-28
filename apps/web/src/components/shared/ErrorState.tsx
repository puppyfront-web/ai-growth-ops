import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ message = '加载失败，请重试', onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
      <h3 className="text-lg font-semibold">出错了</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
          重试
        </button>
      )}
    </div>
  );
}
