import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@cowork/shared';
import { Logo } from '@/components/brand';

export const metadata: Metadata = { title: 'Privacy Policy' };

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
        <h1 className="font-display text-3xl font-semibold">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: 26 November 2026</p>
        <section>
          <h2 className="text-lg font-semibold">What we collect</h2>
          <p className="mt-2 text-muted-foreground">
            {`Your name, email, password (stored only as a secure hash), mobile number for payments, and the messages your connected channels receive and send.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">How we use it</h2>
          <p className="mt-2 text-muted-foreground">
            {`To run the assistant, show your conversations, process payments, and contact you about your account. We do not sell your data.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Who we share it with</h2>
          <p className="mt-2 text-muted-foreground">
            {`Only the services needed to run the product: the AI provider whose key you add, Meta (WhatsApp), Telegram, Google if you connect it, and Cashfree for payments.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Security</h2>
          <p className="mt-2 text-muted-foreground">
            {`Data is encrypted in transit. API keys and channel credentials are encrypted at rest.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Your choices</h2>
          <p className="mt-2 text-muted-foreground">
            {`You can delete conversations and customer memory in the app, or ask us to delete your account.`}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="mt-2 text-muted-foreground">{`Privacy questions: ${BRAND.email}.`}</p>
        </section>
      </main>
    </div>
  );
}
