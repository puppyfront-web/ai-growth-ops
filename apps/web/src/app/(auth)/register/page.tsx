'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiError } from '@/lib/api/client';

const registerSchema = z
  .object({
    name: z.string().min(1, '请输入用户名').max(50, '用户名最多 50 个字符'),
    email: z.string().email('请输入有效的邮箱地址'),
    password: z.string().min(8, '密码至少 8 个字符'),
    confirmPassword: z.string().min(8, '请确认密码')
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword']
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { setAuthFromRegister } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema)
  });

  const onSubmit = async (data: RegisterForm) => {
    setServerError(null);
    try {
      await setAuthFromRegister(data);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setServerError('该邮箱已注册，请直接登录');
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError('注册失败，请稍后重试');
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
          <CardTitle className="text-2xl">创建账号</CardTitle>
          <CardDescription>
            注册 AI Growth Ops，开启智能内容运营
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">用户名</Label>
              <Input
                id="name"
                placeholder="输入用户名"
                error={errors.name?.message}
                {...register('name')}
              />
            </div>

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

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="至少 8 个字符"
                error={errors.password?.message}
                {...register('password')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="再次输入密码"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? '注册中...' : '注册'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              已有账号？{' '}
              <Link href="/login" className="text-teal-700 hover:underline">
                登录
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
