'use client';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Sparkles, Trash2, Wrench } from 'lucide-react';
import { SKILL_CATEGORIES, type SkillDTO } from '@partner/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { SkillIcon } from '@/components/skill-icon';
import { del, get, put } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn } from '@/lib/utils';

export function useSkills() {
  return useQuery({
    queryKey: ['skills'],
    queryFn: () => get<{ skills: SkillDTO[] }>('/skills').then((r) => r.skills),
  });
}

const TOOL_LABEL: Record<string, string> = {
  book_appointment: 'Books appointments',
  capture_lead: 'Saves leads',
  send_email: 'Sends email',
  search_drive: 'Searches Drive',
  read_doc: 'Reads Docs',
};

export function SkillCard({
  skill,
  onToggle,
  pending,
}: {
  skill: SkillDTO;
  onToggle: (v: boolean) => void;
  pending?: boolean;
}) {
  const remove = useAction(() => del(`/skills/${skill.id}`), {
    success: 'Skill deleted',
    invalidate: [['skills']],
  });
  return (
    <Card
      className={cn(
        'flex flex-col gap-3 p-4 transition-colors',
        skill.enabled && 'border-primary/40 bg-primary-soft/20',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              skill.enabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            <SkillIcon name={skill.icon} />
          </span>
          <div>
            <div className="flex items-center gap-2 font-medium leading-tight">
              {skill.name}
              {skill.isCustom && <Badge variant="outline">Custom</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">{skill.category}</div>
          </div>
        </div>
        <Switch
          checked={skill.enabled}
          disabled={pending}
          onCheckedChange={onToggle}
          aria-label={`Toggle ${skill.name}`}
        />
      </div>
      <p className="text-sm text-muted-foreground">{skill.description}</p>
      {(skill.tools.length > 0 || skill.isCustom) && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {skill.tools.map((t) => (
            <Badge key={t} variant="secondary">
              <Wrench /> {TOOL_LABEL[t] ?? t}
            </Badge>
          ))}
          {skill.isCustom && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-destructive"
              loading={remove.isPending}
              onClick={() => remove.mutate(undefined)}
            >
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function SkillsTab() {
  const { data: skills, isLoading } = useSkills();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [onlyEnabled, setOnlyEnabled] = useState(false);

  const toggle = useAction(
    ({ id, enabled }: { id: string; enabled: boolean }) => put(`/skills/${id}`, { enabled }),
    {
      invalidate: [['dashboard']],
      onSuccess: () => qc.invalidateQueries({ queryKey: ['skills'] }),
    },
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (skills ?? []).filter(
      (s) =>
        (category === 'All' || s.category === category) &&
        (!onlyEnabled || s.enabled) &&
        (!term || s.name.toLowerCase().includes(term) || s.description.toLowerCase().includes(term)),
    );
  }, [skills, q, category, onlyEnabled]);

  const grouped = useMemo(() => {
    const m = new Map<string, SkillDTO[]>();
    for (const s of filtered) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    return [...m.entries()].sort(
      (a, b) => SKILL_CATEGORIES.indexOf(a[0] as never) - SKILL_CATEGORIES.indexOf(b[0] as never),
    );
  }, [filtered]);

  const enabledCount = skills?.filter((s) => s.enabled).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search skills…"
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyEnabled} onCheckedChange={setOnlyEnabled} /> Enabled only ({enabledCount})
        </label>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {['All', ...SKILL_CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors',
              category === c
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card hover:bg-accent',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No skills match"
          description="Try a different search or category."
        />
      ) : (
        grouped.map(([cat, list]) => (
          <section key={cat}>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{cat}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((s) => (
                <SkillCard
                  key={s.id}
                  skill={s}
                  pending={toggle.isPending && toggle.variables?.id === s.id}
                  onToggle={(enabled) => toggle.mutate({ id: s.id, enabled })}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
