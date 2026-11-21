'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { post } from '@/lib/api';

/** "Resend email" with a 60-second cooldown. */
export function ResendVerification({
  email,
  variant = 'outline',
}: {
  email: string;
  variant?: 'outline' | 'link';
}) {
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  return (
    <Button
      type="button"
      variant={variant}
      loading={loading}
      disabled={cooldown > 0}
      onClick={async () => {
        setLoading(true);
        try {
          await post('/auth/resend-verification', { email });
          toast.success('Verification email sent again. Check your inbox (and spam).');
          setCooldown(60);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not resend');
        } finally {
          setLoading(false);
        }
      }}
    >
      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
    </Button>
  );
}
