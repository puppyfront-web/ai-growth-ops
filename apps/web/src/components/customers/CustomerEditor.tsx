'use client';

import type { ReactNode } from 'react';
import type {
  AcquisitionChannel,
  Customer,
  CustomerStatus
} from '@/types/customer';

export const CHANNEL_LABELS: Record<AcquisitionChannel, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat_official: '微信公众号',
  wechat_channels: '视频号',
  baijiahao: '百家号',
  zhihu: '知乎',
  manual: '手动录入',
  import: '批量导入',
  referral: '转介绍',
  exhibition: '展会',
  phone: '电话',
  website: '官网',
  partner: '合作伙伴',
  other: '其他'
};

export const STATUS_LABELS: Record<CustomerStatus, string> = {
  active: '跟进中',
  inactive: '暂停',
  won: '已成交',
  lost: '已流失'
};

export const CUSTOMER_STATUSES: CustomerStatus[] = [
  'active',
  'inactive',
  'won',
  'lost'
];

const UNFILLED = '待补充';

export function isUnfilled(value: string | null | undefined): boolean {
  return !value?.trim() || value.trim() === UNFILLED;
}

export type CustomerFormValues = {
  displayName: string;
  phone: string;
  company: string;
  role: string;
  intent: string;
  channel: AcquisitionChannel;
  sourceNote: string;
  status: CustomerStatus;
  assignedTo: string;
};

export const emptyCustomerForm = (
  channel: AcquisitionChannel = 'manual'
): CustomerFormValues => ({
  displayName: '',
  phone: '',
  company: '',
  role: '',
  intent: '',
  channel,
  sourceNote: '',
  status: 'active',
  assignedTo: ''
});

export function formFromCustomer(customer: Customer): CustomerFormValues {
  return {
    displayName: customer.displayName,
    phone: customer.phone,
    company: isUnfilled(customer.company) ? '' : customer.company,
    role: isUnfilled(customer.role) ? '' : customer.role,
    intent: customer.intent,
    channel: customer.channel,
    sourceNote: customer.sourceNote ?? '',
    status: customer.status,
    assignedTo: customer.assignedTo ?? ''
  };
}

export function CustomerEditor({
  value,
  onChange,
  showStatus = false,
  showAssignee = false,
  assigneeOptions = [],
  idPrefix,
  onPhoneBlur
}: {
  value: CustomerFormValues;
  onChange: (next: CustomerFormValues) => void;
  showStatus?: boolean;
  showAssignee?: boolean;
  assigneeOptions?: { id: string; name: string }[];
  idPrefix: string;
  onPhoneBlur?: () => void;
}) {
  const set = (patch: Partial<CustomerFormValues>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Field label="姓名 *" htmlFor={`${idPrefix}-name`}>
          <input
            id={`${idPrefix}-name`}
            value={value.displayName}
            onChange={(e) => set({ displayName: e.target.value })}
            className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
            placeholder="客户姓名"
          />
        </Field>
        <Field label="手机号" htmlFor={`${idPrefix}-phone`}>
          <input
            id={`${idPrefix}-phone`}
            value={value.phone}
            onChange={(e) => set({ phone: e.target.value })}
            onBlur={onPhoneBlur}
            className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
            placeholder="可稍后补充"
          />
        </Field>
        <Field label="公司" htmlFor={`${idPrefix}-company`}>
          <input
            id={`${idPrefix}-company`}
            value={value.company}
            onChange={(e) => set({ company: e.target.value })}
            className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
            placeholder="待补充"
          />
        </Field>
        <Field label="职位" htmlFor={`${idPrefix}-role`}>
          <input
            id={`${idPrefix}-role`}
            value={value.role}
            onChange={(e) => set({ role: e.target.value })}
            className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
            placeholder="待补充"
          />
        </Field>
        <Field label="来源渠道" htmlFor={`${idPrefix}-channel`}>
          <select
            id={`${idPrefix}-channel`}
            value={value.channel}
            onChange={(e) =>
              set({ channel: e.target.value as AcquisitionChannel })
            }
            className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
          >
            {Object.entries(CHANNEL_LABELS).map(([channel, label]) => (
              <option key={channel} value={channel}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {showStatus ? (
          <Field label="跟进状态" htmlFor={`${idPrefix}-status`}>
            <select
              id={`${idPrefix}-status`}
              value={value.status}
              onChange={(e) =>
                set({ status: e.target.value as CustomerStatus })
              }
              className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
            >
              {CUSTOMER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="来源说明" htmlFor={`${idPrefix}-source-note`}>
            <input
              id={`${idPrefix}-source-note`}
              value={value.sourceNote}
              onChange={(e) => set({ sourceNote: e.target.value })}
              className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
              placeholder="如：2026 深圳展会"
            />
          </Field>
        )}
      </div>
      {showStatus && (
        <Field label="来源说明" htmlFor={`${idPrefix}-source-note`}>
          <input
            id={`${idPrefix}-source-note`}
            value={value.sourceNote}
            onChange={(e) => set({ sourceNote: e.target.value })}
            className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
            placeholder="如：关键词获客 / 展会"
          />
        </Field>
      )}
      {showAssignee && (
        <Field label="负责人" htmlFor={`${idPrefix}-assignee`}>
          <select
            id={`${idPrefix}-assignee`}
            value={value.assignedTo}
            onChange={(e) => set({ assignedTo: e.target.value })}
            className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm md:max-w-xs"
          >
            <option value="">未分配</option>
            {assigneeOptions.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="需求 *" htmlFor={`${idPrefix}-intent`}>
        <textarea
          id={`${idPrefix}-intent`}
          value={value.intent}
          onChange={(e) => set({ intent: e.target.value })}
          rows={2}
          className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
          placeholder="客户当前需求或意向"
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
