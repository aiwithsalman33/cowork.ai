'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Circle,
  Clock,
  Coins,
  IndianRupee,
  KeyRound,
  MessageCircle,
  MessagesSquare,
  Plug,
  Radio,
  Reply,
  Send,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { DashboardDTO } from '@cowork/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, EmptyState, Progress, Skeleton, StatusDot } from '@/components/ui/misc';
import { ChannelIcon, ChannelStatusBadge, CHANNEL_LABEL } from '@/components/channel-badge';
import { SkillIcon } from '@/components/skill-icon';
import { get, useMe } from '@/lib/hooks';
import { cn, formatInr, formatNumber, timeAgo } from '@/lib/utils';

function ImpactStrip({ d }: { d: DashboardDTO }) {
  const hours = d.impact.minutesSaved / 60;
  const items: { label: string; value: string; icon: LucideIcon }[] = [
    { label: 'Messages handled', value: formatNumber(d.impact.messagesHandled), icon: MessageCircle },
    {
      label: 'Time saved',
      value: hours >= 1 ? `${hours.toFixed(1)} hrs` : `${d.impact.minutesSaved} min`,
      icon: Clock,
    },
    { label: 'Money saved', value: formatInr(d.impact.moneySavedInr), icon: IndianRupee },
    { label: 'Tokens used', value: formatNumber(d.impact.tokensUsed), icon: Coins },
    { label: 'Availability', value: d.impact.availability, icon: Radio },
  ];
  return (
    <section className="hero-gradient relative overflow-hidden rounded-2xl border p-5 sm:p-7">
      <div className="relative z-10">
        <p className="text-sm font-medium text-muted-foreground">Your impact</p>
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">Your AI partner at work</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {items.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-primary/10 bg-card p-3 sm:p-4">
              <Icon className="mb-2 h-4 w-4 text-primary" />
              <div className="text-xl font-semibold sm:text-2xl">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
    </section>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  suffix,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  suffix?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">
        {formatNumber(value)}
        {suffix}
      </div>
    </Card>
  );
}

function Checklist({ d }: { d: DashboardDTO }) {
  const steps = [
    {
      done: d.checklist.customized,
      label: 'Customize your agent',
      href: '/agent?tab=personality',
      icon: Bot,
    },
    { done: d.checklist.aiKey, label: 'Add your AI key', href: '/agent?tab=keys', icon: KeyRound },
    { done: d.checklist.channel, label: 'Connect a channel', href: '/integrations?tab=channels', icon: Plug },
    {
      done: d.checklist.testMessage,
      label: 'Send a test message',
      href: '/integrations?tab=channels',
      icon: Send,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Getting started</CardTitle>
          <span className="text-sm text-muted-foreground">
            {done}/{steps.length} done
          </span>
        </div>
        <Progress value={(done / steps.length) * 100} className="mt-2" />
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/40',
              s.done && 'opacity-70',
            )}
          >
            {s.done ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
            <span className={cn('font-medium', s.done && 'line-through')}>{s.label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-52 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: me } = useMe();
  const { data: d, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => get<DashboardDTO>('/dashboard'),
    refetchInterval: 30_000,
  });

  if (isLoading || !d) return <DashboardSkeleton />;

  const usagePct = d.usage.messageLimit ? (d.usage.messagesThisMonth / d.usage.messageLimit) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            Namaste, {me?.name.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-muted-foreground">Here is how your agent is doing today.</p>
        </div>
      </div>

      <ImpactStrip d={d} />
      <Checklist d={d} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Messages today" value={d.stats.messagesToday} icon={MessageCircle} />
        <StatCard label="Conversations today" value={d.stats.conversationsToday} icon={MessagesSquare} />
        <StatCard label="New users today" value={d.stats.newUsersToday} icon={UserPlus} />
        <StatCard label="Reply rate" value={d.stats.replyRate} suffix="%" icon={TrendingUp} />
        <StatCard label="Total messages" value={d.stats.totalMessages} icon={MessageCircle} />
        <StatCard label="Unique users" value={d.stats.uniqueUsers} icon={Users} />
        <StatCard label="User messages" value={d.stats.userMessages} icon={Send} />
        <StatCard label="Bot replies" value={d.stats.botReplies} icon={Reply} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent conversations</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/conversations">
                View all <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {d.recentConversations.length === 0 ? (
              <EmptyState
                icon={MessagesSquare}
                title="No conversations yet"
                description="Connect a channel and send your agent a message to see it here."
                action={
                  <Button size="sm" asChild>
                    <Link href="/integrations?tab=channels">Connect a channel</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {d.recentConversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/conversations?id=${c.id}`}
                      className="flex items-center gap-3 py-3 hover:opacity-80"
                    >
                      <Avatar name={c.contact.name ?? c.contact.externalId} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {c.contact.name ?? c.contact.phone ?? c.contact.externalId}
                          </span>
                          <ChannelIcon type={c.channelType} className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{c.lastMessage}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeAgo(c.lastMessageAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agent status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-semibold">{d.agent.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <StatusDot status={d.agent.planActive && d.agent.isActive ? 'ok' : 'error'} />
                    {!d.agent.planActive ? 'Stopped — plan inactive' : d.agent.isActive ? 'Online' : 'Paused'}
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model</span>
                <span className="font-medium">
                  {d.agent.model ?? (
                    <Link className="text-primary" href="/agent?tab=keys">
                      Add a key
                    </Link>
                  )}
                </span>
              </div>
              <div>
                <div className="mb-1 flex justify-between">
                  <span className="text-muted-foreground">AI replies this month</span>
                  <span className="font-medium tabular-nums">
                    {formatNumber(d.usage.messagesThisMonth)} / {formatNumber(d.usage.messageLimit)}
                  </span>
                </div>
                <Progress value={usagePct} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                { href: '/knowledge', label: 'Edit knowledge', icon: BookOpen },
                { href: '/agent?tab=skills', label: 'Manage skills', icon: Sparkles },
                { href: '/integrations?tab=channels', label: 'Channels', icon: Plug },
                { href: '/integrations', label: 'Integrations', icon: Plug },
              ].map(({ href, label, icon: Icon }) => (
                <Link
                  key={label}
                  href={href}
                  className="flex flex-col items-start gap-2 rounded-lg border p-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
                >
                  <Icon className="h-4 w-4 text-primary" />
                  {label}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Active skills</CardTitle>
            <Badge variant="secondary">{d.activeSkills.length}</Badge>
          </CardHeader>
          <CardContent>
            {d.activeSkills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skills enabled yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {d.activeSkills.map((s) => (
                  <span
                    key={s.slug}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm"
                  >
                    <SkillIcon name={s.icon} className="h-3.5 w-3.5 text-primary" />
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Channels</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/integrations?tab=channels">Manage</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {d.channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">No channels connected.</p>
            ) : (
              <ul className="space-y-2">
                {d.channels.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-soft text-primary">
                        <ChannelIcon type={c.type} />
                      </span>
                      <div>
                        <div className="text-sm font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{CHANNEL_LABEL[c.type]}</div>
                      </div>
                    </div>
                    <ChannelStatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
