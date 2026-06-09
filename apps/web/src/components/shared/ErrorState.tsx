import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  message = '加载失败，请重试',
  onRetry,
  className
}: ErrorStateProps) {
  return (
    <Alert variant="destructive" className={cn('max-w-lg mx-auto', className)}>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{message}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            重试
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
