'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import type { ChannelDTO } from '@cowork/shared';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { get, patch, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';

type Template = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  header: string | null;
  body: string;
  footer: string | null;
  variables: number;
  useInAi: boolean;
  aiHint: string;
  syncedAt: string;
};
type ListRes = { templates: Template[]; hasBusinessAccountId: boolean };

const STATUS_VARIANT: Record<string, 'success' | 'secondary' | 'destructive'> = {
  APPROVED: 'success',
  PENDING: 'secondary',
  REJECTED: 'destructive',
};

function countVars(text: string) {
  return new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1])).size;
}

const EMPTY = {
  name: '',
  language: 'en',
  category: 'UTILITY',
  header: '',
  body: '',
  footer: '',
  examples: '',
  aiHint: '',
};

export function TemplatesDialog({ channel, onClose }: { channel: ChannelDTO; onClose: () => void }) {
  const key = ['templates', channel.id];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => get<ListRes>(`/channels/${channel.id}/templates`),
    retry: false,
  });
  const [waba, setWaba] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const sync = useAction(
    () =>
      post<{ synced: number }>(
        `/channels/${channel.id}/templates/sync`,
        waba ? { businessAccountId: waba.trim() } : {},
      ),
    { invalidate: [key], success: 'Templates synced from Meta' },
  );
  const toggle = useAction(
    (v: { id: string; useInAi?: boolean; aiHint?: string }) =>
      patch(`/channels/${channel.id}/templates/${v.id}`, { useInAi: v.useInAi, aiHint: v.aiHint }),
    { invalidate: [key] },
  );
  const create = useAction(
    () =>
      post(`/channels/${channel.id}/templates`, {
        name: form.name.trim(),
        language: form.language.trim() || 'en',
        category: form.category,
        header: form.header.trim() || undefined,
        body: form.body.trim(),
        footer: form.footer.trim() || undefined,
        examples: form.examples
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        aiHint: form.aiHint.trim(),
      }),
    {
      invalidate: [key],
      success: 'Template sent to Meta for review — it can be used once approved.',
      onSuccess: () => {
        setForm(EMPTY);
        setCreating(false);
      },
    },
  );

  const vars = countVars(form.body);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>WhatsApp templates · {channel.name}</DialogTitle>
          <DialogDescription>
            Sync templates from Meta or create new ones. Approved templates switched to “AI bot” can be sent
            by your agent during a chat.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {(error as Error).message}
          </p>
        ) : isLoading || !data ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <div className="space-y-4">
            {!data.hasBusinessAccountId && (
              <Field
                label="WhatsApp Business Account ID"
                hint="Meta → WhatsApp → API Setup. Needed once to read and create templates."
              >
                <Input value={waba} onChange={(e) => setWaba(e.target.value)} placeholder="1234567890" />
              </Field>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => sync.mutate(undefined)}
                loading={sync.isPending}
                disabled={!data.hasBusinessAccountId && !waba.trim()}
              >
                <RefreshCw /> Sync from Meta
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreating((v) => !v)}
                disabled={!data.hasBusinessAccountId}
              >
                <Plus /> New template
              </Button>
            </div>

            {creating && (
              <div className="space-y-3 rounded-xl border p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Name" hint="lowercase_with_underscores">
                    <Input
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })
                      }
                      placeholder="order_update"
                    />
                  </Field>
                  <Field label="Language code">
                    <Input
                      value={form.language}
                      onChange={(e) => setForm({ ...form, language: e.target.value })}
                      placeholder="en"
                    />
                  </Field>
                  <Field label="Category">
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UTILITY">Utility</SelectItem>
                        <SelectItem value="MARKETING">Marketing</SelectItem>
                        <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Header (optional)">
                  <Input value={form.header} onChange={(e) => setForm({ ...form, header: e.target.value })} />
                </Field>
                <Field label="Body" hint="Use {{1}}, {{2}} for values filled in when sending.">
                  <Textarea
                    rows={4}
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    placeholder="Hi {{1}}, your order {{2}} has been shipped!"
                  />
                </Field>
                {vars > 0 && (
                  <Field
                    label={`Example values (${vars}, comma separated)`}
                    hint="Meta needs samples to review."
                  >
                    <Input
                      value={form.examples}
                      onChange={(e) => setForm({ ...form, examples: e.target.value })}
                      placeholder="Ravi, #1234"
                    />
                  </Field>
                )}
                <Field label="Footer (optional)">
                  <Input value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} />
                </Field>
                <Field label="When should the AI use it? (optional)">
                  <Input
                    value={form.aiHint}
                    onChange={(e) => setForm({ ...form, aiHint: e.target.value })}
                    placeholder="When a customer asks about order status"
                  />
                </Field>
                <Button
                  size="sm"
                  onClick={() => create.mutate(undefined)}
                  loading={create.isPending}
                  disabled={!form.name || !form.body}
                >
                  Submit to Meta
                </Button>
              </div>
            )}

            {!data.templates.length ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No templates yet. Click “Sync from Meta” to import them.
              </div>
            ) : (
              <div className="space-y-2">
                {data.templates.map((t) => (
                  <div key={t.id} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{t.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.language} · {t.category.toLowerCase()}
                        </span>
                        <Badge variant={STATUS_VARIANT[t.status] ?? 'secondary'}>{t.status}</Badge>
                      </div>
                      <label className="flex items-center gap-2 text-xs">
                        AI bot
                        <Switch
                          checked={t.useInAi}
                          disabled={t.status !== 'APPROVED'}
                          onCheckedChange={(v) => toggle.mutate({ id: t.id, useInAi: v })}
                        />
                      </label>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {t.header ? `${t.header}\n` : ''}
                      {t.body}
                      {t.footer ? `\n${t.footer}` : ''}
                    </p>
                    {t.status === 'APPROVED' && t.useInAi && (
                      <Input
                        className="mt-2 h-8 text-xs"
                        defaultValue={t.aiHint}
                        placeholder="When should the AI send this? e.g. customer asks for the price list"
                        onBlur={(e) =>
                          e.target.value.trim() !== t.aiHint &&
                          toggle.mutate({ id: t.id, aiHint: e.target.value.trim() })
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
