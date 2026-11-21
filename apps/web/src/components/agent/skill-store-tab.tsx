'use client';
import { useState } from 'react';
import { Lightbulb, Sparkles, Wand2 } from 'lucide-react';
import { SKILL_CATEGORIES, TOOL_NAMES, type SkillUpsertInput } from '@partner/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SkillIcon } from '@/components/skill-icon';
import { post, put } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useSkills, SkillCard } from './skills-tab';

const IDEAS = [
  'When someone asks about bulk or wholesale orders, collect quantity, delivery city and GST number, then save it as a lead.',
  'Remind customers that we offer free home delivery above ₹999 whenever they ask about delivery or shipping.',
  'If a customer mentions a birthday or anniversary, congratulate them and offer our 10% celebration discount.',
  'For tuition enquiries, ask the student’s class, subjects and preferred batch timing, then book a free demo class.',
];

export function SkillStoreTab() {
  const { data: skills } = useSkills();
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<SkillUpsertInput | null>(null);

  const generate = useAction((d: string) => post<{ draft: SkillUpsertInput }>('/skills/generate', { description: d }), {
    onSuccess: (r) => setDraft(r.draft),
  });
  const save = useAction((d: SkillUpsertInput) => post('/skills', d), {
    success: 'Skill created and enabled',
    invalidate: [['skills'], ['dashboard']],
    onSuccess: () => {
      setDraft(null);
      setDescription('');
    },
  });

  const toggle = useAction(({ id, enabled }: { id: string; enabled: boolean }) => put(`/skills/${id}`, { enabled }), {
    invalidate: [['skills'], ['dashboard']],
  });
  const custom = skills?.filter((s) => s.isCustom) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="hero-gradient p-5 text-white">
            <div className="flex items-center gap-2 text-sm font-medium text-white/80">
              <Wand2 className="h-4 w-4" /> AI Skill Creator
            </div>
            <h3 className="mt-1 font-display text-xl font-semibold">Describe a behaviour. We’ll turn it into a skill.</h3>
          </div>
          <CardContent className="space-y-4 pt-5">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. When customers ask for a discount, offer 5% off on orders above ₹2,000 and collect their phone number."
              className="min-h-[120px]"
              maxLength={2000}
            />
            <div className="flex flex-wrap gap-2">
              {IDEAS.map((idea) => (
                <button
                  key={idea}
                  onClick={() => setDescription(idea)}
                  className="flex cursor-pointer items-start gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  <span className="line-clamp-1">{idea}</span>
                </button>
              ))}
            </div>
            <Button onClick={() => generate.mutate(description)} loading={generate.isPending} disabled={description.trim().length < 10}>
              <Sparkles /> Generate skill
            </Button>
          </CardContent>
        </Card>

        {draft && (
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SkillIcon name={draft.icon} className="h-4 w-4 text-primary" /> Review your new skill
              </CardTitle>
              <CardDescription>Edit anything before saving. It will be enabled right away.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </Field>
                <Field label="Category">
                  <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v as SkillUpsertInput['category'] })}>
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
              </div>
              <Field label="Description">
                <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Field>
              <Field label="Instructions for the agent">
                <Textarea
                  value={draft.promptFragment}
                  onChange={(e) => setDraft({ ...draft, promptFragment: e.target.value })}
                  className="min-h-[130px]"
                />
              </Field>
              <div>
                <p className="mb-2 text-sm font-medium">Tools</p>
                <div className="flex flex-wrap gap-2">
                  {TOOL_NAMES.map((t) => {
                    const on = draft.tools.includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() => setDraft({ ...draft, tools: on ? draft.tools.filter((x) => x !== t) : [...draft.tools, t] })}
                        className="cursor-pointer"
                      >
                        <Badge variant={on ? 'default' : 'outline'}>{t}</Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => save.mutate(draft)} loading={save.isPending}>
                  Save & enable
                </Button>
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Discard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h3 className="mb-3 font-semibold">Your custom skills</h3>
        {custom.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Skills you create appear here. Try one of the ideas on the left.
          </div>
        ) : (
          <div className="grid gap-3">
            {custom.map((s) => (
              <SkillCard
                key={s.id}
                skill={s}
                pending={toggle.isPending && toggle.variables?.id === s.id}
                onToggle={(enabled) => toggle.mutate({ id: s.id, enabled })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
