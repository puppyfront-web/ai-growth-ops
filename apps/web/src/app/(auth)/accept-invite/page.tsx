'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  getInvitationInfo,
  acceptInvitation,
  type InvitationInfo
} from '@/lib/api/settings';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

const roleLabels: Record<string, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
  viewer: '只读'
};

function buildNextPath(token: string, orgId: string) {
  return `/accept-invite?token=${encodeURIComponent(token)}&orgId=${encodeURIComponent(orgId)}`;
}

function InvitationSummary({ info }: { info: InvitationInfo }) {
  return (
    <div className="space-y-1 rounded-lg bg-muted p-4 text-sm">
      <div>
        <span className="text-muted-foreground">组织：</span>
        {info.organizationName}
      </div>
      <div>
        <span className="text-muted-foreground">邀请人：</span>
        {info.inviterName}
      </div>
      <div>
        <span className="text-muted-foreground">角色：</span>
        {roleLabels[info.role] ?? info.role}
      </div>
    </div>
  );
}

function AcceptInviteContent() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const orgId = params.get('orgId') ?? '';
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const infoQuery = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => getInvitationInfo(token),
    enabled: Boolean(token),
    retry: false
  });

  if (!token || !orgId) {
    return (
      <CardDescription className="text-center">
        邀请链接无效，请联系邀请人重新发送。
      </CardDescription>
    );
  }

  const nextPath = buildNextPath(token, orgId);

  const handleAccept = async () => {
    setAcceptError(null);
    setAccepting(true);
    try {
      await acceptInvitation(orgId, token);
      setAccepted(true);
    } catch (err) {
      setAcceptError(
        err instanceof Error ? err.message : '接受邀请失败，请稍后重试'
      );
    } finally {
      setAccepting(false);
    }
  };

  let body: React.ReactNode;

  if (accepted) {
    body = (
      <>
        <CardDescription className="text-center">
          你已加入「{infoQuery.data?.organizationName ?? '组织'}」，开始使用吧。
        </CardDescription>
        <Button asChild className="mt-4 w-full">
          <Link href="/prospecting">进入系统</Link>
        </Button>
      </>
    );
  } else if (infoQuery.isLoading || authLoading) {
    body = (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (infoQuery.error || !infoQuery.data) {
    body = (
      <CardDescription className="text-center">
        邀请不存在或已失效，请联系邀请人重新发送。
      </CardDescription>
    );
  } else if (infoQuery.data.status !== 'pending') {
    body = (
      <>
        <InvitationSummary info={infoQuery.data} />
        <CardDescription className="mt-4 text-center">
          {infoQuery.data.status === 'accepted'
            ? '该邀请已被接受。'
            : '该邀请已过期，请联系邀请人重新发送。'}
        </CardDescription>
        <Button asChild variant="outline" className="mt-4 w-full">
          <Link href="/prospecting">进入系统</Link>
        </Button>
      </>
    );
  } else if (!isAuthenticated) {
    body = (
      <>
        <InvitationSummary info={infoQuery.data} />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          请使用{' '}
          <span className="text-foreground">
            {infoQuery.data.inviteeEmail}
          </span>{' '}
          登录或注册后接受邀请。
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>
              登录并接受邀请
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/register?next=${encodeURIComponent(nextPath)}`}>
              注册新账号并接受
            </Link>
          </Button>
        </div>
      </>
    );
  } else if (
    user?.email?.toLowerCase() !==
    infoQuery.data.inviteeEmail.toLowerCase()
  ) {
    body = (
      <>
        <InvitationSummary info={infoQuery.data} />
        <Alert className="mt-4">
          <AlertDescription>
            此邀请发送给 {infoQuery.data.inviteeEmail}，与当前登录账号（
            {user?.email}）不一致。请退出后用受邀邮箱登录。
          </AlertDescription>
        </Alert>
      </>
    );
  } else {
    body = (
      <>
        <InvitationSummary info={infoQuery.data} />
        {acceptError && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{acceptError}</AlertDescription>
          </Alert>
        )}
        <Button
          className="mt-4 w-full"
          onClick={handleAccept}
          disabled={accepting}
        >
          {accepting ? '接受中...' : '接受邀请'}
        </Button>
      </>
    );
  }

  return (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">团队邀请</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <Suspense>
          <AcceptInviteContent />
        </Suspense>
      </Card>
    </div>
  );
}
