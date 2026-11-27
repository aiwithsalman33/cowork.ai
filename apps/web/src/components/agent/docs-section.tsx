'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileText, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { GoogleStatusDTO } from '@cowork/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import { del, get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';

type AgentDoc = { id: string; fileId: string; name: string; createdAt: string };

/** Google Docs the agent may read. Nothing else in Drive is reachable (audit C2). */
export function DocsSection() {
  const google = useQuery({
    queryKey: ['google'],
    queryFn: () => get<GoogleStatusDTO>('/integrations/google'),
  });
  const ready = !!google.data?.connected && google.data.services.includes('googledocs');
  const { data, isLoading } = useQuery({
    queryKey: ['agent-docs'],
    queryFn: () => get<{ docs: AgentDoc[] }>('/docs'),
    enabled: ready,
  });
  const [doc, setDoc] = useState('');
  const add = useAction(() => post('/docs', { doc: doc.trim() }), {
    success: 'Document added — your agent can read it now',
    invalidate: [['agent-docs']],
    onSuccess: () => setDoc(''),
  });
  const remove = useAction((id: string) => del(`/docs/${id}`), {
    success: 'Document removed',
    invalidate: [['agent-docs']],
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> Documents
        </CardTitle>
        <CardDescription>
          Google Docs your agent may read to answer customers, such as policies or a menu. It cannot see any
          other file in your Drive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {google.isLoading ? (
          <Skeleton className="h-20" />
        ) : !ready ? (
          <p className="text-sm text-muted-foreground">
            Connect Google with <b>Docs</b> access on the{' '}
            <Link href="/integrations?tab=google" className="font-medium text-primary underline">
              Integrations page
            </Link>{' '}
            first.
          </p>
        ) : (
          <>
            {isLoading ? (
              <Skeleton className="h-12" />
            ) : !data?.docs.length ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No documents yet. Until you add one, the agent does not read any documents.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <Button size="sm" variant="ghost" asChild>
                      <a
                        href={`https://docs.google.com/document/d/${d.fileId}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${d.name}`}
                      >
                        <ExternalLink />
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => remove.mutate(d.id)}
                      aria-label={`Remove ${d.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Field label="Add a Google Doc" htmlFor="agent-doc">
              <div className="flex gap-2">
                <Input
                  id="agent-doc"
                  value={doc}
                  onChange={(e) => setDoc(e.target.value)}
                  placeholder="https://docs.google.com/document/d/…"
                />
                <Button
                  onClick={() => add.mutate(undefined)}
                  loading={add.isPending}
                  disabled={doc.trim().length < 10}
                >
                  <Plus /> Add
                </Button>
              </div>
            </Field>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Up to 50 documents. Remove one any time.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
