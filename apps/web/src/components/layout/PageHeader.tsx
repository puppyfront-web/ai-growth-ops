import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** 工具栏内容（筛选器、视图切换等），渲染在标题行下方 */
  toolbar?: React.ReactNode;
  /**
   * dense：列表页紧凑形态（小标题、无下边距，由外层控制间距）
   * default：常规页面标题
   */
  density?: 'default' | 'dense';
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  toolbar,
  density = 'default',
  className
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6', density === 'dense' && 'mb-4', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1
            className={cn(
              'font-bold tracking-tight',
              density === 'dense' ? 'text-xl' : 'text-2xl'
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {toolbar && <div className="mt-4">{toolbar}</div>}
    </div>
  );
}
