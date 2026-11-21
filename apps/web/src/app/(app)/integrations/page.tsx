'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Link2, Loader2, Settings2, Unplug, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { TOOLKIT_META, type IntegrationDTO, type Toolkit } from '@partner/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { del, get, post, put } from '@/lib/api';
import { useAction } from '@/lib/hooks';

const LOGOS: Record<Toolkit, { bg: string; letter: string }> = {
  gmail: { bg: 'bg-red-500', letter: 'M' },
  googlecalendar: { bg: 'bg-blue-500', letter: '31' },
  googlesheets: { bg: 'bg-green-600', letter: '⊞' },
  googledrive: { bg: 'bg-amber-500', letter: '▲' },
  googledocs: { bg: 'bg-sky-600', letter: '≡' },
};

function SettingsDialog({ integration, onClose }: { integration: IntegrationDTO; onClose: () => void }) {
  const [sheetId, setSheetId] = useState(integration.settings.sheetId ?? '');
  const [calendarId, setCalendarId] = useState(integration.settings.calendarId ?? '');
  const save = useAction(() => put(`/integrations/${integration.toolkit}/settings`, integration.toolkit === 'googlesheets' ? { sheetId } : { calendarId }), {
    success: 'Settings saved',
    invalidate: [['integrations']],
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TOOLKIT_META[integration.toolkit]?.name} settings</DialogTitle>
          <DialogDescription>
            {integration.toolkit === 'googlesheets'
              ? 'Leads captured by the agent will be appended as rows to this spreadsheet.'
              : 'Appointments will be added to this calendar.'}
          </DialogDescription>
        </DialogHeader>
        {integration.toolkit === 'googlesheets' ? (
          <Field label="Google Sheet URL or ID" hint="Columns: Date, Name, Phone, Email, Interest, Notes, Channel">
            <Input value={sheetId} onChange={(e) => setSheetId(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
          </Field>
        ) : (
          <Field label="Calendar ID" hint="Leave empty to use your primary calendar.">
            <Input value={calendarId} onChange={(e) => setCalendarId(e.target.value)} placeholder="primary" />
          </Field>
        )}
        <DialogFooter>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Integrations() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const router = useRouter();
  const [settingsFor, setSettingsFor] = useState<IntegrationDTO | null>(null);
  const [request, setRequest] = useState({ toolName: '', useCase: '' });
  const { data, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => get<{ integrations: IntegrationDTO[]; enabled: boolean }>('/integrations'),
    refetchInterval: (q) => (q.state.data?.integrations.some((i) => i.status === 'PENDING') ? 4000 : false),
  });

  // Returning from Composio's OAuth redirect: ?toolkit=gmail&status=success
  useEffect(() => {
    const toolkit = params.get('toolkit');
    const status = params.get('status');
    if (!toolkit) return;
    (async () => {
      if (status === 'failed') toast.error('Connection was cancelled or failed.');
      else {
        try {
          const r = await post<{ status: string }>(`/integrations/${toolkit}/sync`);
          if (r.status === 'CONNECTED') toast.success(`${TOOLKIT_META[toolkit]?.name ?? toolkit} connected`);
        } catch {
          /* polling will pick it up */
        }
      }
      qc.invalidateQueries({ queryKey: ['integrations'] });
      router.replace('/integrations');
    })();
  }, [params, qc, router]);

  const connect = useAction((t: Toolkit) => post<{ redirectUrl: string }>(`/integrations/${t}/connect`), {
    onSuccess: (r) => (window.location.href = r.redirectUrl),
  });
  const disconnect = useAction((t: Toolkit) => del(`/integrations/${t}`), { success: 'Disconnected', invalidate: [['integrations']] });
  const submitRequest = useAction(() => post('/integration-requests', request), {
    success: 'Thanks! We’ll let you know when it’s available.',
    onSuccess: () => setRequest({ toolName: '', useCase: '' }),
  });

  return (
    <>
      {data && !data.enabled && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
          Integrations are not configured on this server yet (Composio API key missing). Ask your administrator.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)
          : data?.integrations.map((i) => {
              const meta = TOOLKIT_META[i.toolkit]!;
              const logo = LOGOS[i.toolkit];
              return (
                <Card key={i.toolkit} className="flex flex-col p-5">
                  <div className="flex items-start justify-between">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white ${logo.bg}`}>{logo.letter}</span>
                    {i.status === 'CONNECTED' ? (
                      <Badge variant="success">
                        <CheckCircle2 /> Connected
                      </Badge>
                    ) : i.status === 'PENDING' ? (
                      <Badge variant="warning">
                        <Clock /> Waiting…
                      </Badge>
                    ) : i.status === 'ERROR' ? (
                      <Badge variant="destructive">Failed</Badge>
                    ) : null}
                  </div>
                  <h3 className="mt-4 font-semibold">{meta.name}</h3>
                  <p className="mt-1 flex-1 text-sm text-muted-foreground">{meta.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {i.status === 'CONNECTED' ? (
                      <>
                        {(i.toolkit === 'googlesheets' || i.toolkit === 'googlecalendar') && (
                          <Button size="sm" variant="outline" onClick={() => setSettingsFor(i)}>
                            <Settings2 /> {i.toolkit === 'googlesheets' && !i.settings.sheetId ? 'Choose sheet' : 'Settings'}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => disconnect.mutate(i.toolkit)} loading={disconnect.isPending && disconnect.variables === i.toolkit}>
                          <Unplug /> Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => connect.mutate(i.toolkit)}
                        loading={connect.isPending && connect.variables === i.toolkit}
                        disabled={!i.configured || !data?.enabled}
                      >
                        {i.status === 'PENDING' ? <Loader2 className="animate-spin" /> : <Link2 />}
                        {i.status === 'PENDING' ? 'Retry connect' : 'Connect'}
                      </Button>
                    )}
                  </div>
                  {!i.configured && <p className="mt-2 text-xs text-muted-foreground">Not available on this server yet.</p>}
                </Card>
              );
            })}
      </div>

      <Card className="mt-8 max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" /> Request a tool
          </CardTitle>
          <CardDescription>Need Shopify, Zoho, Razorpay, Calendly or something else? Tell us what you’d use it for.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Tool name">
            <Input value={request.toolName} onChange={(e) => setRequest({ ...request, toolName: e.target.value })} placeholder="e.g. Shopify" />
          </Field>
          <Field label="What should the agent do with it?">
            <Textarea value={request.useCase} onChange={(e) => setRequest({ ...request, useCase: e.target.value })} placeholder="Check order status when customers ask where their order is." />
          </Field>
          <Button onClick={() => submitRequest.mutate(undefined)} loading={submitRequest.isPending} disabled={request.toolName.length < 2 || request.useCase.length < 5}>
            Submit request
          </Button>
        </CardContent>
      </Card>
      {settingsFor && <SettingsDialog integration={settingsFor} onClose={() => setSettingsFor(null)} />}
    </>
  );
}

export default function IntegrationsPage() {
  return (
    <div>
      <PageHeader title="Integrations" description="Connect Google apps so your agent can book, log leads, email and look things up. Secure OAuth via Composio." />
      <Suspense>
        <Integrations />
      </Suspense>
    </div>
  );
}
