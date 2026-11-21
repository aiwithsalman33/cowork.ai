'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, ShellLoading, TENANT_NAV } from '@/components/app-shell';
import { useMe } from '@/lib/hooks';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading, isError } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (isError) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }, [isError, router]);

  if (isLoading || !me) return <ShellLoading />;
  return (
    <AppShell me={me} nav={TENANT_NAV}>
      {children}
    </AppShell>
  );
}
