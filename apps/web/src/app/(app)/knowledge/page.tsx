'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, HelpCircle, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { get, put } from '@/lib/api';
import { timeAgo } from '@/lib/utils';

type KB = { businessDetails: string; productsServices: string; commonQuestions: string };
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const FIELDS: {
  key: keyof KB;
  title: string;
  description: string;
  icon: typeof Building2;
  placeholder: string;
}[] = [
  {
    key: 'businessDetails',
    title: 'Business details',
    description: 'Who you are, where you are, hours, contact info, policies.',
    icon: Building2,
    placeholder:
      'Sharma Dental Clinic, 12 CMH Road, Indiranagar, Bengaluru.\nOpen Mon–Sat 10am–7pm, closed Sundays.\nPhone: +91 98765 43210. Free parking available.\nCancellation: please inform 4 hours in advance.',
  },
  {
    key: 'productsServices',
    title: 'Products & services',
    description: 'What you sell, with prices and details.',
    icon: Package,
    placeholder:
      'Teeth cleaning — ₹800 (30 min)\nTeeth whitening — ₹4,500 (60 min)\nRoot canal — from ₹6,000\nBraces consultation — free',
  },
  {
    key: 'commonQuestions',
    title: 'Common questions',
    description: 'Questions customers ask often, with your answers.',
    icon: HelpCircle,
    placeholder:
      'Q: Do you accept insurance?\nA: Yes, we accept most major insurers.\n\nQ: Is there parking?\nA: Yes, free parking in front of the clinic.',
  },
];

export default function KnowledgePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['agent'],
    queryFn: () => get<{ agent: KB & { updatedAt: string } }>('/agent'),
  });
  const [kb, setKb] = useState<KB | null>(null);
  const [state, setState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data && !kb) {
      setKb({
        businessDetails: data.agent.businessDetails,
        productsServices: data.agent.productsServices,
        commonQuestions: data.agent.commonQuestions,
      });
      setSavedAt(data.agent.updatedAt);
    }
  }, [data, kb]);

  async function save(next: KB) {
    setState('saving');
    try {
      const res = await put<{ savedAt: string }>('/agent/knowledge', next);
      setSavedAt(res.savedAt);
      setState('saved');
      qc.invalidateQueries({ queryKey: ['agent'] });
    } catch (err) {
      setState('error');
      toast.error(err instanceof Error ? err.message : 'Could not save');
    }
  }

  function onChange(key: keyof KB, value: string) {
    if (!kb) return;
    const next = { ...kb, [key]: value };
    setKb(next);
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 900);
  }

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        description="Everything your agent knows about your business. Changes apply to the agent immediately."
        actions={
          <div
            className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm"
            aria-live="polite"
          >
            {state === 'saving' || state === 'dirty' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> Saving…
              </>
            ) : state === 'error' ? (
              <span className="text-destructive">Not saved</span>
            ) : (
              <>
                <Check className="h-4 w-4 text-success" /> Saved{savedAt ? ` · ${timeAgo(savedAt)}` : ''}
              </>
            )}
          </div>
        }
      />
      <div className="grid gap-5">
        {FIELDS.map(({ key, title, description, icon: Icon, placeholder }) => (
          <Card key={key}>
            <CardHeader className="flex-row items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading || !kb ? (
                <Skeleton className="h-40" />
              ) : (
                <>
                  <Textarea
                    value={kb[key]}
                    onChange={(e) => onChange(key, e.target.value)}
                    placeholder={placeholder}
                    className="min-h-[180px] font-[450]"
                    maxLength={20000}
                    aria-label={title}
                  />
                  <p className="mt-1.5 text-right text-xs text-muted-foreground">
                    {kb[key].length.toLocaleString()} / 20,000
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
