'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, ShellLoading, ShellUnavailable, TENANT_NAV } from '@/components/app-shell';
import { ApiError } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { PendingApproval } from '@/components/pending-approval';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, error, refetch } = useMe();
  const signedOut = error instanceof ApiError && (error.status === 401 || error.status === 403);
  const router = useRouter();

  useEffect(() => {
    if (signedOut)
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [signedOut, router]);

  if (error && !me && !signedOut) return <ShellUnavailable onRetry={() => void refetch()} />;
  if (isLoading || !me) return <ShellLoading />;
  if (!me.approved) return <PendingApproval me={me} />;
  return (
    <AppShell me={me} nav={TENANT_NAV}>
      {children}
    </AppShell>
  );
}
