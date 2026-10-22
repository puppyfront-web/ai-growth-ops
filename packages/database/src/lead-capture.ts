import {
  defaultNextActionAt,
  isValidPhone,
  normalizePhone
} from '@ai-growth-ops/shared';
import type { DatabaseClient } from './client.js';
import { applyAssignmentRules } from './assignment.js';

export type LeadCaptureField = {
  key: string;
  label: string;
  type: 'text' | 'tel' | 'email' | 'textarea';
  required?: boolean;
};

export async function listLeadCaptureForms(
  db: DatabaseClient,
  organizationId: string
) {
  return db.leadCaptureForm.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getLeadCaptureForm(
  db: DatabaseClient,
  formId: string,
  organizationId: string
) {
  const form = await db.leadCaptureForm.findFirst({
    where: { id: formId, organizationId, deletedAt: null }
  });
  if (!form) throw new Error('表单不存在');
  return form;
}

export async function getPublicLeadCaptureForm(
  db: DatabaseClient,
  slug: string
) {
  const form = await db.leadCaptureForm.findFirst({
    where: { slug, enabled: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      title: true,
      description: true,
      fields: true,
      submitMessage: true
    }
  });
  if (!form) throw new Error('表单不存在或已停用');
  return form;
}

export async function createLeadCaptureForm(
  db: DatabaseClient,
  input: {
    organizationId: string;
    userId: string;
    name: string;
    slug: string;
    title: string;
    description?: string | null;
    fields: LeadCaptureField[];
    enabled?: boolean;
    submitMessage?: string | null;
  }
) {
  if (input.fields.length === 0) throw new Error('表单至少需要一个字段');
  return db.leadCaptureForm.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      fields: input.fields as never,
      enabled: input.enabled ?? true,
      submitMessage: input.submitMessage?.trim() || null
    }
  });
}

export async function updateLeadCaptureForm(
  db: DatabaseClient,
  formId: string,
  organizationId: string,
  input: {
    name?: string;
    title?: string;
    description?: string | null;
    fields?: LeadCaptureField[];
    enabled?: boolean;
    submitMessage?: string | null;
  }
) {
  await getLeadCaptureForm(db, formId, organizationId);
  if (input.fields && input.fields.length === 0) {
    throw new Error('表单至少需要一个字段');
  }
  return db.leadCaptureForm.update({
    where: { id: formId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.description !== undefined && {
        description: input.description?.trim() || null
      }),
      ...(input.fields !== undefined && { fields: input.fields as never }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.submitMessage !== undefined && {
        submitMessage: input.submitMessage?.trim() || null
      })
    }
  });
}

export async function softDeleteLeadCaptureForm(
  db: DatabaseClient,
  formId: string,
  organizationId: string
) {
  await getLeadCaptureForm(db, formId, organizationId);
  return db.leadCaptureForm.update({
    where: { id: formId },
    data: { deletedAt: new Date() }
  });
}

export async function listLeadCaptureSubmissions(
  db: DatabaseClient,
  organizationId: string,
  formId?: string
) {
  return db.leadCaptureSubmission.findMany({
    where: {
      organizationId,
      ...(formId ? { formId } : {})
    },
    include: {
      customer: { select: { id: true, displayName: true, status: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
}

function mergeTags(value: unknown, add: string[]): string[] {
  const base = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
  return [...new Set([...base, ...add])];
}

export async function submitLeadCaptureForm(
  db: DatabaseClient,
  input: {
    slug: string;
    name: string;
    phone: string;
    email?: string | null;
    company?: string | null;
    message?: string | null;
    source?: string | null;
    userAgent?: string | null;
  }
) {
  const form = await db.leadCaptureForm.findFirst({
    where: { slug: input.slug, enabled: true, deletedAt: null }
  });
  if (!form) throw new Error('表单不存在或已停用');

  const name = input.name.trim();
  if (!name) throw new Error('姓名不能为空');
  if (!isValidPhone(input.phone)) throw new Error('请输入有效的手机号');
  const phone = normalizePhone(input.phone);

  const existing = await db.customer.findFirst({
    where: {
      organizationId: form.organizationId,
      phone,
      deletedAt: null
    },
    select: { id: true, tags: true, sourceNote: true, assignedTo: true }
  });

  const assignment = await applyAssignmentRules(
    db,
    form.organizationId,
    { channel: 'website' },
    'customer'
  );

  const customer = existing
    ? await db.customer.update({
        where: { id: existing.id },
        data: {
          tags: mergeTags(existing.tags, ['表单获客']) as never,
          sourceNote: [
            existing.sourceNote,
            `表单：${form.name}${input.message ? ` · ${input.message.slice(0, 200)}` : ''}`
          ]
            .filter(Boolean)
            .join('\n'),
          ...(existing.assignedTo ? {} : { assignedTo: assignment.assigneeId })
        }
      })
    : await db.customer.create({
        data: {
          organizationId: form.organizationId,
          userId: form.userId,
          displayName: name,
          phone,
          company: input.company?.trim() || '待补充',
          role: '待补充',
          intent: input.message?.trim() || `通过表单「${form.name}」提交`,
          channel: 'website',
          sourceNote: `表单：${form.name}`,
          tags: ['表单获客', '待跟进'] as never,
          assignedTo: assignment.assigneeId,
          nextAction: '首次联系',
          nextActionAt: defaultNextActionAt('B'),
          activities: {
            create: {
              action: 'created_from_form',
              note: `通过表单「${form.name}」提交`,
              operator: 'system'
            }
          }
        }
      });

  if (existing) {
    await db.customerActivity.create({
      data: {
        customerId: customer.id,
        action: 'form_submission',
        note: `再次提交表单「${form.name}」`,
        operator: 'system'
      }
    });
  }

  const submission = await db.leadCaptureSubmission.create({
    data: {
      formId: form.id,
      organizationId: form.organizationId,
      name,
      phone,
      email: input.email?.trim().toLowerCase() || null,
      company: input.company?.trim() || null,
      message: input.message?.trim() || null,
      source: input.source?.trim() || 'public_form',
      customerId: customer.id,
      metadata: {
        userAgent: input.userAgent?.slice(0, 500) ?? null
      } as never
    },
    include: {
      customer: { select: { id: true, displayName: true, status: true } }
    }
  });

  const recipient = customer.assignedTo ?? assignment.assigneeId;
  if (recipient) {
    await db.notification.create({
      data: {
        organizationId: form.organizationId,
        userId: recipient,
        type: 'lead',
        title: '表单新线索',
        content: `「${name}」通过表单「${form.name}」提交，电话 ${phone.slice(0, 3)}****${phone.slice(-4)}`,
        level: 'warning',
        actionUrl: `/customers/${customer.id}`
      }
    });
  }

  return {
    submission,
    customer,
    created: !existing,
    submitMessage: form.submitMessage || '提交成功，我们会尽快联系你。'
  };
}
