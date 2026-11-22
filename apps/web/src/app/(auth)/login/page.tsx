'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MailWarning } from 'lucide-react';
import type { MeDTO } from '@cowork/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ResendVerification } from '@/components/resend-verification';
import { ApiError, post } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email'));
    setLoading(true);
    setUnverified(null);
    try {
      const res = await post<{ user: MeDTO }>('/auth/login', { email, password: fd.get('password') });
      qc.setQueryData(['me'], res.user);
      const next = params.get('next');
      router.replace(
        next && next.startsWith('/') ? next : res.user.role === 'ADMIN' ? '/admin' : '/dashboard',
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') setUnverified(email);
      else toast.error(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  }

  return (
    <>
      {params.get('reset') === '1' && (
        <div className="mb-4 rounded-lg bg-success/10 p-3 text-sm text-success">
          Password updated. Sign in with your new password.
        </div>
      )}
      {unverified && (
        <div className="mb-4 space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
            <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
            Please verify your email first. We sent a link to {unverified}.
          </p>
          <ResendVerification email={unverified} />
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={params.get('email') ?? ''}
            placeholder="you@business.com"
          />
        </Field>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Welcome back</h1>
      <p className="mb-8 mt-1 text-sm text-muted-foreground">Sign in to manage your AI agent.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Start your free trial
        </Link>
      </p>
    </>
  );
}
