import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@cowork/shared';
import { Logo } from '@/components/brand';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function Page() {
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Logo />
          <Link href="/" className="text-sm font-medium text-primary">
            Back to home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 leading-relaxed">
        <h1 className="font-display text-3xl font-semibold">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: 26 November 2026</p>
        <section>
          <h2 className="text-lg font-semibold">Who we are</h2>
          <p className="mt-2 text-muted-foreground">
            {`${BRAND.name} ("we") provides an AI assistant that answers your customers on WhatsApp and Telegram. These terms apply when you create an account or use ${BRAND.url}.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Your account</h2>
          <p className="mt-2 text-muted-foreground">
            {`You must give correct details and keep your password safe. You are responsible for what is sent from your connected numbers and bots, and for following WhatsApp, Meta and Telegram rules.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Plans and payment</h2>
          <p className="mt-2 text-muted-foreground">
            {`The free trial lasts for the period shown on the pricing page. Paid plans are one-time payments in Indian Rupees for the number of days shown at checkout, processed by Cashfree. Plans do not renew automatically.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Acceptable use</h2>
          <p className="mt-2 text-muted-foreground">
            {`Do not use the service for spam, fraud, harassment or anything illegal. We may suspend accounts that do.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Availability</h2>
          <p className="mt-2 text-muted-foreground">
            {`We work to keep the service running but cannot promise it is never interrupted. Messaging platforms may limit or block numbers; that is outside our control.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Liability</h2>
          <p className="mt-2 text-muted-foreground">
            {`To the extent the law allows, our total liability is limited to the amount you paid us in the last three months.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="mt-2 text-muted-foreground">
            {`Questions about these terms: ${BRAND.email} or ${BRAND.phoneDisplay}.`}
          </p>
        </section>
      </main>
    </div>
  );
}
