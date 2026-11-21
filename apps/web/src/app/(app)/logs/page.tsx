'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Info, ScrollText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { get } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';

type Log = { id: string; level: 'INFO' | 'WARN' | 'ERROR'; type: string; message: string; createdAt: string };
const ICON = { INFO: Info, WARN: AlertTriangle, ERROR: AlertCircle };
const COLOR = { INFO: 'text-sky-600', WARN: 'text-amber-600', ERROR: 'text-destructive' };

export default function LogsPage() {
  const [level, setLevel] = useState<'ALL' | Log['level']>('ALL');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['logs', level, page],
    queryFn: () =>
      get<{ items: Log[]; total: number; pageSize: number }>(`/logs?level=${level}&page=${page}`),
    refetchInterval: 15_000,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title="Logs"
        description="Activity from your agent: connections, tool use, skipped replies and errors."
        actions={
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLevel(l);
                  setPage(1);
                }}
                className={cn(
                  'cursor-pointer rounded-md px-3 py-1 text-xs font-medium',
                  level === l ? 'bg-card shadow-sm' : 'text-muted-foreground',
                )}
              >
                {l === 'ALL' ? 'All' : l === 'WARN' ? 'Warnings' : l === 'ERROR' ? 'Errors' : 'Info'}
              </button>
            ))}
          </div>
        }
      />
      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !data?.items.length ? (
        <EmptyState
          icon={ScrollText}
          title="No logs yet"
          description="Events will appear here as your agent works."
        />
      ) : (
        <Card className="divide-y">
          {data.items.map((l) => {
            const Icon = ICON[l.level];
            return (
              <div key={l.id} className="flex items-start gap-3 px-4 py-3">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', COLOR[l.level])} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{l.message}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{l.type}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(l.createdAt)}</span>
              </div>
            );
          })}
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
