import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@cowork/shared';
import { Logo } from '@/components/brand';

export const metadata: Metadata = { title: 'Refund & Cancellation Policy' };

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
        <h1 className="font-display text-3xl font-semibold">Refund & Cancellation Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: 26 November 2026</p>
        <section>
          <h2 className="text-lg font-semibold">Free trial</h2>
          <p className="mt-2 text-muted-foreground">
            {`You can try the service free for the trial period. No payment details are needed for the trial.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Cancellation</h2>
          <p className="mt-2 text-muted-foreground">
            {`Paid plans are one-time payments and never renew automatically, so there is nothing to cancel. Your plan simply ends at the end of the paid period.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Refunds</h2>
          <p className="mt-2 text-muted-foreground">
            {`If you are not satisfied, contact us within 7 days of your payment and we will refund it in full. After 7 days, payments are not refundable, except where the service was unavailable because of a fault on our side.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Failed or duplicate payments</h2>
          <p className="mt-2 text-muted-foreground">
            {`If money was taken but your plan did not activate, or you were charged twice, contact us and we will activate the plan or refund the extra payment.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">How refunds are paid</h2>
          <p className="mt-2 text-muted-foreground">
            {`Approved refunds go back to the original payment method through Cashfree within 5–7 working days.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="mt-2 text-muted-foreground">
            {`Refund requests: ${BRAND.email} or ${BRAND.phoneDisplay}. Include the order ID shown in Billing → Payments.`}
          </p>
        </section>
      </main>
    </div>
  );
}
