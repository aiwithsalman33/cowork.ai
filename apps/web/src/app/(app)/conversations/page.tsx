'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Brain,
  LayoutTemplate,
  MessagesSquare,
  Plus,
  Search,
  Send,
  UserRound,
  Wrench,
} from 'lucide-react';
import type { ConversationDTO, MessageDTO } from '@cowork/shared';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, EmptyState, Skeleton } from '@/components/ui/misc';
import { ChannelIcon, CHANNEL_LABEL } from '@/components/channel-badge';
import { SendTemplateDialog } from '@/components/send-template-dialog';
import { get, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';

type Filter = 'ALL' | 'TELEGRAM' | 'WHATSAPP';
type Thread = {
  conversation: ConversationDTO;
  summary: string;
  contact: { profile: Record<string, string>; summary: string };
  messages: MessageDTO[];
};

function displayName(c: ConversationDTO) {
  return c.contact.name ?? (c.contact.phone ? `+${c.contact.phone}` : c.contact.externalId);
}

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['thread', id],
    queryFn: () => get<Thread>(`/conversations/${id}/messages`),
    refetchInterval: 5000,
  });
  const [picking, setPicking] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['thread', id] });
    qc.invalidateQueries({ queryKey: ['conversations'] });
  };
  const reply = useAction((t: string) => post(`/conversations/${id}/reply`, { text: t }), {
    onSuccess: () => {
      setText('');
      refresh();
    },
  });
  // Braces matter: newer browsers return a Promise from scroll methods, and React would call it as a cleanup.
  const lastId = data?.messages.at(-1)?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  if (isLoading || !data) {
    return (
      <div className="flex-1 space-y-3 p-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="ml-auto h-14 w-2/3" />
        <Skeleton className="h-14 w-2/3" />
      </div>
    );
  }
  const c = data.conversation;
  const isApi = c.channelType === 'WHATSAPP_CLOUD';
  const lastIn = data.messages.findLast((m) => m.direction === 'IN');
  const windowClosed =
    isApi && (!lastIn || Date.now() - new Date(lastIn.createdAt).getTime() > 24 * 3_600_000);
  const offline = c.channelStatus !== 'CONNECTED' && !isApi;
  const submit = () => {
    if (text.trim() && !reply.isPending) reply.mutate(text.trim());
  };
  const facts = Object.entries(data.contact.profile ?? {});

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back">
            <ArrowLeft />
          </Button>
          <Avatar name={displayName(c)} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{displayName(c)}</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ChannelIcon type={c.channelType} className="h-3 w-3" /> {CHANNEL_LABEL[c.channelType]} ·{' '}
              {c.channelName}
            </div>
          </div>
        </div>
        <div
          ref={scroller}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background p-4 scrollbar-thin"
        >
          {data.messages.map((m) => {
            const out = m.direction === 'OUT';
            return (
              <div key={m.id} className={cn('flex flex-col', out ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%]',
                    out
                      ? m.role === 'OWNER'
                        ? 'rounded-br-sm bg-primary text-primary-foreground'
                        : 'rounded-br-sm bg-primary-soft text-foreground'
                      : 'rounded-bl-sm border bg-card',
                  )}
                >
                  {m.content}
                </div>
                <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                  {out &&
                    (m.role === 'OWNER' ? <UserRound className="h-3 w-3" /> : <Bot className="h-3 w-3" />)}
                  {m.role === 'OWNER' ? 'You · ' : m.role === 'SYSTEM' ? 'Boss Mode · ' : ''}
                  {m.role === 'ASSISTANT' ? 'AI · ' : ''}
                  {formatDateTime(m.createdAt)}
                  {out && m.status === 'FAILED' && (
                    <span className="font-medium text-destructive">
                      · Not delivered{m.error ? `: ${m.error}` : ''}
                    </span>
                  )}
                  {m.toolCalls?.map((t) => (
                    <Badge key={t.name} variant={t.ok ? 'secondary' : 'destructive'} className="ml-1 py-0">
                      <Wrench /> {t.name}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {(offline || windowClosed) && (
          <p className="flex items-center gap-2 border-t bg-warning/10 px-4 py-2 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            {offline ? (
              <span>
                This channel is not connected, so messages can’t be sent.{' '}
                <Link href="/integrations?tab=channels" className="font-medium text-primary underline">
                  Reconnect
                </Link>
              </span>
            ) : (
              'No message from this customer in the last 24 hours, so WhatsApp only delivers templates.'
            )}
          </p>
        )}
        <form
          className="shrink-0 border-t bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-end gap-2">
            {isApi && (
              <Button
                type="button"
                variant={windowClosed ? 'default' : 'outline'}
                className="h-11 shrink-0"
                onClick={() => setPicking(true)}
              >
                <LayoutTemplate /> <span className="hidden sm:inline">Template</span>
              </Button>
            )}
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Message"
              placeholder="Type a message…"
              className="max-h-36 min-h-11 [field-sizing:content] resize-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <Button
              type="submit"
              className="h-11 shrink-0"
              loading={reply.isPending}
              disabled={!text.trim() || offline}
            >
              {!reply.isPending && <Send />} <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
        </form>
        {picking && (
          <SendTemplateDialog
            conversationId={id}
            channelId={c.channelId}
            onClose={() => setPicking(false)}
            onSent={refresh}
          />
        )}
      </div>
      <aside className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-l p-4 2xl:block">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Brain className="h-4 w-4 text-primary" /> What the agent remembers
        </div>
        {data.contact.summary && <p className="text-sm text-muted-foreground">{data.contact.summary}</p>}
        {facts.length > 0 && (
          <dl className="space-y-2 text-sm">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs capitalize text-muted-foreground">{k.replace(/_/g, ' ')}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        {data.summary && (
          <div>
            <div className="text-xs font-medium text-muted-foreground">Conversation summary</div>
            <p className="mt-1 text-sm">{data.summary}</p>
          </div>
        )}
        {!data.contact.summary && !facts.length && !data.summary && (
          <p className="text-sm text-muted-foreground">
            Nothing learned yet. Memory builds up after a few messages.
          </p>
        )}
      </aside>
    </div>
  );
}

function Inbox() {
  const params = useSearchParams();
  const router = useRouter();
  const selected = params.get('id');
  const qc = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', filter, debounced],
    queryFn: () =>
      get<{ conversations: ConversationDTO[] }>(
        `/conversations?channel=${filter}${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`,
      ),
    refetchInterval: 10_000,
  });
  const select = (id: string | null) =>
    router.replace(id ? `/conversations?id=${id}` : '/conversations', { scroll: false });

  return (
    <Card className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] overflow-hidden">
      <div className={cn('flex w-full flex-col border-r md:w-80 md:shrink-0', selected && 'hidden md:flex')}>
        <div className="space-y-3 border-b p-3">
          <Button className="w-full" onClick={() => setComposing(true)}>
            <Plus /> New message
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, message"
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {(['ALL', 'TELEGRAM', 'WHATSAPP'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium',
                  filter === f ? 'bg-card shadow-sm' : 'text-muted-foreground',
                )}
              >
                {f === 'ALL' ? 'All' : f === 'TELEGRAM' ? 'Telegram' : 'WhatsApp'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : !data?.conversations.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No conversations{debounced ? ' match your search' : ' yet'}.
            </p>
          ) : (
            data.conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => select(c.id)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-accent/60',
                  selected === c.id && 'bg-primary-soft',
                )}
              >
                <div className="relative">
                  <Avatar name={displayName(c)} />
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-card p-0.5 text-muted-foreground">
                    <ChannelIcon type={c.channelType} className="h-3 w-3" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{displayName(c)}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgo(c.lastMessageAt)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{c.lastMessage}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
      <div className={cn('min-h-0 min-w-0 flex-1', selected ? 'flex' : 'hidden md:flex')}>
        {selected ? (
          <ThreadView key={selected} id={selected} onBack={() => select(null)} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={MessagesSquare}
              title="Select a conversation"
              description="Messages from Telegram and WhatsApp appear here in real time."
              className="border-0"
            />
          </div>
        )}
      </div>
      {composing && (
        <SendTemplateDialog
          onClose={() => setComposing(false)}
          onSent={(newId) => {
            qc.invalidateQueries({ queryKey: ['conversations'] });
            select(newId);
          }}
        />
      )}
    </Card>
  );
}

export default function ConversationsPage() {
  return (
    <div>
      <h1 className="sr-only">Conversations</h1>
      <Suspense>
        <Inbox />
      </Suspense>
    </div>
  );
}
