'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmail } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('缺少验证令牌');
      return;
    }

    verifyEmail(token)
      .then(() => {
        setStatus('success');
        setMessage('邮箱验证成功！');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err?.message || '验证失败，令牌可能已过期');
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-lg font-bold text-white">
              AI
            </div>
          </div>
          <CardTitle className="text-2xl">邮箱验证</CardTitle>
          <CardDescription>
            {status === 'loading' ? '正在验证...' : message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'success' && (
            <Alert>
              <AlertDescription>您的邮箱已验证成功，现在可以正常使用所有功能。</AlertDescription>
            </Alert>
          )}
          {status === 'error' && (
            <Alert variant="destructive">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {status !== 'loading' && (
            <Link href="/dashboard">
              <Button className="w-full">前往工作台</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
