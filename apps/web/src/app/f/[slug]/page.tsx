'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getPublicCaptureForm,
  submitPublicCaptureForm,
  type CaptureField
} from '@/lib/api/forms';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/LoadingState';

export default function PublicCaptureFormPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<string | null>(null);

  const formQuery = useQuery({
    queryKey: ['public-form', slug],
    queryFn: () => getPublicCaptureForm(slug),
    retry: false
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      submitPublicCaptureForm(slug, {
        name: values.name ?? '',
        phone: values.phone ?? '',
        email: values.email || undefined,
        company: values.company || undefined,
        message: values.message || undefined
      }),
    onSuccess: (result) => setSubmitted(result.message)
  });

  if (formQuery.isLoading) return <LoadingState />;
  if (formQuery.isError || !formQuery.data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">表单不可用</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            表单不存在或已停用，请联系工作人员获取新的链接。
          </p>
        </div>
      </main>
    );
  }

  const form = formQuery.data;
  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold">提交成功</h1>
          <p className="mt-2 text-sm text-muted-foreground">{submitted}</p>
        </div>
      </main>
    );
  }

  const fields = Array.isArray(form.fields) ? form.fields : [];
  const setValue = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{form.title}</h1>
        {form.description ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {form.description}
          </p>
        ) : null}

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitMutation.mutate();
          }}
        >
          {fields.map((field: CaptureField) => (
            <label key={field.key} className="block text-sm">
              {field.label}
              {field.required ? (
                <span className="ml-1 text-destructive">*</span>
              ) : null}
              {field.type === 'textarea' ? (
                <textarea
                  rows={3}
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValue(field.key, event.target.value)}
                  required={field.required}
                  className="mt-1 w-full rounded border bg-background px-3 py-2"
                />
              ) : (
                <input
                  type={field.type}
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValue(field.key, event.target.value)}
                  required={field.required}
                  className="mt-1 w-full rounded border bg-background px-3 py-2"
                />
              )}
            </label>
          ))}

          {submitMutation.isError ? (
            <p className="text-sm text-destructive">
              {(submitMutation.error as Error).message || '提交失败，请重试'}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={
              submitMutation.isPending ||
              !values.name?.trim() ||
              !values.phone?.trim()
            }
            loading={submitMutation.isPending}
          >
            {submitMutation.isPending ? '提交中…' : '提交'}
          </Button>
        </form>
      </div>
    </main>
  );
}
