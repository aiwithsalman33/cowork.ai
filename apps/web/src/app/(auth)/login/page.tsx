'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MeDTO } from '@partner/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { post } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const res = await post<{ user: MeDTO }>('/auth/login', { email: fd.get('email'), password: fd.get('password') });
      qc.setQueryData(['me'], res.user);
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : res.user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@business.com" />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" className="w-full" loading={loading}>
        Sign in
      </Button>
    </form>
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
