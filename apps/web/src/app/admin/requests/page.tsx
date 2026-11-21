'use client';
import { useQuery } from '@tanstack/react-query';
import { Plug } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { get, patch } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';

type Req = { id: string; toolName: string; useCase: string; status: string; createdAt: string; user: { email: string; name: string } };

export default function AdminRequests() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-requests'], queryFn: () => get<{ items: Req[] }>('/admin/integration-requests') });
  const update = useAction(({ id, status }: { id: string; status: string }) => patch(`/admin/integration-requests/${id}`, { status }), {
    success: 'Updated',
    invalidate: [['admin-requests']],
  });

  const counts = new Map<string, number>();
  for (const r of data?.items ?? []) counts.set(r.toolName.toLowerCase(), (counts.get(r.toolName.toLowerCase()) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div>
      <PageHeader title="Integration requests" description="Tools users have asked for." />
      {top.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {top.map(([name, n]) => (
            <span key={name} className="rounded-full border bg-card px-3 py-1 text-sm capitalize">
              {name} <span className="font-semibold text-primary">×{n}</span>
            </span>
          ))}
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-60 rounded-xl" />
      ) : !data?.items.length ? (
        <EmptyState icon={Plug} title="No requests yet" />
      ) : (
        <Card className="divide-y">
          {data.items.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.toolName}</div>
                <p className="text-sm text-muted-foreground">{r.useCase}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.user.email} · {formatDateTime(r.createdAt)}
                </p>
              </div>
              <Select value={r.status} onValueChange={(status) => update.mutate({ id: r.id, status })}>
                <SelectTrigger className="sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['OPEN', 'PLANNED', 'DONE', 'DECLINED'].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
