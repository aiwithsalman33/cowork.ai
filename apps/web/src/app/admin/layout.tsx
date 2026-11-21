'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_NAV, AppShell, ShellLoading } from '@/components/app-shell';
import { useMe } from '@/lib/hooks';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, isError } = useMe();
  const router = useRouter();
  const allowed = me?.role === 'ADMIN' && !me.impersonatedBy;

  useEffect(() => {
    if (isError) router.replace('/login?next=/admin');
    else if (me && !allowed) router.replace('/dashboard');
  }, [isError, me, allowed, router]);

  if (isLoading || !me || !allowed) return <ShellLoading />;
  return (
    <AppShell me={me} nav={ADMIN_NAV}>
      {children}
    </AppShell>
  );
}
