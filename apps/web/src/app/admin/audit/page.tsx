'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { get } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

type Entry = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: { email: string } | null;
};

export default function AdminAudit() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit', page],
    queryFn: () =>
      get<{ items: Entry[]; total: number; pageSize: number }>(`/admin/audit?page=${page}&pageSize=50`),
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div>
      <PageHeader title="Audit log" description="Every admin action, who did it and when." />
      {isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : !data?.items.length ? (
        <EmptyState icon={ScrollText} title="No admin actions yet" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDateTime(e.createdAt)}
                  </td>
                  <td className="px-4 py-3">{e.actor?.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{e.action}</code>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {e.targetType ? `${e.targetType}:${e.targetId}` : '—'}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-muted-foreground">
                    {e.meta ? JSON.stringify(e.meta) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Newer
          </Button>
          {page} / {pages}
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Older
          </Button>
        </div>
      )}
    </div>
  );
}
