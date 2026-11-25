'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_NAV, AppShell, ShellLoading, ShellUnavailable } from '@/components/app-shell';
import { ApiError } from '@/lib/api';
import { useMe } from '@/lib/hooks';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, error, refetch } = useMe();
  const signedOut = error instanceof ApiError && (error.status === 401 || error.status === 403);
  const router = useRouter();
  const allowed = me?.role === 'ADMIN' && !me.impersonatedBy;

  useEffect(() => {
    if (signedOut) router.replace('/login?next=/admin');
    else if (me && !allowed) router.replace('/dashboard');
  }, [signedOut, me, allowed, router]);

  if (error && !me && !signedOut) return <ShellUnavailable onRetry={() => void refetch()} />;
  if (isLoading || !me || !allowed) return <ShellLoading />;
  return (
    <AppShell me={me} nav={ADMIN_NAV}>
      {children}
    </AppShell>
  );
}
