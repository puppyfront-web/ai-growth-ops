import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

export default function MediaGenerationPage() {
  return (
    <div>
      <Breadcrumb />
      <PageHeader title="AI 素材生成" />
      <div className="max-w-2xl rounded-xl border bg-card p-8 text-center">
        <div className="text-4xl mb-4">🎨</div>
        <h2 className="text-xl font-semibold mb-2">当前版本暂不支持真实 AI 生图/生视频</h2>
        <p className="text-sm text-muted-foreground mb-4">后续可通过 MediaGenerationProvider 接入第三方生成服务。</p>
        <p className="text-sm text-muted-foreground">生成素材必须先进入素材库，并经过人工审核后才能发布。</p>
        <button disabled className="mt-6 rounded-md bg-muted px-6 py-2 text-sm text-muted-foreground cursor-not-allowed">功能即将上线</button>
      </div>
    </div>
  );
}
