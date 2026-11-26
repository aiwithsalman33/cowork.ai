'use client';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { BRAND, limitLines, whatsappLink } from '@cowork/shared';
import { Button } from '@/components/ui/button';
import { usePublicPlans } from '@/lib/plans';
import { cn } from '@/lib/utils';

export function PricingCards() {
  const plans = usePublicPlans();
  return (
    <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
      {plans.map((p) => {
        const free = p.id === 'TRIAL';
        return (
          <div
            key={p.id}
            className={cn(
              'relative flex flex-col rounded-2xl border bg-card p-7',
              p.popular && 'border-2 border-primary shadow-xl shadow-primary/10',
            )}
          >
            {(free || p.popular) && (
              <span
                className={cn(
                  'absolute -top-px right-6 rounded-b-lg px-3 py-1 text-[11px] font-bold uppercase text-white',
                  p.popular ? 'bg-primary' : 'bg-emerald-600',
                )}
              >
                {p.popular ? 'Most popular' : 'Start free'}
              </span>
            )}
            <h3 className="font-display text-xl font-bold">{p.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="font-display text-5xl font-bold">
                {free ? 'Free' : `₹${p.priceInr.toLocaleString('en-IN')}`}
              </span>
              <span className="text-sm text-muted-foreground">
                {free
                  ? `for ${p.durationDays} days`
                  : p.durationDays === 30
                    ? '/month'
                    : `/${p.durationDays} days`}
              </span>
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm">
              {[...limitLines(p), ...p.features].map((f) => (
                <li key={f} className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> {f}
                </li>
              ))}
            </ul>
            <Button
              className="mt-7 w-full rounded-xl"
              size="lg"
              variant={p.popular ? 'default' : 'outline'}
              asChild
            >
              {free ? (
                <Link href="/signup">Start free trial</Link>
              ) : (
                <a
                  href={whatsappLink(`Hi! I'm interested in the ${BRAND.name} ${p.name} plan.`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Get {p.name}
                </a>
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
