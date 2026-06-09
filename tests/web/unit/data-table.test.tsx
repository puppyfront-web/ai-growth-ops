import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from '@/components/shared/DataTable';
import type { ColumnDef } from '@tanstack/react-table';

interface TestRow {
  id: string;
  name: string;
  status: string;
}

const columns: ColumnDef<TestRow>[] = [
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'status', header: '状态' }
];

const sampleData: TestRow[] = [
  { id: '1', name: '测试内容', status: 'PUBLISHED' },
  { id: '2', name: '草稿内容', status: 'DRAFT' }
];

describe('DataTable', () => {
  it('renders table headers and data rows', () => {
    render(<DataTable columns={columns} data={sampleData} />);
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('状态')).toBeInTheDocument();
    expect(screen.getByText('测试内容')).toBeInTheDocument();
    expect(screen.getByText('PUBLISHED')).toBeInTheDocument();
    expect(screen.getByText('草稿内容')).toBeInTheDocument();
  });

  it('shows empty state when data is empty', () => {
    render(<DataTable columns={columns} data={[]} emptyTitle="暂无数据" />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
    expect(screen.queryByText('名称')).not.toBeInTheDocument();
  });

  it('shows skeleton loading state', () => {
    const { container } = render(
      <DataTable columns={columns} data={[]} isLoading />
    );
    // Skeleton renders divs with animate-pulse
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state', () => {
    render(<DataTable columns={columns} data={[]} error="加载失败" />);
    expect(screen.getByText(/加载失败/)).toBeInTheDocument();
  });

  it('accepts legacy loading prop', () => {
    const { container } = render(
      <DataTable columns={columns} data={[]} loading />
    );
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
