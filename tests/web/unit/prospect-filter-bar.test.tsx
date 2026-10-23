import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  ProspectFilterBar,
  type ProspectFilters
} from '@/components/prospecting/ProspectFilterBar';

const emptyFilters: ProspectFilters = {
  q: '',
  minScore: 0,
  leadLevel: '',
  converted: ''
};

function setup(filters: ProspectFilters = emptyFilters) {
  const onChange = vi.fn();
  render(<ProspectFilterBar filters={filters} onChange={onChange} />);
  return { onChange };
}

describe('ProspectFilterBar', () => {
  it('无激活筛选时不显示重置按钮', () => {
    setup();
    expect(screen.queryByRole('button', { name: '重置筛选' })).toBeNull();
  });

  it('输入关键词触发 onChange 并保持其他筛选', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('关键词'), {
      target: { value: '私域' }
    });
    expect(onChange).toHaveBeenCalledWith({
      ...emptyFilters,
      q: '私域'
    });
  });

  it('修改最低相关度触发 onChange', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('最低相关度'), {
      target: { value: '60' }
    });
    expect(onChange).toHaveBeenCalledWith({
      ...emptyFilters,
      minScore: 60
    });
  });

  it('选择意向等级触发 onChange', async () => {
    const { onChange } = setup();
    await userEvent.selectOptions(screen.getByLabelText('意向等级'), 'A');
    expect(onChange).toHaveBeenLastCalledWith({
      ...emptyFilters,
      leadLevel: 'A'
    });
  });

  it('选择转化状态触发 onChange', async () => {
    const { onChange } = setup();
    await userEvent.selectOptions(screen.getByLabelText('转化状态'), 'yes');
    expect(onChange).toHaveBeenLastCalledWith({
      ...emptyFilters,
      converted: 'yes'
    });
  });

  it('有激活筛选时点击重置回调空筛选', async () => {
    const { onChange } = setup({
      q: '私域',
      minScore: 60,
      leadLevel: 'A',
      converted: 'no'
    });
    const reset = screen.getByRole('button', { name: '重置筛选' });
    await userEvent.click(reset);
    expect(onChange).toHaveBeenCalledWith(emptyFilters);
  });

  it('未传 onSortChange 时不渲染排序下拉（兼容旧调用方）', () => {
    setup();
    expect(screen.queryByLabelText('排序')).toBeNull();
  });

  it('切换排序回调 onSortChange', async () => {
    const onSortChange = vi.fn();
    render(
      <ProspectFilterBar
        filters={emptyFilters}
        onChange={vi.fn()}
        sort="relevance"
        onSortChange={onSortChange}
      />
    );
    await userEvent.selectOptions(screen.getByLabelText('排序'), 'latest');
    expect(onSortChange).toHaveBeenCalledWith('latest');
  });
});
