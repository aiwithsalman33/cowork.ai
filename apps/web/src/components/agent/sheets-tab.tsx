'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, ExternalLink, Eye, Plus, Sheet, Trash2, UserPlus } from 'lucide-react';
import type { AgentSheetDTO, AgentSheetInput, GoogleStatusDTO } from '@partner/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { del, get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn } from '@/lib/utils';

const EMPTY: AgentSheetInput = { sheet: '', name: '', description: '', purpose: 'LOOKUP', tab: '' };

function Preview({ sheet, onClose }: { sheet: AgentSheetDTO; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sheet-preview', sheet.id],
    queryFn: () => get<{ rows: string[][] }>(`/sheets/${sheet.id}/preview`),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{sheet.name} — preview</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : !data?.rows.length ? (
          <p className="text-sm text-muted-foreground">This sheet is empty.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className={cn('border-b last:border-0', i === 0 && 'bg-muted font-semibold')}>
                    {r.map((c, j) => (
                      <td key={j} className="whitespace-nowrap px-3 py-2">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SheetsTab() {
  const google = useQuery({
    queryKey: ['google'],
    queryFn: () => get<GoogleStatusDTO>('/integrations/google'),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['sheets'],
    queryFn: () => get<{ sheets: AgentSheetDTO[] }>('/sheets'),
  });
  const [form, setForm] = useState<AgentSheetInput>(EMPTY);
  const [preview, setPreview] = useState<AgentSheetDTO | null>(null);

  const add = useAction(() => post('/sheets', { ...form, tab: form.tab || undefined }), {
    success: 'Sheet added — your agent can use it now',
    invalidate: [['sheets']],
    onSuccess: () => setForm(EMPTY),
  });
  const remove = useAction((id: string) => del(`/sheets/${id}`), {
    success: 'Sheet removed',
    invalidate: [['sheets']],
  });

  if (google.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  const sheetsReady = google.data?.connected && google.data.services.includes('googlesheets');

  if (!sheetsReady) {
    return (
      <EmptyState
        icon={Sheet}
        title="Connect Google Sheets first"
        description="Add your Google Cloud credentials and connect your Google account with Sheets access on the Integrations page."
        action={
          <Button asChild>
            <Link href="/integrations">Go to Integrations</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Add a Google Sheet</CardTitle>
          <CardDescription>
            Connected as {google.data?.email}. The sheet must be accessible to this account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['LOOKUP', BookOpenCheck, 'Agent reads it', 'Price list, stock, menu, timings…'],
                ['LEADS', UserPlus, 'Log leads here', 'Each captured lead becomes a new row'],
              ] as const
            ).map(([purpose, Icon, title, text]) => (
              <button
                key={purpose}
                onClick={() => setForm({ ...form, purpose })}
                className={cn(
                  'cursor-pointer rounded-lg border p-3 text-left transition-colors',
                  form.purpose === purpose
                    ? 'border-primary bg-primary-soft/40 ring-1 ring-primary'
                    : 'hover:bg-accent',
                )}
              >
                <Icon className="mb-1 h-4 w-4 text-primary" />
                <div className="text-sm font-medium">{title}</div>
                <div className="text-xs text-muted-foreground">{text}</div>
              </button>
            ))}
          </div>
          <Field label="Google Sheet link">
            <Input
              value={form.sheet}
              onChange={(e) => setForm({ ...form, sheet: e.target.value })}
              placeholder="https://docs.google.com/spreadsheets/d/…"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name the agent will use">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={form.purpose === 'LEADS' ? 'Leads' : 'Price list'}
              />
            </Field>
            <Field label="Tab (optional)" hint="Defaults to the first tab">
              <Input
                value={form.tab ?? ''}
                onChange={(e) => setForm({ ...form, tab: e.target.value })}
                placeholder="Sheet1"
              />
            </Field>
          </div>
          {form.purpose === 'LOOKUP' ? (
            <Field label="What’s in it? (helps the agent decide when to look)">
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="All sweets with price per kg and current stock. Use for price and availability questions."
              />
            </Field>
          ) : (
            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              Columns written: Date · Name · Phone · Email · Interest · Notes · Channel. Add a header row with
              these names for a tidy sheet.
            </p>
          )}
          <Button
            onClick={() => add.mutate(undefined)}
            loading={add.isPending}
            disabled={form.sheet.length < 10 || form.name.length < 2}
          >
            <Plus /> Add sheet
          </Button>
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-3 font-semibold">Sheets your agent uses</h3>
        {isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : !data?.sheets.length ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No sheets yet. Add a price list or stock sheet so the agent answers with live data.
          </div>
        ) : (
          <div className="space-y-3">
            {data.sheets.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white">
                      <Sheet className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        {s.name}
                        <Badge variant={s.purpose === 'LEADS' ? 'default' : 'secondary'}>
                          {s.purpose === 'LEADS' ? 'Logs leads' : 'Agent reads'}
                        </Badge>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {s.title}
                        {s.tab ? ` · ${s.tab}` : ''}
                      </div>
                      {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPreview(s)}>
                    <Eye /> Preview
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      <ExternalLink /> Open
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => remove.mutate(s.id)}
                  >
                    <Trash2 /> Remove
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {preview && <Preview sheet={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
