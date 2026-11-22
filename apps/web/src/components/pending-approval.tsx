'use client';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, LogOut, MessageCircle, RefreshCw } from 'lucide-react';
import { BRAND, whatsappLink, type MeDTO } from '@cowork/shared';
import { Logo } from './brand';
import { Button } from './ui/button';
import { post } from '@/lib/api';

/** Shown after email verification until an admin grants access (payments are on hold). */
export function PendingApproval({ me }: { me: MeDTO }) {
  const qc = useQueryClient();
  const router = useRouter();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-8">
        <Logo className="[&_img]:h-10" />
      </div>
      <div className="w-full max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Clock className="h-7 w-7" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold sm:text-3xl">
          You’re on the list, {me.name.split(' ')[0]}!
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your email is verified. Our team reviews every new account personally — we’ll email{' '}
          <span className="font-medium text-foreground">{me.email}</span> as soon as your access is ready.
        </p>
        <ol className="mx-auto mt-6 max-w-xs space-y-3 text-left text-sm">
          <li className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> Account created
          </li>
          <li className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> Email verified
          </li>
          <li className="flex items-center gap-3 font-medium">
            <Clock className="h-5 w-5 shrink-0 text-primary" /> Waiting for approval — usually within a few
            hours
          </li>
        </ol>
        <p className="mt-6 text-sm text-muted-foreground">Want it faster? Message us on WhatsApp.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <a
              href={whatsappLink(
                `Hi! I just signed up for ${BRAND.name} with ${me.email}. Please approve my account.`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle /> WhatsApp {BRAND.phoneDisplay}
            </a>
          </Button>
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ['me'] })}>
            <RefreshCw /> Check again
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        className="mt-6 text-muted-foreground"
        onClick={async () => {
          await post('/auth/logout').catch(() => null);
          qc.clear();
          router.replace('/login');
        }}
      >
        <LogOut /> Sign out
      </Button>
    </div>
  );
}
