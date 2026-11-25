'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import type { ChannelDTO } from '@cowork/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn } from '@/lib/utils';

type TemplateField = { part: 'header' | 'body' | 'button'; kind: string; name: string; label: string };
type Template = {
  id: string;
  name: string;
  language: string;
  status: string;
  header: string | null;
  body: string;
  footer: string | null;
  fields: TemplateField[];
  unsupported: string | null;
};

/** Sends a template in an open conversation, or (without conversationId) to a new number. */
export function SendTemplateDialog({
  conversationId,
  channelId: fixedChannel,
  onClose,
  onSent,
}: {
  conversationId?: string;
  channelId?: string;
  onClose: () => void;
  onSent: (conversationId: string) => void;
}) {
  const channels = useQuery({
    queryKey: ['channels'],
    queryFn: () => get<{ channels: ChannelDTO[] }>('/channels'),
    enabled: !fixedChannel,
  });
  const apiChannels = channels.data?.channels.filter((c) => c.type === 'WHATSAPP_CLOUD') ?? [];
  const [chosen, setChosen] = useState('');
  const channelId = fixedChannel ?? (chosen || apiChannels[0]?.id);
  const [phone, setPhone] = useState('');
  const [picked, setPicked] = useState<Template | null>(null);
  const [values, setValues] = useState<string[]>([]);
  const { data, error } = useQuery({
    queryKey: ['templates', channelId],
    queryFn: () => get<{ templates: Template[] }>(`/channels/${channelId}/templates`),
    enabled: !!channelId,
    retry: false,
  });
  const send = useAction(
    async (t: Template) => {
      const body = { templateId: t.id, params: values.map((v) => v.trim()) };
      if (conversationId) {
        await post(`/conversations/${conversationId}/template`, body);
        return conversationId;
      }
      const r = await post<{ conversationId: string }>('/conversations/start', { ...body, channelId, phone });
      return r.conversationId;
    },
    {
      success: 'Sent to WhatsApp. If it cannot be delivered, the chat shows why.',
      onSuccess: (id) => {
        onSent(id);
        onClose();
      },
    },
  );
  const approved = data?.templates.filter((t) => t.status === 'APPROVED') ?? [];
  const fill = (text: string | null, part: 'header' | 'body') =>
    text?.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, name: string) => {
      const i = picked!.fields.findIndex((f) => f.part === part && f.name === name);
      return values[i] || m;
    });
  const noChannel = !fixedChannel && channels.data && !apiChannels.length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{conversationId ? 'Send a template' : 'New WhatsApp message'}</DialogTitle>
          <DialogDescription>
            {conversationId
              ? 'Only templates approved by Meta can be sent.'
              : 'WhatsApp requires an approved template for the first message to a number.'}
          </DialogDescription>
        </DialogHeader>
        {error || channels.error ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {(error ?? channels.error)!.message}
          </p>
        ) : noChannel ? (
          <p className="text-sm text-muted-foreground">
            Connect a WhatsApp Business API number first in{' '}
            <Link href="/integrations?tab=channels" className="font-medium text-primary underline">
              Integrations → Channels
            </Link>
            .
          </p>
        ) : !data ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="space-y-4">
            {!conversationId && (
              <>
                {apiChannels.length > 1 && (
                  <Field label="Send from">
                    <Select
                      value={channelId}
                      onValueChange={(v) => {
                        setChosen(v);
                        setPicked(null);
                      }}
                    >
                      <SelectTrigger aria-label="Send from">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {apiChannels.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {c.externalId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <Field
                  label="Customer’s WhatsApp number"
                  htmlFor="tpl-phone"
                  hint="With country code. 10 digits are treated as an Indian number."
                >
                  <Input
                    id="tpl-phone"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </Field>
              </>
            )}
            {!approved.length ? (
              <p className="text-sm text-muted-foreground">
                No approved templates yet. Sync them in{' '}
                <Link href="/integrations?tab=channels" className="font-medium text-primary underline">
                  Integrations → Channels → Templates
                </Link>
                .
              </p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {approved.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!!t.unsupported}
                    aria-pressed={picked?.id === t.id}
                    onClick={() => {
                      setPicked(t);
                      setValues(t.fields.map(() => ''));
                    }}
                    className={cn(
                      'w-full cursor-pointer rounded-lg border p-3 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60',
                      picked?.id === t.id && 'border-primary bg-primary-soft',
                    )}
                  >
                    <div className="text-sm font-medium">
                      {t.name} <span className="text-xs font-normal text-muted-foreground">{t.language}</span>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{t.unsupported ?? t.body}</p>
                  </button>
                ))}
              </div>
            )}
            {picked && (
              <>
                {picked.fields.map((f, i) => (
                  <Field key={`${picked.id}-${i}`} label={f.label} htmlFor={`tpl-${i}`}>
                    <Input
                      id={`tpl-${i}`}
                      value={values[i] ?? ''}
                      onChange={(e) => setValues(values.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                  </Field>
                ))}
                <div className="whitespace-pre-wrap break-words rounded-lg bg-primary-soft p-3 text-sm">
                  {[fill(picked.header, 'header'), fill(picked.body, 'body'), picked.footer]
                    .filter(Boolean)
                    .join('\n')}
                </div>
                <Button
                  className="w-full"
                  loading={send.isPending}
                  disabled={
                    values.some((v) => !v.trim()) || (!conversationId && phone.replace(/\D/g, '').length < 8)
                  }
                  onClick={() => send.mutate(picked)}
                >
                  <Send /> Send template
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
