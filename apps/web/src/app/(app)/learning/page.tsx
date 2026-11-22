'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Brain, Eraser, MessageCircle, Sparkles } from 'lucide-react';
import type { ChannelType } from '@cowork/shared';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { ChannelIcon } from '@/components/channel-badge';
import { del, get } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { timeAgo } from '@/lib/utils';

type Item = {
  id: string;
  name: string | null;
  phone: string | null;
  channelType: ChannelType;
  profile: Record<string, string>;
  summary: string;
  messageCount: number;
  lastSeenAt: string;
  conversation: { id: string; summary: string } | null;
};

export default function LearningPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['learning', page],
    queryFn: () =>
      get<{ items: Item[]; total: number; totalContacts: number; pageSize: number }>(
        `/learning?page=${page}&pageSize=24`,
      ),
  });
  const forget = useAction((id: string) => del(`/learning/${id}`), {
    success: 'Memory cleared',
    invalidate: [['learning']],
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title="Learning"
        description="What your agent has learned about customers from past conversations. It uses this to personalise replies."
      />
      {data && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Customers remembered</div>
            <div className="text-2xl font-semibold">{data.total}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Total customers</div>
            <div className="text-2xl font-semibold">{data.totalContacts}</div>
          </Card>
          <Card className="col-span-2 flex items-center gap-3 p-4 sm:col-span-1">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground">
              Long chats are summarised automatically so the agent remembers more while using fewer tokens.
            </p>
          </Card>
        </div>
      )}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={Brain}
          title="Nothing learned yet"
          description="After a few messages with a customer, the agent saves what it learns here — names, preferences, interests and more."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((c) => {
              const facts = Object.entries(c.profile ?? {}).filter(([k]) => k !== 'name');
              return (
                <Card key={c.id} className="flex flex-col">
                  <CardHeader className="flex-row items-center gap-3">
                    <Avatar name={c.name ?? c.phone} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">
                        {c.name ?? (c.phone ? `+${c.phone}` : 'Unknown')}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ChannelIcon type={c.channelType} className="h-3 w-3" /> {c.messageCount} messages ·{' '}
                        {timeAgo(c.lastSeenAt)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3">
                    {c.summary && <p className="text-sm">{c.summary}</p>}
                    {facts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {facts.map(([k, v]) => (
                          <span key={k} className="rounded-md bg-muted px-2 py-1 text-xs">
                            <span className="capitalize text-muted-foreground">{k.replace(/_/g, ' ')}:</span>{' '}
                            {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                    {c.conversation?.summary && (
                      <p className="border-l-2 border-primary/40 pl-3 text-xs text-muted-foreground">
                        {c.conversation.summary}
                      </p>
                    )}
                    <div className="mt-auto flex gap-2 pt-2">
                      {c.conversation && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/conversations?id=${c.conversation.id}`}>
                            <MessageCircle /> Open chat
                          </Link>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => forget.mutate(c.id)}>
                        <Eraser /> Forget
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              Page {page} of {pages}
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
