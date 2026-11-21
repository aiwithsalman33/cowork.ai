'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, KeyRound, Lock, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { PROVIDERS, PROVIDER_IDS, type ApiKeyDTO, type ProviderId } from '@partner/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { del, get, post, put } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn } from '@/lib/utils';

type KeysRes = { keys: ApiKeyDTO[]; active: { provider: string | null; model: string | null } };
const CUSTOM = '__custom__';

export function ApiKeysTab() {
  const { data, isLoading } = useQuery({ queryKey: ['keys'], queryFn: () => get<KeysRes>('/keys') });
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [model, setModel] = useState(PROVIDERS.openai.models[0]!.id);
  const [customModel, setCustomModel] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (data?.active.provider) {
      const p = data.active.provider as ProviderId;
      setProvider(p);
      const m = data.active.model ?? PROVIDERS[p].models[0]!.id;
      if (PROVIDERS[p].models.some((x) => x.id === m)) setModel(m);
      else {
        setModel(CUSTOM);
        setCustomModel(m);
      }
    }
  }, [data?.active.provider, data?.active.model]);

  const existing = data?.keys.find((k) => k.provider === provider);
  const p = PROVIDERS[provider];
  const selectedModel = model === CUSTOM ? customModel.trim() : model;
  const modelDef = p.models.find((m) => m.id === model);

  const save = useAction(
    () => put('/keys', { provider, model: selectedModel, apiKey: apiKey || undefined, makeActive: true }),
    { success: 'Saved — encrypted and set as active', invalidate: [['keys'], ['dashboard']], onSuccess: () => setApiKey('') },
  );
  const remove = useAction((prov: string) => del(`/keys/${prov}`), { success: 'Key removed', invalidate: [['keys'], ['dashboard']] });
  const test = useAction((prov: string) => post<{ ok: boolean; latencyMs?: number; error?: string }>('/keys/test', { provider: prov }), {
    onSuccess: (r) => (r.ok ? toast.success(`Key works · ${r.latencyMs} ms`) : toast.error(r.error ?? 'Key test failed')),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Bring your own AI key</CardTitle>
          <CardDescription>You pay your AI provider directly. Keys are encrypted with AES-256-GCM and never shown again.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium">Provider</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROVIDER_IDS.map((id) => {
                const has = data?.keys.some((k) => k.provider === id);
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setProvider(id);
                      setModel(PROVIDERS[id].models[0]!.id);
                      setApiKey('');
                    }}
                    className={cn(
                      'relative cursor-pointer rounded-lg border p-3 text-left text-sm font-medium transition-colors',
                      provider === id ? 'border-primary bg-primary-soft/50 ring-1 ring-primary' : 'hover:bg-accent',
                    )}
                  >
                    {PROVIDERS[id].name}
                    {has && <CheckCircle2 className="absolute right-2 top-2 h-3.5 w-3.5 text-success" />}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Model" hint={modelDef ? `${modelDef.cost} · ${modelDef.hint} (price tier is approximate — check ${p.name} pricing)` : 'Type the exact model id from your provider'}>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {p.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label} <span className="text-muted-foreground">· {m.cost}</span>
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>Other model…</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {model === CUSTOM && (
            <Field label="Custom model id">
              <Input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="e.g. gpt-4.1-nano" />
            </Field>
          )}

          <Field
            label="API key"
            hint={
              <a href={p.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                Get a {p.name} key <ExternalLink className="h-3 w-3" />
              </a>
            }
          >
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={existing ? `Saved key ••••${existing.last4} — leave blank to keep` : `${p.keyPrefix ?? ''}…`}
                className="pl-9 font-mono"
              />
            </div>
          </Field>

          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!selectedModel || (!apiKey && !existing)}>
            <KeyRound /> Save & use this model
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="font-semibold">Saved keys</h3>
        {isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : !data?.keys.length ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No keys yet. Your agent needs one to reply.
          </div>
        ) : (
          data.keys.map((k) => (
            <Card key={k.provider} className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {PROVIDERS[k.provider].name}
                  {k.isActive && <Badge variant="success">Active</Badge>}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  ••••{k.last4} · {k.model}
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" loading={test.isPending && test.variables === k.provider} onClick={() => test.mutate(k.provider)}>
                  <Zap /> Test
                </Button>
                <Button variant="ghost" size="icon" aria-label="Remove key" onClick={() => remove.mutate(k.provider)}>
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
