'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock } from 'lucide-react';
import type { MeDTO } from '@partner/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { post } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const res = await post<{ user: MeDTO }>('/auth/signup', {
        name: fd.get('name'),
        businessName: fd.get('businessName') || undefined,
        email: fd.get('email'),
        password: fd.get('password'),
      });
      qc.setQueryData(['me'], res.user);
      toast.success('Welcome! Your 24-hour free trial has started.');
      router.replace('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signup failed');
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Create your agent</h1>
      <p className="mt-1 text-sm text-muted-foreground">Free for 24 hours. No card needed.</p>
      <div className="mb-6 mt-4 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
        <Clock className="h-3.5 w-3.5" /> Trial starts the moment you sign up
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Your name" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            minLength={2}
            autoComplete="name"
            placeholder="Priya Sharma"
          />
        </Field>
        <Field label="Business name" htmlFor="businessName">
          <Input id="businessName" name="businessName" placeholder="Sharma Dental Clinic" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@business.com"
          />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters">
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" className="w-full" loading={loading}>
          Start free trial
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
