'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, Plus, RotateCcw, Save, Sparkles, Users, X } from 'lucide-react';
import type { PlanJSON } from '@cowork/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { del, get, put } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn, formatDateTime } from '@/lib/utils';

type AdminPlan = PlanJSON & { users: number; customizedAt: string | null };
type ChannelType = PlanJSON['limits']['channelTypes'][number];

const CHANNELS: { id: ChannelType; label: string }[] = [
  { id: 'TELEGRAM', label: 'Telegram' },
  { id: 'WHATSAPP_QR', label: 'WhatsApp (QR)' },
  { id: 'WHATSAPP_CLOUD', label: 'WhatsApp Business API' },
];

/** Number input where an empty box means "unlimited" (null). */
function LimitInput({
  id,
  value,
  onChange,
  unlimited = true,
}: {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unlimited?: boolean;
}) {
  return (
    <Input
      id={id}
      type="number"
      min={0}
      inputMode="numeric"
      value={value ?? ''}
      placeholder={unlimited ? 'Unlimited' : '0'}
      onChange={(e) =>
        onChange(e.target.value === '' ? (unlimited ? null : 0) : Math.max(0, Number(e.target.value)))
      }
    />
  );
}

function PlanEditor({ plan }: { plan: AdminPlan }) {
  const [form, setForm] = useState<PlanJSON>(plan);
  const [newFeature, setNewFeature] = useState('');
  useEffect(() => setForm(plan), [plan]);
  const set = <K extends keyof PlanJSON>(k: K, v: PlanJSON[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setLimit = <K extends keyof PlanJSON['limits']>(k: K, v: PlanJSON['limits'][K]) =>
    setForm((f) => ({ ...f, limits: { ...f.limits, [k]: v } }));
  const dirty = JSON.stringify(form) !== JSON.stringify(plan);
  const free = plan.id === 'TRIAL';

  const save = useAction(
    () =>
      put(`/admin/plans/${plan.id}`, {
        name: form.name,
        tagline: form.tagline,
        priceInr: form.priceInr,
        durationDays: form.durationDays,
        popular: form.popular,
        features: form.features,
        limits: form.limits,
      }),
    {
      success: `${form.name} saved — live for everyone now`,
      invalidate: [['admin-plans'], ['public-plans']],
    },
  );
  const reset = useAction(() => del(`/admin/plans/${plan.id}`), {
    success: 'Back to the default plan',
    invalidate: [['admin-plans'], ['public-plans']],
  });
  const addFeature = () => {
    const f = newFeature.trim();
    if (f && !form.features.includes(f)) set('features', [...form.features, f]);
    setNewFeature('');
  };
  const p = (k: string) => `${plan.id}-${k}`;

  return (
    <Card className={cn('overflow-hidden', form.popular && 'ring-2 ring-primary')}>
      <div className="flex flex-wrap items-center gap-3 border-b bg-linear-to-r from-primary-soft to-card px-5 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          {free ? <Sparkles className="h-5 w-5" /> : <Crown className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{form.name || plan.id}</h2>
            <Badge variant="outline">{plan.id}</Badge>
            {form.popular && <Badge>Most popular</Badge>}
            {plan.customizedAt ? (
              <span className="text-xs text-muted-foreground">
                Edited {formatDateTime(plan.customizedAt)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Default settings</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {free ? 'Free' : `₹${form.priceInr.toLocaleString('en-IN')}`} ·{' '}
            {free ? `${form.durationDays}-day trial` : `${form.durationDays} days per payment`}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm">
          <Users className="h-4 w-4 text-primary" /> {plan.users} {plan.users === 1 ? 'user' : 'users'}
        </span>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-3">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Details</h3>
          <Field label="Plan name" htmlFor={p('name')}>
            <Input id={p('name')} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Short description" htmlFor={p('tagline')}>
            <Textarea
              id={p('tagline')}
              rows={2}
              className="min-h-0"
              value={form.tagline}
              onChange={(e) => set('tagline', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹)" htmlFor={p('price')} hint={free ? 'Always free' : undefined}>
              <Input
                id={p('price')}
                type="number"
                min={0}
                disabled={free}
                value={form.priceInr}
                onChange={(e) => set('priceInr', Math.max(0, Number(e.target.value)))}
              />
            </Field>
            <Field label={free ? 'Trial days' : 'Days per payment'} htmlFor={p('days')}>
              <Input
                id={p('days')}
                type="number"
                min={1}
                max={366}
                value={form.durationDays}
                onChange={(e) => set('durationDays', Math.max(1, Number(e.target.value)))}
              />
            </Field>
          </div>
          {!free && (
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <span>
                <span className="font-medium">Show as “Most popular”</span>
                <span className="block text-xs text-muted-foreground">Highlighted on the pricing page</span>
              </span>
              <Switch checked={form.popular} onCheckedChange={(v) => set('popular', v)} />
            </label>
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Limits</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="AI replies / month" htmlFor={p('msgs')} hint="Empty = unlimited">
              <LimitInput
                id={p('msgs')}
                value={form.limits.messagesPerMonth}
                onChange={(v) => setLimit('messagesPerMonth', v)}
              />
            </Field>
            <Field label="Channels" htmlFor={p('channels')} hint="Empty = unlimited">
              <LimitInput
                id={p('channels')}
                value={form.limits.channels}
                onChange={(v) => setLimit('channels', v)}
              />
            </Field>
            <Field label="Active skills" htmlFor={p('skills')} hint="Empty = unlimited">
              <LimitInput
                id={p('skills')}
                value={form.limits.skills}
                onChange={(v) => setLimit('skills', v)}
              />
            </Field>
            <Field label="Replies per customer / hour" htmlFor={p('cph')}>
              <LimitInput
                id={p('cph')}
                unlimited={false}
                value={form.limits.contactRepliesPerHour}
                onChange={(v) => setLimit('contactRepliesPerHour', Math.max(1, v ?? 1))}
              />
            </Field>
            <Field label="Replies per customer / day" htmlFor={p('cpd')}>
              <LimitInput
                id={p('cpd')}
                unlimited={false}
                value={form.limits.contactRepliesPerDay}
                onChange={(v) => setLimit('contactRepliesPerDay', Math.max(1, v ?? 1))}
              />
            </Field>
            <Field label="WhatsApp QR numbers" htmlFor={p('qr')}>
              <LimitInput
                id={p('qr')}
                unlimited={false}
                value={form.limits.whatsappSessions}
                onChange={(v) => setLimit('whatsappSessions', v ?? 0)}
              />
            </Field>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">Channels allowed</div>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((c) => {
                const on = form.limits.channelTypes.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setLimit(
                        'channelTypes',
                        on
                          ? form.limits.channelTypes.filter((x) => x !== c.id)
                          : [...form.limits.channelTypes, c.id],
                      )
                    }
                    className={cn(
                      'cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      on
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            {!form.limits.channelTypes.length && (
              <p className="mt-1 text-xs text-destructive">Pick at least one channel.</p>
            )}
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>
              <span className="font-medium">WhatsApp templates</span>
              <span className="block text-xs text-muted-foreground">Sync, create and send templates</span>
            </span>
            <Switch checked={form.limits.templates} onCheckedChange={(v) => setLimit('templates', v)} />
          </label>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Extra features on the pricing page</h3>
          <p className="text-xs text-muted-foreground">
            Replies, channels and skills are listed automatically from the limits.
          </p>
          <ul className="space-y-2">
            {form.features.map((f, i) => (
              <li
                key={f}
                className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{f}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f}`}
                  className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                  onClick={() =>
                    set(
                      'features',
                      form.features.filter((_, j) => j !== i),
                    )
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              aria-label="New feature"
              value={newFeature}
              placeholder="e.g. Priority support"
              onChange={(e) => setNewFeature(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFeature();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={addFeature}
              aria-label="Add feature"
            >
              <Plus />
            </Button>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
        {dirty && <span className="mr-auto text-xs font-medium text-warning">Unsaved changes</span>}
        {plan.customizedAt && (
          <Button variant="ghost" size="sm" onClick={() => reset.mutate(undefined)} loading={reset.isPending}>
            <RotateCcw /> Reset to default
          </Button>
        )}
        {dirty && (
          <Button variant="outline" size="sm" onClick={() => setForm(plan)}>
            Discard
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => save.mutate(undefined)}
          loading={save.isPending}
          disabled={
            !dirty || !form.name.trim() || !form.limits.channelTypes.length || (!free && form.priceInr < 1)
          }
        >
          <Save /> Save plan
        </Button>
      </div>
    </Card>
  );
}

export default function AdminPlans() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => get<{ plans: AdminPlan[] }>('/admin/plans'),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans & pricing"
        description="Edit prices, limits and features. Changes apply to everyone on the plan within a minute, and to the pricing page."
      />
      {isLoading || !data ? (
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      ) : (
        data.plans.map((plan) => <PlanEditor key={plan.id} plan={plan} />)
      )}
    </div>
  );
}
