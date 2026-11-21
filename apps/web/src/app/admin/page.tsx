'use client';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Bot,
  Coins,
  IndianRupee,
  MessageCircle,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { MessagesChart, SignupsChart, TokensChart } from '@/components/admin/charts';
import { get } from '@/lib/api';
import { formatInr, formatNumber } from '@/lib/utils';

type Overview = {
  kpis: {
    users: number;
    newThisWeek: number;
    mrr: number;
    activeAgents: number;
    messages7d: number;
    errorRate: number;
    tokens30d: number;
  };
  plans: { plan: string; count: number }[];
  series: { day: string; inbound: number; outbound: number; tokens: number; signups: number }[];
  mailConfigured: boolean;
};

function Kpi({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export default function AdminOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => get<Overview>('/admin/overview'),
    refetchInterval: 60_000,
  });
  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  const k = data.kpis;
  const totalPlans = data.plans.reduce((s, p) => s + p.count, 0) || 1;
  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" description="Last 30 days across all tenants." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Users" value={formatNumber(k.users)} icon={Users} hint={`+${k.newThisWeek} this week`} />
        <Kpi label="MRR" value={formatInr(k.mrr)} icon={IndianRupee} hint="active paid plans" />
        <Kpi
          label="Active agents"
          value={formatNumber(k.activeAgents)}
          icon={Bot}
          hint="connected + plan active"
        />
        <Kpi label="Customer messages (7d)" value={formatNumber(k.messages7d)} icon={MessageCircle} />
        <Kpi
          label="Error rate (7d)"
          value={`${k.errorRate}%`}
          icon={AlertTriangle}
          hint="failed replies / messages"
        />
        <Kpi label="Tokens (30d)" value={formatNumber(k.tokens30d)} icon={Coins} />
        <Kpi label="New signups (7d)" value={formatNumber(k.newThisWeek)} icon={UserPlus} />
        <Kpi
          label="Email delivery"
          value={data.mailConfigured ? 'On' : 'Off'}
          icon={Activity}
          hint="Verification email (SMTP)"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Messages per day</CardTitle>
        </CardHeader>
        <CardContent>
          <MessagesChart data={data.series} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Signups per day</CardTitle>
          </CardHeader>
          <CardContent>
            <SignupsChart data={data.series} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Token usage per day</CardTitle>
          </CardHeader>
          <CardContent>
            <TokensChart data={data.series} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Users by plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.plans.map((p) => (
              <div key={p.plan}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{p.plan.charAt(0) + p.plan.slice(1).toLowerCase()}</span>
                  <span className="font-medium tabular-nums">{p.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[var(--chart-1)]"
                    style={{ width: `${(p.count / totalPlans) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
