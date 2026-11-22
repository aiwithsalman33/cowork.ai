'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { MeDTO } from '@partner/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResendVerification } from '@/components/resend-verification';
import { post } from '@/lib/api';

function Verify() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get('token');
    if (!token) {
      setState('error');
      setError('This link is missing its token.');
      return;
    }
    post<{ user: MeDTO }>('/auth/verify-email', { token })
      .then((res) => {
        qc.setQueryData(['me'], res.user);
        setState('ok');
        setTimeout(() => router.replace('/dashboard'), 2500);
      })
      .catch((err: Error) => {
        setState('error');
        setError(err.message);
      });
  }, [params, qc, router]);

  if (state === 'loading') {
    return (
      <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        Verifying your email…
      </div>
    );
  }
  if (state === 'ok') {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-success" />
        <h1 className="font-display text-3xl font-semibold">Email verified!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is now waiting for approval — we’ll email you as soon as it’s ready.
        </p>
      </div>
    );
  }
  return (
    <div className="text-center">
      <XCircle className="mx-auto mb-4 h-14 w-14 text-destructive" />
      <h1 className="font-display text-2xl font-semibold">Link not valid</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      <div className="mt-6 space-y-2 text-left">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
        />
        {email.includes('@') && <ResendVerification email={email} />}
      </div>
      <Button variant="ghost" className="mt-4" asChild>
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
