'use client';
import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, ArrowLeft, Info } from 'lucide-react';
import type { ChannelStatus, ChannelType } from '@partner/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { ChannelIcon, ChannelStatusBadge, CHANNEL_LABEL } from '@/components/channel-badge';
import { get } from '@/lib/api';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import { UserActionsMenu } from '@/components/admin/user-actions';

type Log = { id: string; level: 'INFO' | 'WARN' | 'ERROR'; type: string; message: string; createdAt: string };
type Detail = {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'USER' | 'ADMIN';
    status: 'ACTIVE' | 'SUSPENDED';
    plan: string;
    planActive: boolean;
    trialEndsAt: string | null;
    subscriptionStatus: string | null;
    razorpaySubscriptionId: string | null;
    currentPeriodEnd: string | null;
    createdAt: string;
    lastLoginAt: string | null;
  };
  agent: { name: string; businessName: string; provider: string | null; model: string | null; isActive: boolean } | null;
  channels: { id: string; type: ChannelType; name: string; status: ChannelStatus; externalId: string | null; lastError: string | null }[];
  apiKeys: { provider: string; model: string; last4: string }[];
  integrations: { toolkit: string; status: string }[];
  usage: { monthMessages: number; totalMessages: number; contacts: number; skills: number; tokens: number };
  errors: Log[];
  logs: Log[];
};

const ICON = { INFO: Info, WARN: AlertTriangle, ERROR: AlertCircle };

export default function TenantDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['admin-user', id], queryFn: () => get<Detail>(`/admin/users/${id}`) });
  if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />;
  const u = data.user;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/admin/users">
          <ArrowLeft /> Users
        </Link>
      </Button>
      <PageHeader
        title={u.name}
        description={`${u.email}${data.agent?.businessName ? ` · ${data.agent.businessName}` : ''}`}
        actions={
          <>
            <Badge variant={u.planActive ? 'success' : 'secondary'}>{u.plan}</Badge>
            {u.status === 'SUSPENDED' && <Badge variant="destructive">Suspended</Badge>}
            <UserActionsMenu u={u} onDeleted={() => router.replace('/admin/users')} />
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['AI replies (month)', data.usage.monthMessages],
          ['Total messages', data.usage.totalMessages],
          ['Customers', data.usage.contacts],
          ['Active skills', data.usage.skills],
          ['Tokens', data.usage.tokens],
        ].map(([l, v]) => (
          <Card key={l as string} className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-xl font-semibold tabular-nums">{formatNumber(v as number)}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted-foreground">Joined</span>
            <span>{formatDateTime(u.createdAt)}</span>
            <span className="text-muted-foreground">Last login</span>
            <span>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}</span>
            <span className="text-muted-foreground">Trial ends</span>
            <span>{u.trialEndsAt ? formatDateTime(u.trialEndsAt) : '—'}</span>
            <span className="text-muted-foreground">Subscription</span>
            <span>{u.subscriptionStatus ?? '—'}</span>
            <span className="text-muted-foreground">Period end</span>
            <span>{u.currentPeriodEnd ? formatDateTime(u.currentPeriodEnd) : '—'}</span>
            <span className="text-muted-foreground">Model</span>
            <span>{data.agent?.model ? `${data.agent.provider} / ${data.agent.model}` : 'No key'}</span>
            <span className="text-muted-foreground">Agent</span>
            <span>{data.agent?.isActive ? 'Active' : 'Paused'}</span>
            <span className="text-muted-foreground">Integrations</span>
            <span>{data.integrations.filter((i) => i.status === 'CONNECTED').map((i) => i.toolkit).join(', ') || '—'}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Channels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!data.channels.length && <p className="text-sm text-muted-foreground">No channels.</p>}
            {data.channels.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ChannelIcon type={c.type} /> {c.name}
                    <span className="text-xs font-normal text-muted-foreground">{CHANNEL_LABEL[c.type]}</span>
                  </div>
                  <ChannelStatusBadge status={c.status} />
                </div>
                {c.lastError && <p className="mt-2 text-xs text-destructive">{c.lastError}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {[
          ['Recent errors', data.errors],
          ['Recent logs', data.logs],
        ].map(([title, list]) => (
          <Card key={title as string}>
            <CardHeader>
              <CardTitle>{title as string}</CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 divide-y overflow-y-auto">
              {(list as Log[]).length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
              {(list as Log[]).map((l) => {
                const Icon = ICON[l.level];
                return (
                  <div key={l.id} className="flex gap-2 py-2 text-sm">
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', l.level === 'ERROR' ? 'text-destructive' : l.level === 'WARN' ? 'text-amber-600' : 'text-sky-600')} />
                    <div className="min-w-0 flex-1">
                      <p>{l.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.type} · {formatDateTime(l.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
