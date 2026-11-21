'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { post } from '@/lib/api';

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get('password') !== fd.get('confirm')) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await post('/auth/reset-password', { token: params.get('token') ?? '', password: fd.get('password') });
      router.replace('/login?reset=1');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="New password" htmlFor="password" hint="At least 8 characters">
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
        />
      </Field>
      <Button type="submit" className="w-full" loading={loading}>
        Update password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold">Choose a new password</h1>
      <p className="mb-8 mt-1 text-sm text-muted-foreground">You’ll be signed out of other devices.</p>
      <Suspense>
        <ResetForm />
      </Suspense>
    </>
  );
}
