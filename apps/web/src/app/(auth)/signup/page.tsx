'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Clock, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { ResendVerification } from '@/components/resend-verification';
import { post } from '@/lib/api';

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      const res = await post<{ needsVerification: boolean; email: string }>('/auth/signup', {
        name: fd.get('name'),
        businessName: fd.get('businessName') || undefined,
        email: fd.get('email'),
        password: fd.get('password'),
      });
      setSentTo(res.email);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <MailCheck className="h-7 w-7" />
        </div>
        <h1 className="font-display text-3xl font-semibold">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a verification link to <span className="font-medium text-foreground">{sentTo}</span>. Click
          it to confirm your email. Our team then approves your account and your 24-hour free trial starts.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Can’t find it? Check Spam or Promotions.</p>
        <div className="mt-6 flex flex-col gap-2">
          <ResendVerification email={sentTo} />
          <Button variant="ghost" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Already verified?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Create your agent</h1>
      <p className="mt-1 text-sm text-muted-foreground">Free for 24 hours. No card needed.</p>
      <div className="mb-6 mt-4 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
        <Clock className="h-3.5 w-3.5" /> Free trial starts once your account is approved
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
          Create account
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
