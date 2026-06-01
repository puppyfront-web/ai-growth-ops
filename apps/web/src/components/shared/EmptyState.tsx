import { FileQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

type EmptyStateAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: EmptyStateAction | React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title = '暂无数据', description, action, icon, className }: EmptyStateProps) {
  const actionNode = action && typeof action === 'object' && 'label' in action ? (
    <Button asChild={!!action.href}>
      {action.href ? <Link href={action.href}>{action.label}</Link> : <button onClick={action.onClick}>{action.label}</button>}
    </Button>
  ) : action;

  return (
    <Card className={cn('border-dashed', className)}>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 text-muted-foreground">
          {icon ?? <FileQuestion className="h-12 w-12" />}
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
        {actionNode && <div className="mt-4">{actionNode}</div>}
      </CardContent>
    </Card>
  );
}
