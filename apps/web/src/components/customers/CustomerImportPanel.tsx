'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  previewCustomerImport,
  executeCustomerImport,
  type CustomerImportPreviewResult
} from '@/lib/api/customers';
import {
  CUSTOMER_FIELD_LABELS,
  CUSTOMER_IMPORT_FIELDS,
  CUSTOMER_IMPORT_TEMPLATE,
  IMPORT_ISSUE_LABELS,
  type CustomerColumnMapping,
  type CustomerImportField,
  type CustomerImportRowIssue
} from '@ai-growth-ops/shared';
import {
  AlertDialog,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from '@/components/ui/alert-dialog';

const REQUIRED_FIELDS: CustomerImportField[] = [
  'displayName',
  'phone',
  'company',
  'role',
  'intent'
];

function rowWillImport(issues: CustomerImportRowIssue[]) {
  return !issues.some(
    (i) =>
      i.startsWith('missing_') ||
      i === 'invalid_phone' ||
      i === 'duplicate_in_file' ||
      i === 'duplicate_in_db'
  );
}

export function CustomerImportPanel() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<CustomerColumnMapping>({});
  const [preview, setPreview] = useState<CustomerImportPreviewResult | null>(
    null
  );
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  const previewMutation = useMutation({
    mutationFn: (input: { csv: string; mapping?: CustomerColumnMapping }) =>
      previewCustomerImport(input.csv, input.mapping ?? mapping),
    onSuccess: (result) => {
      setPreview(result);
      setHeaders(result.headers);
      setMapping(result.mapping);
      setError('');
    },
    onError: (e: Error) => setError(e.message)
  });

  const importMutation = useMutation({
    mutationFn: () =>
      executeCustomerImport(csv, mapping, { skipDuplicates: true }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setResultMsg(
        `导入完成：新增 ${result.created} 条，跳过 ${result.skipped} 条`
      );
      setOpen(false);
      reset();
    },
    onError: (e: Error) => setError(e.message)
  });

  const reset = () => {
    setCsv('');
    setHeaders([]);
    setMapping({});
    setPreview(null);
    setError('');
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setCsv(text);
      setOpen(true);
      setError('');
      previewMutation.mutate({ csv: text });
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const blob = new Blob([CUSTOMER_IMPORT_TEMPLATE], {
      type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customer-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const mappingReady = REQUIRED_FIELDS.every((f) => mapping[f] != null);

  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
      >
        导入 CSV
      </button>
      <button
        onClick={downloadTemplate}
        className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
      >
        下载模板
      </button>
      {resultMsg && (
        <span className="text-xs text-muted-foreground">{resultMsg}</span>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>批量导入客户</AlertDialogTitle>
          <AlertDialogDescription>
            确认字段映射，预览去重结果后导入。系统中已存在的手机号将自动跳过。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-4 py-2">
          <section className="rounded-md border p-3">
            <h3 className="text-sm font-medium mb-2">字段映射</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {CUSTOMER_IMPORT_FIELDS.map((field) => (
                <label key={field} className="text-xs">
                  <span className="text-muted-foreground">
                    {CUSTOMER_FIELD_LABELS[field]}
                    {REQUIRED_FIELDS.includes(field) ? ' *' : ''}
                  </span>
                  <select
                    value={mapping[field] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const next = {
                        ...mapping,
                        [field]: val === '' ? undefined : Number(val)
                      };
                      setMapping(next);
                      setPreview(null);
                    }}
                    className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm"
                  >
                    <option value="">未映射</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `列 ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              onClick={() => previewMutation.mutate({ csv, mapping })}
              disabled={!csv || !mappingReady || previewMutation.isPending}
              className="mt-3 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
            >
              {previewMutation.isPending ? '解析中…' : '刷新预览'}
            </button>
          </section>

          {preview && (
            <section className="rounded-md border p-3">
              <h3 className="text-sm font-medium mb-2">导入预览</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs mb-3">
                <div>总计 {preview.summary.total}</div>
                <div className="text-green-600">
                  可导入 {preview.summary.ready}
                </div>
                <div className="text-amber-600">
                  重复(系统) {preview.summary.duplicateDb}
                </div>
                <div className="text-amber-600">
                  重复(文件) {preview.summary.duplicateFile}
                </div>
                <div className="text-destructive">
                  无效 {preview.summary.invalid}
                </div>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1 pr-2">行</th>
                      <th className="py-1 pr-2">姓名</th>
                      <th className="py-1 pr-2">手机号</th>
                      <th className="py-1 pr-2">公司</th>
                      <th className="py-1 pr-2">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => {
                      const willImport = rowWillImport(
                        row.issues as CustomerImportRowIssue[]
                      );
                      return (
                        <tr key={row.rowNumber} className="border-b">
                          <td className="py-1 pr-2">{row.rowNumber}</td>
                          <td className="py-1 pr-2">
                            {row.data.displayName ?? '-'}
                          </td>
                          <td className="py-1 pr-2">{row.data.phone ?? '-'}</td>
                          <td className="py-1 pr-2">
                            {row.data.company ?? '-'}
                          </td>
                          <td className="py-1 pr-2">
                            {willImport ? (
                              <span className="text-green-600">将导入</span>
                            ) : (
                              <span className="text-amber-600">
                                {(row.issues as CustomerImportRowIssue[])
                                  .map((i) => IMPORT_ISSUE_LABELS[i])
                                  .join('、')}
                                {row.existingCustomer && (
                                  <>
                                    {' '}
                                    (
                                    <Link
                                      href={`/customers/${row.existingCustomer.id}`}
                                      className="underline"
                                      target="_blank"
                                    >
                                      查看
                                    </Link>
                                    )
                                  </>
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          {preview && preview.summary.ready > 0 && (
            <AlertDialogAction
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || !mappingReady}
            >
              {importMutation.isPending
                ? '导入中…'
                : `确认导入 ${preview.summary.ready} 条`}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialog>
    </>
  );
}
