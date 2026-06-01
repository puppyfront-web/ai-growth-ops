'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Command } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { navItems } from '@/components/layout/navigation';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const visibleItems = navItems.filter((item) => !item.hidden);
  const filtered = query
    ? visibleItems.filter(
        (item) =>
          item.label.includes(query) ||
          item.href.toLowerCase().includes(query.toLowerCase()),
      )
    : visibleItems;

  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery('');
      router.push(href);
    },
    [router],
  );

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>全局搜索...</span>
        <kbd className="ml-4 hidden rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground sm:inline-block">
          <Command className="inline h-3 w-3" />K
        </kbd>
      </button>

      {/* Command palette dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 overflow-hidden max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>全局搜索</DialogTitle>
          </DialogHeader>
          <div className="border-b px-3">
            <Input
              placeholder="搜索页面..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-0 focus-visible:ring-0 h-11"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-2">
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">未找到匹配结果</p>
            )}
            {filtered.map((item) => (
              <button
                key={item.href}
                className="flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-accent transition-colors"
                onClick={() => handleSelect(item.href)}
              >
                <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{item.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{item.href}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
