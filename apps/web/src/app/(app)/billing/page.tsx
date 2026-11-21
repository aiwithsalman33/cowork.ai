'use client';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, CreditCard, Crown, ShieldCheck } from 'lucide-react';
import type { PlanDef, PlanId } from '@partner/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Progress, Skeleton } from '@/components/ui/misc';
import { get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn, formatDateTime } from '@/lib/utils';

type Usage = { used: number; limit: number | null };
type BillingRes = {
  plan: PlanId;
  planActive: boolean;
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  pendingPlan: PlanId | null;
  usage: { messages: Usage; channels: Usage; skills: Usage };
  plans: (Omit<PlanDef, 'limits'> & {
    limits: { channels: number; whatsappSessions: number; messagesPerMonth: number; skills: number | null };
  })[];
  razorpayConfigured: boolean;
  history: { id: string; message: string; createdAt: string; level: string }[];
};

function UsageRow({ label, u }: { label: string; u: Usage }) {
  const pct = u.limit ? (u.used / u.limit) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {u.used.toLocaleString('en-IN')} /{' '}
          {u.limit === null ? 'Unlimited' : u.limit.toLocaleString('en-IN')}
        </span>
      </div>
      <Progress value={u.limit === null ? 5 : pct} className={cn(pct >= 90 && '[&>div]:bg-destructive')} />
    </div>
  );
}

export default function BillingPage() {
  const { data, isLoading } = useQuery({ queryKey: ['billing'], queryFn: () => get<BillingRes>('/billing') });
  const checkout = useAction(
    (plan: 'STARTER' | 'GROWTH') => post<{ url: string }>('/billing/checkout', { plan }),
    {
      onSuccess: (r) => (window.location.href = r.url),
    },
  );
  const cancel = useAction(() => post('/billing/cancel'), {
    success: 'Cancellation requested. You keep access until the end of the paid period.',
    invalidate: [['billing']],
  });

  if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />;
  const current = data.plans.find((p) => p.id === data.plan)!;
  const subscribed = data.subscriptionStatus === 'active' || data.subscriptionStatus === 'authenticated';

  return (
    <div>
      <PageHeader title="Billing" description="Plans in ₹, billed monthly via Razorpay. Cancel any time." />

      {!data.planActive && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Your agent has stopped replying.</p>
            <p className="text-muted-foreground">
              {data.plan === 'TRIAL' ? 'Your free trial has ended.' : 'Your subscription is not active.'}{' '}
              Choose a plan below to turn it back on instantly.
            </p>
          </div>
        </div>
      )}

      <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardDescription>Current plan</CardDescription>
            <CardTitle className="flex items-center gap-2 font-display text-2xl">
              {current.name}
              <Badge variant={data.planActive ? 'success' : 'destructive'}>
                {data.planActive ? 'Active' : 'Inactive'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {data.plan === 'TRIAL' && data.trialEndsAt && (
              <p>
                Trial {data.planActive ? 'ends' : 'ended'} {formatDateTime(data.trialEndsAt)}
              </p>
            )}
            {data.currentPeriodEnd && data.plan !== 'TRIAL' && (
              <p>
                {data.subscriptionStatus === 'cancelled' ? 'Access until' : 'Renews'}{' '}
                {formatDateTime(data.currentPeriodEnd)}
              </p>
            )}
            {data.subscriptionStatus && <p>Subscription status: {data.subscriptionStatus}</p>}
            {data.pendingPlan && (
              <p>Waiting for payment confirmation for {data.pendingPlan.toLowerCase()}…</p>
            )}
            {subscribed && (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-3 text-destructive"
                onClick={() => cancel.mutate(undefined)}
                loading={cancel.isPending}
              >
                Cancel subscription
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Usage this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageRow label="AI replies" u={data.usage.messages} />
            <UsageRow label="Channels" u={data.usage.channels} />
            <UsageRow label="Active skills" u={data.usage.skills} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {data.plans.map((p) => {
          const isCurrent = p.id === data.plan && data.planActive;
          const highlight = p.id === 'STARTER';
          return (
            <Card
              key={p.id}
              className={cn(
                'relative flex flex-col p-6',
                highlight && 'border-primary ring-2 ring-primary/20',
              )}
            >
              {highlight && (
                <Badge className="absolute -top-2.5 left-6 bg-primary text-primary-foreground">
                  <Crown /> Most popular
                </Badge>
              )}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-4 font-display text-4xl font-semibold">
                {p.priceInr === 0 ? 'Free' : `₹${p.priceInr.toLocaleString('en-IN')}`}
                {p.priceInr > 0 && (
                  <span className="text-base font-normal text-muted-foreground">/month</span>
                )}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-primary" />{' '}
                  {p.limits.messagesPerMonth.toLocaleString('en-IN')} AI replies /{' '}
                  {p.id === 'TRIAL' ? 'trial' : 'month'}
                </li>
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="h-4 w-4 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              {p.id === 'TRIAL' ? (
                <Button variant="outline" className="mt-6" disabled>
                  {data.plan === 'TRIAL'
                    ? data.planActive
                      ? 'Current plan'
                      : 'Trial used'
                    : 'Included at signup'}
                </Button>
              ) : (
                <Button
                  className="mt-6"
                  variant={highlight ? 'default' : 'outline'}
                  disabled={isCurrent && subscribed}
                  loading={checkout.isPending && checkout.variables === p.id}
                  onClick={() => checkout.mutate(p.id as 'STARTER' | 'GROWTH')}
                >
                  <CreditCard />{' '}
                  {isCurrent && subscribed
                    ? 'Current plan'
                    : data.plan === 'TRIAL' || !data.planActive
                      ? `Get ${p.name}`
                      : `Switch to ${p.name}`}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" /> Payments are processed securely by Razorpay (UPI, cards,
        netbanking). GST invoices are emailed by Razorpay.
        {!data.razorpayConfigured && ' Payments are not configured on this server yet.'}
      </p>

      {data.history.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Billing history</CardTitle>
          </CardHeader>
          <CardContent className="divide-y text-sm">
            {data.history.map((h) => (
              <div key={h.id} className="flex justify-between gap-4 py-2">
                <span>{h.message}</span>
                <span className="shrink-0 text-muted-foreground">{formatDateTime(h.createdAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
