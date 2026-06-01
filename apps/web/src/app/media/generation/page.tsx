'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Image, Video, FileText, Sparkles, AlertCircle } from 'lucide-react';

const generationTypes = [
  { key: 'image', label: '图片生成', icon: Image, desc: '根据描述生成营销配图、封面图等' },
  { key: 'cover', label: '视频封面', icon: Video, desc: '为视频内容自动生成吸引人的封面' },
  { key: 'copywrite', label: '文案配图', icon: FileText, desc: '为文章/图文内容生成配套插图' },
];

export default function MediaGenerationPage() {
  const [prompt, setPrompt] = useState('');
  const [genType, setGenType] = useState('image');
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div>
      <Breadcrumb />
      <PageHeader title="AI 素材生成" />

      <div className="max-w-2xl space-y-6">
        {/* Notice */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-500" />
            <div>
              <h3 className="text-sm font-medium text-amber-800">功能预告</h3>
              <p className="mt-1 text-sm text-amber-700">AI 素材生成功能正在开发中，将通过 MediaGenerationProvider 接入第三方服务。生成的素材将进入素材库，需经人工审核后才可用于发布。</p>
            </div>
          </CardContent>
        </Card>

        {/* Generation types */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {generationTypes.map((gt) => (
            <button
              key={gt.key}
              onClick={() => setGenType(gt.key)}
              className={`rounded-lg border p-4 text-left transition-colors ${genType === gt.key ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'}`}
            >
              <gt.icon className={`h-6 w-6 mb-2 ${genType === gt.key ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="text-sm font-medium">{gt.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{gt.desc}</div>
            </button>
          ))}
        </div>

        {/* Input form */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <CardTitle className="text-base font-semibold">描述你想要生成的素材</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="例如：为一条关于夏季护肤的抖音视频生成封面，风格清新自然，包含防晒霜产品特写..."
              className="w-full rounded-md border p-2 text-sm resize-none"
            />
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">风格</label>
              <select className="rounded-md border p-1.5 text-sm">
                <option>自然清新</option>
                <option>商务专业</option>
                <option>潮流时尚</option>
                <option>简约文艺</option>
              </select>
            </div>
            <Button onClick={() => setConfirmOpen(true)} disabled={!prompt.trim()}>
              <Sparkles className="mr-1 h-4 w-4" />生成素材
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>功能即将上线</DialogTitle></DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">AI 素材生成功能正在开发中，请期待后续版本更新。</p>
          <DialogFooter><Button size="sm" variant="outline" onClick={() => setConfirmOpen(false)}>知道了</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
