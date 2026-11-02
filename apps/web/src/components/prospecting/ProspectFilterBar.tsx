'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type {
  ProspectCandidateFilters,
  ProspectSort
} from '@/lib/api/prospecting';

export const emptyProspectFilters: ProspectCandidateFilters = {
  q: '',
  minScore: 0,
  leadLevel: '',
  personaTag: '',
  converted: '',
  dateRange: ''
};

export function hasActiveProspectFilters(
  filters: ProspectCandidateFilters
): boolean {
  return (
    filters.q !== '' ||
    filters.minScore > 0 ||
    filters.leadLevel !== '' ||
    filters.personaTag !== '' ||
    filters.converted !== '' ||
    filters.dateRange !== ''
  );
}

const personaOptions: Array<{
  value: ProspectCandidateFilters['personaTag'];
  label: string;
}> = [
  { value: '', label: '全部' },
  { value: 'demand_seeker', label: '需求方' },
  { value: 'peer_vendor', label: '同行/服务商' },
  { value: 'already_adopted', label: '已落地' },
  { value: 'practitioner', label: '从业者' },
  { value: 'job_seeker', label: '求职者' },
  { value: 'irrelevant', label: '无关' }
];

const dateRangeOptions: Array<{
  value: ProspectCandidateFilters['dateRange'];
  label: string;
}> = [
  { value: '', label: '全部' },
  { value: 'today', label: '今天' },
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' }
];

type ProspectFilterBarProps = {
  filters: ProspectCandidateFilters;
  onChange: (filters: ProspectCandidateFilters) => void;
  sort?: ProspectSort;
  onSortChange?: (sort: ProspectSort) => void;
};

export function ProspectFilterBar({
  filters,
  onChange,
  sort = 'latest',
  onSortChange
}: ProspectFilterBarProps) {
  const update = (patch: Partial<ProspectCandidateFilters>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap gap-3 items-center text-sm">
      <div className="flex items-center gap-2">
        <label htmlFor="prospect-q" className="text-muted-foreground text-xs">
          关键词
        </label>
        <Input
          id="prospect-q"
          type="search"
          value={filters.q}
          placeholder="搜索昵称 / 抖音号 / 评论内容"
          onChange={(e) => update({ q: e.target.value })}
          className="h-8 w-52 text-xs"
        />
      </div>
      <div className="flex items-center gap-2">
        <label
          htmlFor="score-filter"
          className="text-muted-foreground text-xs"
        >
          最低相关度
        </label>
        <input
          id="score-filter"
          type="number"
          min={0}
          max={100}
          value={filters.minScore}
          onChange={(e) => update({ minScore: Number(e.target.value) })}
          className="w-16 rounded border bg-background px-2 py-1 text-xs"
        />
      </div>
      <div className="flex items-center gap-2">
        <label
          htmlFor="lead-level-filter"
          className="text-muted-foreground text-xs"
        >
          意向等级
        </label>
        <NativeSelect
          id="lead-level-filter"
          value={filters.leadLevel}
          onChange={(e) =>
            update({
              leadLevel: e.target.value as ProspectCandidateFilters['leadLevel']
            })
          }
          className="h-8 w-28 text-xs"
        >
          <option value="">全部</option>
          <option value="A">高意向 A</option>
          <option value="B">中意向 B</option>
          <option value="C">低意向 C</option>
          <option value="D">无效 D</option>
        </NativeSelect>
      </div>
      <div className="flex items-center gap-2">
        <label
          htmlFor="persona-filter"
          className="text-muted-foreground text-xs"
        >
          画像
        </label>
        <NativeSelect
          id="persona-filter"
          value={filters.personaTag}
          onChange={(e) =>
            update({
              personaTag: e.target
                .value as ProspectCandidateFilters['personaTag']
            })
          }
          className="h-8 w-28 text-xs"
        >
          {personaOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex items-center gap-2">
        <label
          htmlFor="converted-filter"
          className="text-muted-foreground text-xs"
        >
          转化状态
        </label>
        <NativeSelect
          id="converted-filter"
          value={filters.converted}
          onChange={(e) =>
            update({
              converted: e.target
                .value as ProspectCandidateFilters['converted']
            })
          }
          className="h-8 w-28 text-xs"
        >
          <option value="">全部</option>
          <option value="no">未转化</option>
          <option value="yes">已转客户</option>
        </NativeSelect>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">采集时间</span>
        <div
          role="group"
          aria-label="采集时间"
          className="flex overflow-hidden rounded-md border"
        >
          {dateRangeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => update({ dateRange: option.value })}
              className={`px-2.5 py-1 text-xs transition-colors ${
                filters.dateRange === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {onSortChange && (
        <div className="flex items-center gap-2">
          <label
            htmlFor="prospect-sort"
            className="text-muted-foreground text-xs"
          >
            排序
          </label>
          <NativeSelect
            id="prospect-sort"
            value={sort}
            onChange={(e) =>
              onSortChange(e.target.value as ProspectSort)
            }
            className="h-8 w-28 text-xs"
          >
            <option value="latest">最新优先</option>
            <option value="relevance">相关度优先</option>
          </NativeSelect>
        </div>
      )}
      {hasActiveProspectFilters(filters) && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onChange(emptyProspectFilters)}
        >
          重置筛选
        </Button>
      )}
    </div>
  );
}
