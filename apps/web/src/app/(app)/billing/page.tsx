'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CreditCard,
  Crown,
  Loader2,
  MessageCircle,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { BRAND, limitLines, whatsappLink, type PlanId, type PlanJSON } from '@cowork/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Progress, Skeleton } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { get, post } from '@/lib/api';
import { useAction, useMe } from '@/lib/hooks';
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
  plans: PlanJSON[];
  billingEnabled: boolean;
  history: { id: string; message: string; createdAt: string; level: string }[];
  payments: Payment[];
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

function BillingPage() {
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({ queryKey: ['billing'], queryFn: () => get<BillingRes>('/billing') });
  const [buying, setBuying] = useState<PlanJSON | null>(null);

  if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />;
  const current = data.plans.find((p) => p.id === data.plan)!;

  return (
    <div>
      <PageHeader title="Billing" description="Your plan, usage and upgrades." />

      {!data.planActive && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Your agent has stopped replying.</p>
            <p className="text-muted-foreground">
              {data.plan === 'TRIAL' ? 'Your free trial has ended.' : 'Your plan is not active.'}{' '}
              {data.billingEnabled
                ? 'Choose a plan below to turn it back on instantly.'
                : 'Purchase a plan below to turn it back on.'}
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
                {data.planActive ? 'Active until' : 'Expired on'} {formatDateTime(data.currentPeriodEnd)}
              </p>
            )}
            {data.plan !== 'TRIAL' && data.planActive && (
              <p>Pay again any time to add another period on top.</p>
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
          const highlight = p.popular;
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
                  <span className="text-base font-normal text-muted-foreground">
                    {' '}
                    / {p.durationDays} days
                  </span>
                )}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {[...limitLines(p), ...p.features].map((f) => (
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
              ) : !data.billingEnabled ? (
                <Button className="mt-6" variant={highlight ? 'default' : 'outline'} asChild>
                  <a
                    href={whatsappLink(
                      `Hi! I'd like to upgrade my ${BRAND.name} account (${me?.email ?? ''}) to the ${p.name} plan.`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle /> {isCurrent ? 'Current plan' : `Get ${p.name} — contact us`}
                  </a>
                </Button>
              ) : (
                <Button
                  className="mt-6"
                  variant={highlight ? 'default' : 'outline'}
                  onClick={() => setBuying(p)}
                >
                  <CreditCard />{' '}
                  {isCurrent
                    ? `Add ${p.durationDays} more days`
                    : data.plan === p.id
                      ? `Renew ${p.name}`
                      : `Buy ${p.name}`}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
      {data.billingEnabled ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Payments are processed securely by Cashfree (UPI, cards,
          netbanking, wallets). One-time payment — nothing renews automatically.
        </p>
      ) : (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> Online payments are coming soon. To upgrade today, WhatsApp us
          at{' '}
          <a
            className="font-medium text-primary hover:underline"
            href={whatsappLink(`Hi! I'd like to upgrade my ${BRAND.name} account.`)}
            target="_blank"
            rel="noreferrer"
          >
            {BRAND.phoneDisplay}
          </a>{' '}
          or email{' '}
          <a className="font-medium text-primary hover:underline" href={`mailto:${BRAND.email}`}>
            {BRAND.email}
          </a>
          .
        </p>
      )}

      {data.payments.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent className="divide-y text-sm">
            {data.payments.map((p) => (
              <div key={p.orderId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>
                  {data.plans.find((x) => x.id === p.plan)?.name ?? p.plan} · ₹
                  {p.amountInr.toLocaleString('en-IN')} · {p.durationDays} days
                  <span className="block text-xs text-muted-foreground">Order {p.orderId}</span>
                </span>
                <span className="flex items-center gap-3">
                  <Badge variant={p.status === 'PAID' ? 'success' : 'destructive'}>
                    {p.status === 'PAID' ? 'Paid' : 'Not completed'}
                  </Badge>
                  <span className="text-muted-foreground">{formatDateTime(p.paidAt ?? p.createdAt)}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
      {buying && <CheckoutDialog plan={buying} onClose={() => setBuying(null)} />}
    </div>
  );
}

type Payment = {
  orderId: string;
  plan: PlanId;
  amountInr: number;
  durationDays: number;
  status: 'CREATED' | 'PAID' | 'FAILED';
  error: string | null;
  paidAt: string | null;
  createdAt: string;
};

type CashfreeSDK = (o: { mode: 'sandbox' | 'production' }) => {
  checkout: (o: { paymentSessionId: string; redirectTarget?: '_self' }) => Promise<unknown>;
};

/** Loads Cashfree's checkout script once (https://sdk.cashfree.com/js/v3/cashfree.js). */
function loadCashfree(): Promise<CashfreeSDK> {
  const w = window as unknown as { Cashfree?: CashfreeSDK };
  if (w.Cashfree) return Promise.resolve(w.Cashfree);
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    el.onload = () => (w.Cashfree ? resolve(w.Cashfree) : reject(new Error('Cashfree did not load')));
    el.onerror = () => reject(new Error('Could not load Cashfree checkout. Check your connection.'));
    document.head.appendChild(el);
  });
}

function CheckoutDialog({ plan, onClose }: { plan: PlanJSON; onClose: () => void }) {
  const [phone, setPhone] = useState(() => {
    try {
      return localStorage.getItem('pa_pay_phone') ?? '';
    } catch {
      return '';
    }
  });
  const digits = phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  const valid = /^[6-9]\d{9}$/.test(digits);
  const pay = useAction(async () => {
    const [order, Cashfree] = await Promise.all([
      post<{ orderId: string; paymentSessionId: string; mode: 'sandbox' | 'production' }>(
        '/billing/checkout',
        {
          plan: plan.id,
          phone: digits,
        },
      ),
      loadCashfree(),
    ]);
    try {
      localStorage.setItem('pa_pay_phone', digits);
    } catch {
      /* optional convenience */
    }
    // leaves this page for Cashfree; the customer comes back to /billing?order_id=…
    await Cashfree({ mode: order.mode }).checkout({
      paymentSessionId: order.paymentSessionId,
      redirectTarget: '_self',
    });
  }, {});
  return (
    <Dialog open onOpenChange={(o) => !o && !pay.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buy {plan.name}</DialogTitle>
          <DialogDescription>
            One-time payment for {plan.durationDays} days. Nothing renews automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-baseline justify-between rounded-xl bg-primary-soft p-4">
          <span className="font-medium">{plan.name}</span>
          <span className="font-display text-2xl font-semibold">
            ₹{plan.priceInr.toLocaleString('en-IN')}
          </span>
        </div>
        <Field
          label="Mobile number"
          htmlFor="pay-phone"
          hint="Cashfree needs it for the payment receipt."
          error={phone && !valid ? 'Enter a valid 10-digit mobile number' : undefined}
        >
          <Input
            id="pay-phone"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Button
          className="w-full"
          size="lg"
          disabled={!valid}
          loading={pay.isPending}
          onClick={() => pay.mutate(undefined)}
        >
          <CreditCard /> Pay ₹{plan.priceInr.toLocaleString('en-IN')} securely
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> UPI, cards, netbanking and wallets via Cashfree
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** After Cashfree sends the customer back: confirm the order, then show the result. */
function PaymentReturn() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const orderId = params.get('order_id');
  const { data } = useQuery({
    queryKey: ['payment', orderId],
    queryFn: () => get<{ payment: Payment }>(`/billing/orders/${encodeURIComponent(orderId!)}`),
    enabled: !!orderId,
    // the bank can take a few seconds to confirm
    refetchInterval: (q) => (q.state.data?.payment.status === 'CREATED' ? 3000 : false),
  });
  const status = data?.payment.status;
  useEffect(() => {
    if (status === 'PAID') {
      qc.invalidateQueries({ queryKey: ['billing'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [status, qc]);
  if (!orderId) return null;
  const close = () => router.replace('/billing', { scroll: false });
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="text-center sm:max-w-sm">
        {status === 'PAID' ? (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <DialogTitle className="text-xl">Payment successful</DialogTitle>
            <DialogDescription>
              ₹{data!.payment.amountInr.toLocaleString('en-IN')} received. Your plan is active now.
            </DialogDescription>
            <Button onClick={close}>Continue</Button>
          </>
        ) : status === 'FAILED' ? (
          <>
            <XCircle className="mx-auto h-14 w-14 text-destructive" />
            <DialogTitle className="text-xl">Payment not completed</DialogTitle>
            <DialogDescription>
              {data!.payment.error ?? 'No money was taken.'} You can try again.
            </DialogDescription>
            <Button onClick={close}>Back to plans</Button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <DialogTitle className="text-xl">Confirming your payment…</DialogTitle>
            <DialogDescription>
              This usually takes a few seconds. If you closed the payment page, it stays unpaid and you can
              try again.
            </DialogDescription>
            <Button variant="outline" onClick={close}>
              Close
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function BillingRoute() {
  return (
    <Suspense>
      <BillingPage />
      <PaymentReturn />
    </Suspense>
  );
}
