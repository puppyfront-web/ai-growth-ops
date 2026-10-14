'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Command, CornerDownLeft, Target, Users, FileText, UserCheck, type LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { navItems } from '@/components/layout/navigation';
import { listCustomers } from '@/lib/api/customers';
import { listLeads } from '@/lib/api/leads';
import { listContentItems } from '@/lib/api/content';
import { listProspectingTasks } from '@/lib/api/prospecting';

type SearchHit = {
  key: string;
  group: string;
  label: string;
  description?: string;
  href: string;
  icon: LucideIcon;
};

/** 服务端没有 q 参数的实体取最近一页做客户端过滤（结果数如实展示） */
const CLIENT_FILTER_PAGE_SIZE = 50;

function match(text: string | null | undefined, q: string): boolean {
  return Boolean(text && text.toLowerCase().includes(q));
}

async function searchEntities(q: string): Promise<SearchHit[]> {
  const [tasksR, leadsR, contentR, customersR] = await Promise.allSettled([
    listProspectingTasks(1, CLIENT_FILTER_PAGE_SIZE),
    listLeads({ pageSize: CLIENT_FILTER_PAGE_SIZE }),
    listContentItems(1, CLIENT_FILTER_PAGE_SIZE),
    listCustomers({ q, pageSize: 5 })
  ]);

  const hits: SearchHit[] = [];

  if (tasksR.status === 'fulfilled') {
    for (const t of tasksR.value.items) {
      const haystack = [t.requirement, ...(t.keywords ?? []), t.id];
      if (haystack.some((s) => match(s, q))) {
        hits.push({
          key: `task-${t.id}`,
          group: '获客任务',
          label: t.requirement?.slice(0, 60) || t.keywords?.join(' · ') || t.id,
          description: `获客任务 · ${t.status}`,
          href: `/prospecting/${t.id}`,
          icon: Target
        });
      }
    }
  }

  if (leadsR.status === 'fulfilled') {
    for (const l of leadsR.value.items) {
      if (match(l.externalUserName, q) || match(l.summary, q) || match(l.intent, q)) {
        hits.push({
          key: `lead-${l.id}`,
          group: '线索',
          label: l.externalUserName || l.externalUserId,
          description: l.summary?.slice(0, 60) || `线索 · ${l.level} 级`,
          href: `/leads/${l.id}`,
          icon: Users
        });
      }
    }
  }

  if (contentR.status === 'fulfilled') {
    for (const c of contentR.value.items) {
      if (match(c.title, q)) {
        hits.push({
          key: `content-${c.id}`,
          group: '内容',
          label: c.title,
          description: `内容 · ${c.status}`,
          href: `/content/${c.id}`,
          icon: FileText
        });
      }
    }
  }

  if (customersR.status === 'fulfilled') {
    for (const c of customersR.value.items) {
      hits.push({
        key: `customer-${c.id}`,
        group: '客户',
        label: c.displayName,
        description: [c.company, c.role].filter(Boolean).join(' · ') || '客户',
        href: `/customers/${c.id}`,
        icon: UserCheck
      });
    }
  }

  return hits;
}

const GROUP_ORDER = ['页面', '获客任务', '线索', '内容', '客户'];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [rawQuery, setRawQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(rawQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [rawQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debounced]);

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

  const enabled = open && debounced.length >= 2;
  const { data: entityHits = [], isFetching } = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => searchEntities(debounced.toLowerCase()),
    enabled,
    staleTime: 30_000
  });

  const navHits = useMemo<SearchHit[]>(() => {
    const q = debounced.toLowerCase();
    const base = navItems
      .filter((item) => !item.hidden)
      .map<SearchHit>((item) => ({
        key: `nav-${item.href}`,
        group: '页面',
        label: item.label,
        description: item.href,
        href: item.href,
        icon: item.icon
      }));
    if (!q) return base;
    return base.filter(
      (item) => item.label.toLowerCase().includes(q) || match(item.description, q)
    );
  }, [debounced]);

  const hits = useMemo(
    () =>
      [...navHits, ...entityHits].sort(
        (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
      ),
    [navHits, entityHits]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const list = map.get(hit.group) ?? [];
      list.push(hit);
      map.set(hit.group, list);
    }
    return [...map.entries()];
  }, [hits]);

  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false);
      setRawQuery('');
      setDebounced('');
      router.push(href);
    },
    [router]
  );

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && hits[activeIndex]) {
      e.preventDefault();
      handleSelect(hits[activeIndex].href);
    }
  };

  let flatIndex = -1;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="打开全局搜索"
        className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        <Search className="h-4 w-4" />
        <span>搜索任务、客户、内容…</span>
        <kbd className="ml-4 hidden rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground sm:inline-block">
          <Command className="inline h-3 w-3" />K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>全局搜索</DialogTitle>
          </DialogHeader>
          <div className="border-b px-3">
            <Input
              placeholder="搜索任务、线索、内容、客户或页面（≥2 个字符）…"
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              className="h-11 border-0 focus-visible:ring-0"
              role="searchbox"
              aria-label="搜索关键词"
            />
          </div>
          <div className="max-h-80 overflow-y-auto py-2" role="listbox">
            {hits.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {debounced.length >= 2
                    ? isFetching
                      ? '搜索中…'
                      : '未找到匹配结果，试试其他关键词'
                    : '输入至少 2 个字符开始搜索'}
                </p>
              </div>
            )}
            {grouped.map(([group, items]) => (
              <div key={group} className="px-2 py-1">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  {group}
                </p>
                {items.map((hit) => {
                  flatIndex += 1;
                  const isActive = flatIndex === activeIndex;
                  return (
                    <button
                      key={hit.key}
                      role="option"
                      aria-selected={isActive}
                      className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                        isActive ? 'bg-accent text-accent-foreground' : ''
                      }`}
                      onMouseEnter={() => setActiveIndex(hits.indexOf(hit))}
                      onClick={() => handleSelect(hit.href)}
                    >
                      <hit.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{hit.label}</span>
                        {hit.description && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {hit.description}
                          </span>
                        )}
                      </span>
                      {isActive && (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
