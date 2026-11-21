'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, CheckCircle2, Loader2, Plus, QrCode, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import type { ChannelDTO } from '@partner/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChannelIcon, ChannelStatusBadge, CHANNEL_LABEL } from '@/components/channel-badge';
import { CopyField } from '@/components/copy-field';
import { del, get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';

type ChannelsRes = { channels: ChannelDTO[]; baileysEnabled: boolean };

function QrDialog({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['qr', channelId],
    queryFn: () => get<{ status: string; qr: string | null; phone: string | null; lastError: string | null }>(`/channels/${channelId}/qr`),
    refetchInterval: (q) => (q.state.data?.status === 'CONNECTED' ? false : 2000),
  });
  useEffect(() => {
    if (data?.status === 'CONNECTED') qc.invalidateQueries({ queryKey: ['channels'] });
  }, [data?.status, qc]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan with WhatsApp</DialogTitle>
          <DialogDescription>Open WhatsApp on your phone → Settings → Linked devices → Link a device.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-72 items-center justify-center rounded-xl border bg-white p-4">
          {data?.status === 'CONNECTED' ? (
            <div className="flex flex-col items-center gap-2 text-center text-black">
              <CheckCircle2 className="h-14 w-14 text-green-600" />
              <p className="font-semibold">Connected{data.phone ? ` as ${data.phone}` : ''}</p>
              <p className="text-sm text-gray-500">Your agent will now reply on WhatsApp.</p>
            </div>
          ) : data?.qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.qr} alt="WhatsApp QR code" className="h-64 w-64" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              {data?.lastError ?? 'Generating QR code…'}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">The QR refreshes automatically every ~20 seconds. Keep this window open until it says Connected.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {data?.status === 'CONNECTED' ? 'Done' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TelegramCard({ onCreated }: { onCreated: () => void }) {
  const [token, setToken] = useState('');
  const create = useAction((t: string) => post<{ channel: ChannelDTO }>('/channels/telegram', { botToken: t }), {
    success: (r) => (r.channel.status === 'CONNECTED' ? `${r.channel.name} connected` : 'Bot saved, but webhook setup failed — see details'),
    invalidate: [['channels'], ['dashboard']],
    onSuccess: () => {
      setToken('');
      onCreated();
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-500/15 text-sky-600">
            <ChannelIcon type="TELEGRAM" />
          </span>
          Telegram
        </CardTitle>
        <CardDescription>Create a bot with @BotFather, then paste its token.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Open{' '}
            <a className="text-primary hover:underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">
              @BotFather
            </a>{' '}
            and send <code>/newbot</code>
          </li>
          <li>Choose a name and username</li>
          <li>Copy the token it gives you</li>
        </ol>
        <Field label="Bot token">
          <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AAH…" className="font-mono" autoComplete="off" />
        </Field>
        <Button onClick={() => create.mutate(token.trim())} loading={create.isPending} disabled={token.trim().length < 20}>
          <Plus /> Connect Telegram
        </Button>
      </CardContent>
    </Card>
  );
}

function WhatsAppCard({ baileysEnabled, onQr }: { baileysEnabled: boolean; onQr: (id: string) => void }) {
  const [mode, setMode] = useState<'choose' | 'cloud'>('choose');
  const [form, setForm] = useState({ phoneNumberId: '', businessAccountId: '', accessToken: '', appSecret: '' });
  const [created, setCreated] = useState<ChannelDTO | null>(null);

  const startQr = useAction(() => post<{ channel: ChannelDTO }>('/channels/whatsapp-qr', { name: 'WhatsApp' }), {
    invalidate: [['channels']],
    onSuccess: (r) => onQr(r.channel.id),
  });
  const createCloud = useAction(
    () =>
      post<{ channel: ChannelDTO }>('/channels/whatsapp-cloud', {
        ...form,
        businessAccountId: form.businessAccountId || undefined,
      }),
    {
      success: 'Credentials verified with Meta',
      invalidate: [['channels'], ['dashboard']],
      onSuccess: (r) => setCreated(r.channel),
    },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-green-500/15 text-green-600">
            <ChannelIcon type="WHATSAPP_CLOUD" />
          </span>
          WhatsApp
        </CardTitle>
        <CardDescription>Use the official Business API (recommended) or link a phone by QR.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {created ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> Number added. Finish the webhook in Meta:
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Meta App Dashboard → WhatsApp → Configuration → Webhook → Edit</li>
              <li>Paste the Callback URL and Verify token below, then Verify and save</li>
              <li>Under Webhook fields, subscribe to <code>messages</code></li>
            </ol>
            <CopyField label="Callback URL" value={created.webhookUrl ?? ''} />
            <CopyField label="Verify token" value={created.verifyToken ?? ''} />
            <Button variant="outline" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
        ) : mode === 'choose' ? (
          <div className="grid gap-3">
            <button
              onClick={() => setMode('cloud')}
              className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-primary/30 bg-primary-soft/30 p-4 text-left transition-colors hover:border-primary"
            >
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  WhatsApp Business API <Badge variant="success">Recommended</Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">Official Meta Cloud API. No ban risk, green-tick eligible, best for production.</p>
              </div>
            </button>
            <div className="rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-semibold">Scan QR (WhatsApp Web)</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">Quick setup with your existing number.</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p>
                  <strong>Unofficial method.</strong> It uses WhatsApp Web automation (Baileys), which is against WhatsApp’s terms. Your
                  number can be <strong>temporarily or permanently banned</strong>, especially for bulk or unsolicited messages. Use a
                  spare number, or choose the official Business API.
                </p>
              </div>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => startQr.mutate(undefined)}
                loading={startQr.isPending}
                disabled={!baileysEnabled}
              >
                <QrCode /> I understand — show QR code
              </Button>
              {!baileysEnabled && <p className="mt-2 text-xs text-muted-foreground">QR connections are disabled on this server.</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              From{' '}
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Meta for Developers
              </a>{' '}
              → your app → WhatsApp → API Setup. Use a permanent System User token.
            </p>
            <Field label="Phone number ID">
              <Input value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} className="font-mono" />
            </Field>
            <Field label="WhatsApp Business Account ID (optional)">
              <Input value={form.businessAccountId} onChange={(e) => setForm({ ...form, businessAccountId: e.target.value })} className="font-mono" />
            </Field>
            <Field label="Access token">
              <Input type="password" autoComplete="off" value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} className="font-mono" />
            </Field>
            <Field label="App secret" hint="App settings → Basic. Used to verify webhook signatures.">
              <Input type="password" autoComplete="off" value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} className="font-mono" />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => createCloud.mutate(undefined)} loading={createCloud.isPending} disabled={!form.phoneNumberId || !form.accessToken || !form.appSecret}>
                <BadgeCheck /> Verify & connect
              </Button>
              <Button variant="ghost" onClick={() => setMode('choose')}>
                Back
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ChannelsTab() {
  const { data, isLoading } = useQuery({ queryKey: ['channels'], queryFn: () => get<ChannelsRes>('/channels'), refetchInterval: 15_000 });
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [details, setDetails] = useState<ChannelDTO | null>(null);
  const remove = useAction((id: string) => del(`/channels/${id}`), { success: 'Channel removed', invalidate: [['channels'], ['dashboard']] });
  const reconnect = useAction((c: ChannelDTO) => post<{ channel: ChannelDTO }>(`/channels/${c.id}/reconnect`), {
    invalidate: [['channels']],
    onSuccess: (r) => r.channel.type === 'WHATSAPP_QR' && setQrFor(r.channel.id),
  });

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 font-semibold">Connected channels</h3>
        {isLoading ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : !data?.channels.length ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No channels yet — connect one below.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.channels.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <ChannelIcon type={c.type} className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {CHANNEL_LABEL[c.type]}
                        {c.externalId && c.externalId !== c.name ? ` · ${c.externalId}` : ''}
                      </div>
                    </div>
                  </div>
                  <ChannelStatusBadge status={c.status} />
                </div>
                {c.lastError && <p className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive">{c.lastError}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.type === 'WHATSAPP_QR' && c.status === 'QR' && (
                    <Button size="sm" onClick={() => setQrFor(c.id)}>
                      <QrCode /> Show QR
                    </Button>
                  )}
                  {c.type === 'WHATSAPP_CLOUD' && (
                    <Button size="sm" variant="outline" onClick={() => setDetails(c)}>
                      Webhook details
                    </Button>
                  )}
                  {c.type !== 'WHATSAPP_CLOUD' && c.status !== 'CONNECTED' && (
                    <Button size="sm" variant="outline" onClick={() => reconnect.mutate(c)} loading={reconnect.isPending && reconnect.variables?.id === c.id}>
                      <RefreshCw /> Reconnect
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(c.id)} loading={remove.isPending && remove.variables === c.id}>
                    <Trash2 /> {c.type === 'WHATSAPP_QR' ? 'Log out & remove' : 'Remove'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <WhatsAppCard baileysEnabled={data?.baileysEnabled ?? true} onQr={setQrFor} />
        <TelegramCard onCreated={() => {}} />
      </section>

      {qrFor && <QrDialog channelId={qrFor} onClose={() => setQrFor(null)} />}
      {details && (
        <Dialog open onOpenChange={(o) => !o && setDetails(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Webhook details</DialogTitle>
              <DialogDescription>Paste these in Meta → WhatsApp → Configuration → Webhook, and subscribe to “messages”.</DialogDescription>
            </DialogHeader>
            <CopyField label="Callback URL" value={details.webhookUrl ?? ''} />
            <CopyField label="Verify token" value={details.verifyToken ?? ''} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
