'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { PLAN_IDS, type PlanId } from '@cowork/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { del, get, put } from '@/lib/api';
import { useAction } from '@/lib/hooks';

type Flag = { key: string; description: string; enabled: boolean; plans: PlanId[] };

export default function AdminFlags() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-flags'],
    queryFn: () => get<{ flags: Flag[] }>('/admin/flags'),
  });
  const [key, setKey] = useState('');
  const [desc, setDesc] = useState('');
  const save = useAction((f: Flag) => put(`/admin/flags/${f.key}`, f), { invalidate: [['admin-flags']] });
  const remove = useAction((k: string) => del(`/admin/flags/${k}`), {
    success: 'Flag deleted',
    invalidate: [['admin-flags']],
  });

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Feature flags"
        description="Turn features on or off globally, or limit them to specific plans."
      />
      <Card className="mb-6 flex flex-col gap-2 p-4 sm:flex-row">
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '_'))}
          placeholder="flag_key"
          className="font-mono sm:w-56"
        />
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" />
        <Button
          disabled={key.length < 2}
          onClick={() => {
            save.mutate({ key, description: desc, enabled: false, plans: [] });
            setKey('');
            setDesc('');
          }}
        >
          <Plus /> Add
        </Button>
      </Card>
      {isLoading ? (
        <Skeleton className="h-60 rounded-xl" />
      ) : (
        <Card className="divide-y">
          {data?.flags.map((f) => (
            <div key={f.key} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
              <Switch
                checked={f.enabled}
                onCheckedChange={(v) => save.mutate({ ...f, enabled: v })}
                aria-label={`Toggle ${f.key}`}
              />
              <div className="min-w-0 flex-1">
                <code className="text-sm font-semibold">{f.key}</code>
                <p className="text-xs text-muted-foreground">{f.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Plans:</span>
                {PLAN_IDS.map((p) => {
                  const on = f.plans.includes(p);
                  return (
                    <button
                      key={p}
                      className="cursor-pointer"
                      onClick={() =>
                        save.mutate({ ...f, plans: on ? f.plans.filter((x) => x !== p) : [...f.plans, p] })
                      }
                    >
                      <Badge variant={on ? 'default' : 'outline'}>{p}</Badge>
                    </button>
                  );
                })}
                {!f.plans.length && <span className="text-xs text-muted-foreground">(all)</span>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove.mutate(f.key)}
                aria-label="Delete flag"
              >
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
