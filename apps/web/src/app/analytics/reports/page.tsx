import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function ReportsPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="运营报告" description="生成和管理运营报告" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {['日报', '周报', '月报', '内容复盘报告', '线索复盘报告', '平台复盘报告'].map((type) => (
          <div key={type} className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">{type}</h3>
            <p className="mt-1 text-sm text-muted-foreground">AI 生成{type}，支持编辑后导出</p>
            <button className="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">生成{type}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
