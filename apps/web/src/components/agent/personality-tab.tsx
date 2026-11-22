'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, Phone, Plus, X } from 'lucide-react';
import { TONES, type PersonalityInput } from '@cowork/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { get, put } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  'Auto-detect',
  'English',
  'Hindi',
  'Hinglish',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Marathi',
  'Bengali',
  'Gujarati',
  'Punjabi',
];

export function PersonalityTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['agent'],
    queryFn: () => get<{ agent: PersonalityInput; bossNumbers: string[] }>('/agent'),
  });
  const [form, setForm] = useState<PersonalityInput | null>(null);
  const [boss, setBoss] = useState<string[]>([]);
  const [newBoss, setNewBoss] = useState('');

  useEffect(() => {
    if (data && !form) {
      const a = data.agent;
      setForm({
        name: a.name,
        businessName: a.businessName,
        tone: a.tone,
        language: a.language,
        greeting: a.greeting,
        instructions: a.instructions,
        emojis: a.emojis,
        replyLength: a.replyLength,
        isActive: a.isActive,
      });
      setBoss(data.bossNumbers.map((n) => `+${n}`));
    }
  }, [data, form]);

  const save = useAction((f: PersonalityInput) => put('/agent/personality', f), {
    success: 'Personality saved',
    invalidate: [['agent'], ['dashboard']],
  });
  const saveBoss = useAction((nums: string[]) => put('/agent/boss-numbers', { bossNumbers: nums }), {
    success: 'Boss Mode numbers saved',
    invalidate: [['agent']],
  });
  const preview = useQuery({
    queryKey: ['prompt-preview'],
    queryFn: () => get<{ prompt: string; tools: string[] }>('/agent/prompt-preview'),
    enabled: false,
  });

  if (isLoading || !form) return <Skeleton className="h-96 rounded-xl" />;
  const set = <K extends keyof PersonalityInput>(k: K, v: PersonalityInput[K]) =>
    setForm({ ...form, [k]: v });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Personality</CardTitle>
            <CardDescription>How your agent introduces itself and talks to customers.</CardDescription>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
            {form.isActive ? 'Replying' : 'Paused'}
          </label>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Agent name">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={60} />
            </Field>
            <Field label="Business name">
              <Input
                value={form.businessName}
                onChange={(e) => set('businessName', e.target.value)}
                maxLength={120}
              />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Tone</p>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t}
                  onClick={() => set('tone', t)}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1 text-sm capitalize',
                    form.tone === t
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-card hover:bg-accent',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Language">
              <Select value={form.language} onValueChange={(v) => set('language', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reply length">
              <Select
                value={form.replyLength}
                onValueChange={(v) => set('replyLength', v as PersonalityInput['replyLength'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field
            label="Greeting for new customers"
            hint="Optional. Used the first time someone messages you."
          >
            <Input
              value={form.greeting}
              onChange={(e) => set('greeting', e.target.value)}
              placeholder="Hi! 👋 Welcome to Sharma Dental. How can I help?"
            />
          </Field>
          <Field label="Extra instructions" hint="Rules the agent must always follow.">
            <Textarea
              value={form.instructions}
              onChange={(e) => set('instructions', e.target.value)}
              placeholder="Never offer discounts. Always ask for the customer's area before quoting delivery charges."
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.emojis} onCheckedChange={(v) => set('emojis', v)} /> Use emojis
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate(form)} loading={save.isPending}>
              Save personality
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={() => preview.refetch()}>
                  <Eye /> Preview prompt
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>System prompt preview</DialogTitle>
                  <DialogDescription>
                    Built from personality + knowledge base + enabled skills. Save first to see changes.
                  </DialogDescription>
                </DialogHeader>
                {preview.isFetching ? (
                  <Skeleton className="h-64" />
                ) : (
                  <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs leading-relaxed">
                    {preview.data?.prompt}
                    {preview.data?.tools.length ? `\n\n[tools: ${preview.data.tools.join(', ')}]` : ''}
                  </pre>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" /> Boss Mode
          </CardTitle>
          <CardDescription>
            Message your agent from these numbers to update your knowledge base or ask for stats. Send{' '}
            <code>help</code> to see commands.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {boss.map((n) => (
            <div
              key={n}
              className="flex items-center justify-between rounded-lg border px-3 py-2 font-mono text-sm"
            >
              {n}
              <button
                onClick={() => setBoss(boss.filter((x) => x !== n))}
                className="cursor-pointer text-muted-foreground hover:text-destructive"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              value={newBoss}
              onChange={(e) => setNewBoss(e.target.value)}
              placeholder="+919876543210"
              className="font-mono"
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Add number"
              onClick={() => {
                if (/^\+?\d{7,15}$/.test(newBoss.trim())) {
                  setBoss([...boss, newBoss.trim().startsWith('+') ? newBoss.trim() : `+${newBoss.trim()}`]);
                  setNewBoss('');
                }
              }}
            >
              <Plus />
            </Button>
          </div>
          <Button
            className="w-full"
            variant="soft"
            onClick={() => saveBoss.mutate(boss)}
            loading={saveBoss.isPending}
          >
            Save numbers
          </Button>
          <p className="text-xs text-muted-foreground">
            For Telegram, Boss Mode uses the phone number you share with the bot (tap “Share contact”).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
