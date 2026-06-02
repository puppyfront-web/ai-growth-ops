'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { forgotPassword } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiError } from '@/lib/api/client';

const forgotSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotForm) => {
    setServerError(null);
    try {
      await forgotPassword(data.email);
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('发送失败，请稍后重试');
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-lg font-bold text-white">
              AI
            </div>
          </div>
          <CardTitle className="text-2xl">忘记密码</CardTitle>
          <CardDescription>
            {sent ? '重置邮件已发送' : '输入注册邮箱，我们将发送密码重置链接'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  如果该邮箱已注册，重置邮件已发送。请检查您的收件箱（包括垃圾邮件）。
                </AlertDescription>
              </Alert>
              <Link href="/login">
                <Button variant="outline" className="w-full">返回登录</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {serverError && (
                <Alert variant="destructive">
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  error={errors.email?.message}
                  {...register('email')}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? '发送中...' : '发送重置链接'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="text-teal-700 hover:underline">
                  返回登录
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
