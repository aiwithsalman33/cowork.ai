'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn } from '@/lib/utils';

type Template = {
  id: string;
  name: string;
  language: string;
  status: string;
  header: string | null;
  body: string;
  footer: string | null;
  variables: number;
};

export function SendTemplateDialog({
  conversationId,
  channelId,
  onClose,
  onSent,
}: {
  conversationId: string;
  channelId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { data, error } = useQuery({
    queryKey: ['templates', channelId],
    queryFn: () => get<{ templates: Template[] }>(`/channels/${channelId}/templates`),
    retry: false,
  });
  const [picked, setPicked] = useState<Template | null>(null);
  const [values, setValues] = useState<string[]>([]);
  const send = useAction(
    (t: Template) =>
      post(`/conversations/${conversationId}/template`, {
        templateId: t.id,
        params: values.map((v) => v.trim()),
      }),
    {
      success: 'Template sent',
      onSuccess: () => {
        onSent();
        onClose();
      },
    },
  );
  const approved = data?.templates.filter((t) => t.status === 'APPROVED') ?? [];
  const preview = picked?.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n: string) => values[Number(n) - 1] || m);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a template</DialogTitle>
          <DialogDescription>Only templates approved by Meta can be sent.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error.message}</p>
        ) : !data ? (
          <Skeleton className="h-32" />
        ) : !approved.length ? (
          <p className="text-sm text-muted-foreground">
            No approved templates yet. Sync them in{' '}
            <Link href="/integrations?tab=channels" className="font-medium text-primary underline">
              Integrations → Channels → Templates
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4">
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {approved.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={picked?.id === t.id}
                  onClick={() => {
                    setPicked(t);
                    setValues(Array.from({ length: t.variables }, () => ''));
                  }}
                  className={cn(
                    'w-full cursor-pointer rounded-lg border p-3 text-left hover:bg-accent',
                    picked?.id === t.id && 'border-primary bg-primary-soft',
                  )}
                >
                  <div className="text-sm font-medium">
                    {t.name} <span className="text-xs font-normal text-muted-foreground">{t.language}</span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{t.body}</p>
                </button>
              ))}
            </div>
            {picked && (
              <>
                {values.map((v, i) => (
                  <Field key={i} label={`Value for {{${i + 1}}}`} htmlFor={`tpl-${i}`}>
                    <Input
                      id={`tpl-${i}`}
                      value={v}
                      onChange={(e) => setValues(values.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                  </Field>
                ))}
                <div className="whitespace-pre-wrap break-words rounded-lg bg-primary-soft p-3 text-sm">
                  {[picked.header, preview, picked.footer].filter(Boolean).join('\n')}
                </div>
                <Button
                  className="w-full"
                  loading={send.isPending}
                  disabled={values.some((v) => !v.trim())}
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
