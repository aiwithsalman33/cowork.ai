'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Search } from 'lucide-react';
import { SKILL_CATEGORIES, TOOL_NAMES, type SkillUpsertInput } from '@partner/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SkillIcon } from '@/components/skill-icon';
import { get, post, put } from '@/lib/api';
import { useAction } from '@/lib/hooks';

type AdminSkill = SkillUpsertInput & { id: string; isBuiltin: boolean; activeUsers: number };

const EMPTY: SkillUpsertInput = {
  slug: '',
  name: '',
  description: '',
  category: 'Customer Support',
  icon: 'sparkles',
  promptFragment: '',
  tools: [],
  isPublic: false,
};

function SkillEditor({ skill, onClose }: { skill: AdminSkill | null; onClose: () => void }) {
  const [form, setForm] = useState<SkillUpsertInput>(skill ? { ...skill } : EMPTY);
  const save = useAction(() => (skill ? put(`/admin/skills/${skill.id}`, form) : post('/admin/skills', form)), {
    success: skill ? 'Skill updated' : 'Skill created',
    invalidate: [['admin-skills']],
    onSuccess: onClose,
  });
  const set = <K extends keyof SkillUpsertInput>(k: K, v: SkillUpsertInput[K]) => setForm({ ...form, [k]: v });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{skill ? `Edit ${skill.name}` : 'New skill'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Slug">
            <Input value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className="font-mono" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onValueChange={(v) => set('category', v as SkillUpsertInput['category'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SKILL_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Icon (lucide name)" hint="e.g. calendar-check, gift, truck">
            <div className="flex items-center gap-2">
              <Input value={form.icon} onChange={(e) => set('icon', e.target.value)} className="font-mono" />
              <SkillIcon name={form.icon} className="h-5 w-5 shrink-0 text-primary" />
            </div>
          </Field>
        </div>
        <Field label="Description">
          <Input value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="System prompt fragment">
          <Textarea value={form.promptFragment} onChange={(e) => set('promptFragment', e.target.value)} className="min-h-[140px]" />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium">Tools</p>
          <div className="flex flex-wrap gap-2">
            {TOOL_NAMES.map((t) => {
              const on = form.tools.includes(t);
              return (
                <button key={t} className="cursor-pointer" onClick={() => set('tools', on ? form.tools.filter((x) => x !== t) : [...form.tools, t])}>
                  <Badge variant={on ? 'default' : 'outline'}>{t}</Badge>
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.isPublic} onCheckedChange={(v) => set('isPublic', v)} /> Published (visible to all tenants)
        </label>
        <DialogFooter>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminSkills() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-skills'], queryFn: () => get<{ skills: AdminSkill[] }>('/admin/skills') });
  const [editing, setEditing] = useState<AdminSkill | null | 'new'>(null);
  const [q, setQ] = useState('');
  const publish = useAction((s: AdminSkill) => put(`/admin/skills/${s.id}`, { ...s, isPublic: !s.isPublic }), { invalidate: [['admin-skills']] });
  const list = (data?.skills ?? []).filter((s) => !q || `${s.name} ${s.slug} ${s.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Skill library"
        description="Global skills available to every tenant."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New skill
          </Button>
        }
      />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills" className="pl-9" />
      </div>
      {isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <Card className="divide-y">
          {list.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <SkillIcon name={s.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {s.name} <code className="text-xs font-normal text-muted-foreground">{s.slug}</code>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {s.category} · {s.activeUsers} tenants using · {s.tools.length ? s.tools.join(', ') : 'no tools'}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={s.isPublic} onCheckedChange={() => publish.mutate(s)} />
                {s.isPublic ? 'Published' : 'Draft'}
              </label>
              <Button variant="ghost" size="icon" onClick={() => setEditing(s)} aria-label="Edit">
                <Pencil />
              </Button>
            </div>
          ))}
        </Card>
      )}
      {editing && <SkillEditor skill={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
