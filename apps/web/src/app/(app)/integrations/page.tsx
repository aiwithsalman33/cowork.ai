'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  KeyRound,
  Link2,
  Settings2,
  Sheet,
  Unplug,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { TOOLKITS, TOOLKIT_META, type GoogleStatusDTO, type Toolkit } from '@partner/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { CopyField } from '@/components/copy-field';
import { del, get, post, put } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn } from '@/lib/utils';

type Status = GoogleStatusDTO & { enabled: boolean };

const LOGOS: Record<Toolkit, { bg: string; letter: string }> = {
  gmail: { bg: 'bg-red-500', letter: 'M' },
  googlecalendar: { bg: 'bg-blue-500', letter: '31' },
  googlesheets: { bg: 'bg-green-600', letter: '⊞' },
  googledrive: { bg: 'bg-amber-500', letter: '▲' },
  googledocs: { bg: 'bg-sky-600', letter: '≡' },
};

const API_NAMES: Record<Toolkit, string> = {
  gmail: 'Gmail API',
  googlecalendar: 'Google Calendar API',
  googlesheets: 'Google Sheets API',
  googledrive: 'Google Drive API',
  googledocs: 'Google Docs API',
};

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            done ? 'bg-success text-white' : 'bg-primary-soft text-primary',
          )}
        >
          {done ? <CheckCircle2 className="h-4 w-4" /> : n}
        </span>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function SetupGuide({ redirectUri }: { redirectUri: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border bg-muted/40">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left text-sm font-medium"
      >
        How to create your Google Cloud credentials (5 minutes)
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="list-decimal space-y-2 px-4 pb-4 pl-9 text-sm text-muted-foreground">
          <li>
            Open{' '}
            <a
              className="text-primary hover:underline"
              href="https://console.cloud.google.com/projectcreate"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud Console
            </a>{' '}
            and create a project (any name).
          </li>
          <li>
            Go to <b>APIs &amp; Services → Library</b> and enable the APIs you need:{' '}
            {Object.values(API_NAMES).join(', ')}.
          </li>
          <li>
            <b>OAuth consent screen</b>: choose <i>External</i>, fill app name and your email, and add your
            own Gmail as a<i> Test user</i>. Then click <b>Publish app</b> — in “Testing” mode Google expires
            the connection every 7 days.
          </li>
          <li>
            <b>Credentials → Create credentials → OAuth client ID → Web application</b>. Under{' '}
            <i>Authorized redirect URIs</i> add exactly:
            <div className="mt-2">
              <CopyField label="Authorized redirect URI" value={redirectUri} />
            </div>
          </li>
          <li>Copy the Client ID and Client secret into the form below.</li>
        </ol>
      )}
    </div>
  );
}

function Integrations() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const router = useRouter();
  const [creds, setCreds] = useState({ clientId: '', clientSecret: '' });
  const [editCreds, setEditCreds] = useState(false);
  const [services, setServices] = useState<Toolkit[]>(['googlesheets', 'googlecalendar', 'gmail']);
  const [calendarId, setCalendarId] = useState('');
  const [request, setRequest] = useState({ toolName: '', useCase: '' });
  const { data, isLoading } = useQuery({
    queryKey: ['google'],
    queryFn: () => get<Status>('/integrations/google'),
  });

  useEffect(() => {
    if (data?.connected && data.services.length) setServices(data.services);
    if (data?.settings.calendarId) setCalendarId(data.settings.calendarId);
  }, [data?.connected, data?.services, data?.settings.calendarId]);

  // Returning from Google's consent screen
  useEffect(() => {
    const result = params.get('google');
    if (!result) return;
    if (result === 'connected') toast.success('Google account connected');
    else toast.error(params.get('reason') ?? 'Google connection failed');
    qc.invalidateQueries({ queryKey: ['google'] });
    router.replace('/integrations');
  }, [params, qc, router]);

  const saveCreds = useAction(() => put('/integrations/google/credentials', creds), {
    success: 'Credentials saved (encrypted)',
    invalidate: [['google']],
    onSuccess: () => {
      setCreds({ clientId: '', clientSecret: '' });
      setEditCreds(false);
    },
  });
  const connect = useAction(() => post<{ url: string }>('/integrations/google/connect', { services }), {
    onSuccess: (r) => (window.location.href = r.url),
  });
  const disconnect = useAction(() => del('/integrations/google'), {
    success: 'Google disconnected',
    invalidate: [['google'], ['sheets']],
  });
  const saveSettings = useAction(() => put('/integrations/google/settings', { calendarId }), {
    success: 'Saved',
    invalidate: [['google']],
  });
  const submitRequest = useAction(() => post('/integration-requests', request), {
    success: 'Thanks! We’ll let you know when it’s available.',
    onSuccess: () => setRequest({ toolName: '', useCase: '' }),
  });

  if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />;
  const showCredForm = !data.credentialsSaved || editCreds;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        {!data.enabled && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
            Google integrations are currently disabled by the administrator.
          </div>
        )}

        <Step n={1} title="Your Google Cloud credentials" done={data.credentialsSaved}>
          <p className="text-sm text-muted-foreground">
            You connect with <b>your own</b> Google Cloud OAuth app, so your data stays between you and
            Google.
          </p>
          <SetupGuide redirectUri={data.redirectUri} />
          {showCredForm ? (
            <div className="space-y-3">
              <Field label="Client ID">
                <Input
                  value={creds.clientId}
                  onChange={(e) => setCreds({ ...creds, clientId: e.target.value })}
                  placeholder="1234567890-abc123.apps.googleusercontent.com"
                  className="font-mono"
                />
              </Field>
              <Field label="Client secret">
                <Input
                  type="password"
                  autoComplete="off"
                  value={creds.clientSecret}
                  onChange={(e) => setCreds({ ...creds, clientSecret: e.target.value })}
                  placeholder="GOCSPX-…"
                  className="font-mono"
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  onClick={() => saveCreds.mutate(undefined)}
                  loading={saveCreds.isPending}
                  disabled={!creds.clientId || !creds.clientSecret}
                >
                  <KeyRound /> Save credentials
                </Button>
                {data.credentialsSaved && (
                  <Button variant="ghost" onClick={() => setEditCreds(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="font-mono text-muted-foreground">{data.clientIdHint}</span>
              <Button variant="ghost" size="sm" onClick={() => setEditCreds(true)}>
                Change
              </Button>
            </div>
          )}
        </Step>

        <Step n={2} title="Choose services & connect your Google account" done={data.connected}>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOOLKITS.map((t) => {
              const on = services.includes(t);
              const granted = data.services.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => setServices(on ? services.filter((s) => s !== t) : [...services, t])}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                    on ? 'border-primary bg-primary-soft/40' : 'hover:bg-accent',
                  )}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${LOGOS[t].bg}`}
                  >
                    {LOGOS[t].letter}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {TOOLKIT_META[t]!.name}
                      {granted && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {TOOLKIT_META[t]!.description}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    readOnly
                    checked={on}
                    className="accent-[var(--primary)]"
                    aria-label={TOOLKIT_META[t]!.name}
                  />
                </button>
              );
            })}
          </div>
          {data.status === 'ERROR' && data.lastError && (
            <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {data.lastError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => connect.mutate(undefined)}
              loading={connect.isPending}
              disabled={!data.credentialsSaved || !services.length || !data.enabled}
            >
              <Link2 /> {data.connected ? 'Update permissions' : 'Connect Google account'}
            </Button>
            {data.connected && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => disconnect.mutate(undefined)}
                loading={disconnect.isPending}
              >
                <Unplug /> Disconnect
              </Button>
            )}
          </div>
          {!data.credentialsSaved && (
            <p className="text-xs text-muted-foreground">Save your credentials in step 1 first.</p>
          )}
        </Step>

        {data.connected && (
          <Step n={3} title="Connected" done>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="success">
                <CheckCircle2 /> {data.email ?? 'Google account'}
              </Badge>
              {data.services.map((s) => (
                <Badge key={s} variant="secondary">
                  {TOOLKIT_META[s]!.name}
                </Badge>
              ))}
            </div>
            {data.services.includes('googlesheets') && (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <span className="flex items-center gap-2">
                  <Sheet className="h-4 w-4 text-green-600" /> Choose which sheets your agent reads and where
                  it logs leads.
                </span>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/agent?tab=sheets">Manage sheets</Link>
                </Button>
              </div>
            )}
            {data.services.includes('googlecalendar') && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Field label="Calendar for appointments" hint="Leave empty to use your primary calendar.">
                    <Input
                      value={calendarId}
                      onChange={(e) => setCalendarId(e.target.value)}
                      placeholder="primary"
                    />
                  </Field>
                </div>
                <Button
                  variant="outline"
                  onClick={() => saveSettings.mutate(undefined)}
                  loading={saveSettings.isPending}
                >
                  <Settings2 /> Save
                </Button>
              </div>
            )}
          </Step>
        )}
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>What your agent can do</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              [
                'googlesheets',
                'Read price lists, stock or menus from your sheets, and log every lead as a new row.',
              ],
              ['googlecalendar', 'Put AI-booked appointments straight into your calendar.'],
              ['gmail', 'Email booking confirmations and quotes to customers.'],
              ['googledrive', 'Search your Drive for documents to answer detailed questions.'],
              ['googledocs', 'Read policy or product documents when asked.'],
            ].map(([t, text]) => (
              <div key={t} className="flex gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white ${LOGOS[t as Toolkit].bg}`}
                >
                  {LOGOS[t as Toolkit].letter}
                </span>
                <p className="text-muted-foreground">{text}</p>
              </div>
            ))}
            <a
              href="https://support.google.com/cloud/answer/6158849"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 pt-1 text-xs text-primary hover:underline"
            >
              Google’s guide to OAuth clients <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" /> Request a tool
            </CardTitle>
            <CardDescription>
              Need Shopify, Zoho, Calendly or something else? Tell us what you’d use it for.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Tool name">
              <Input
                value={request.toolName}
                onChange={(e) => setRequest({ ...request, toolName: e.target.value })}
                placeholder="e.g. Shopify"
              />
            </Field>
            <Field label="What should the agent do with it?">
              <Textarea
                value={request.useCase}
                onChange={(e) => setRequest({ ...request, useCase: e.target.value })}
                placeholder="Check order status when customers ask where their order is."
              />
            </Field>
            <Button
              onClick={() => submitRequest.mutate(undefined)}
              loading={submitRequest.isPending}
              disabled={request.toolName.length < 2 || request.useCase.length < 5}
            >
              Submit request
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect Google with your own Google Cloud credentials so your agent can use Sheets, Calendar, Gmail, Drive and Docs."
      />
      <Suspense>
        <Integrations />
      </Suspense>
    </div>
  );
}
