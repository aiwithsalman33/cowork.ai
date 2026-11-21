'use client';
import { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { BRAND, whatsappLink } from '@partner/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { post } from '@/lib/api';

/**
 * Sends the enquiry to WhatsApp (+91 81480 35472) with the details pre-filled,
 * and also stores it so it shows up in Admin → Contact Messages.
 */
export function ContactForm() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name: String(fd.get('name') ?? '').trim(),
      phone: String(fd.get('phone') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      business: String(fd.get('business') ?? '').trim(),
      message: String(fd.get('message') ?? '').trim(),
    };
    const text = [
      `Hi ${BRAND.name} team!`,
      `Name: ${data.name}`,
      `Phone: ${data.phone}`,
      data.email ? `Email: ${data.email}` : null,
      data.business ? `Business: ${data.business}` : null,
      '',
      data.message,
    ]
      .filter((l): l is string => l !== null)
      .join('\n');
    // Open WhatsApp synchronously (inside the click) so browsers don't block the new tab.
    // (window.open with "noopener" always returns null, so detach the opener manually instead.)
    const tab = window.open(whatsappLink(text), '_blank');
    if (tab) tab.opener = null;
    setLoading(true);
    try {
      await post('/public/contact', data);
      setDone(true);
      if (!tab) window.location.href = whatsappLink(text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send. Please WhatsApp us directly.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border bg-card p-10 text-center">
        <CheckCircle2 className="h-12 w-12 text-success" />
        <h3 className="mt-4 text-xl font-semibold">Thanks — we got your message!</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          WhatsApp should have opened with your details. If it didn’t, message us at {BRAND.phoneDisplay}.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => setDone(false)}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="c-name">
          <Input id="c-name" name="name" required minLength={2} placeholder="Ravi Kumar" />
        </Field>
        <Field label="Phone / WhatsApp" htmlFor="c-phone">
          <Input id="c-phone" name="phone" required type="tel" placeholder="98765 43210" />
        </Field>
        <Field label="Email (optional)" htmlFor="c-email">
          <Input id="c-email" name="email" type="email" placeholder="you@business.com" />
        </Field>
        <Field label="Business (optional)" htmlFor="c-business">
          <Input id="c-business" name="business" placeholder="Kumar Sweets, Madurai" />
        </Field>
      </div>
      <Field label="How can we help?" htmlFor="c-message">
        <Textarea
          id="c-message"
          name="message"
          required
          minLength={5}
          placeholder="I want an AI to answer customer questions and take orders on WhatsApp…"
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        <Send /> Send on WhatsApp
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Opens WhatsApp to {BRAND.phoneDisplay} with your message ready to send.
      </p>
    </form>
  );
}
