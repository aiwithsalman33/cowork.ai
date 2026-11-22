'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Plus, Repeat, Trash2 } from 'lucide-react';
import type { ChannelDTO, ScheduleInput } from '@cowork/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ChannelIcon } from '@/components/channel-badge';
import { del, get, patch, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';

type Schedule = {
  id: string;
  name: string;
  recipient: string;
  message: string;
  frequency: 'ONCE' | 'DAILY' | 'WEEKLY';
  nextRunAt: string;
  lastRunAt: string | null;
  lastError: string | null;
  enabled: boolean;
  channel: { name: string; type: ChannelDTO['type'] };
};

function localInputValue(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function NewSchedule({ channels }: { channels: ChannelDTO[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    channelId: channels[0]?.id ?? '',
    recipient: '',
    message: '',
    frequency: 'ONCE' as ScheduleInput['frequency'],
    runAt: localInputValue(new Date(Date.now() + 3600_000)),
  });
  const create = useAction(() => post('/schedules', { ...form, runAt: new Date(form.runAt).toISOString() }), {
    success: 'Schedule created',
    invalidate: [['schedules']],
    onSuccess: () => setOpen(false),
  });
  const ch = channels.find((c) => c.id === form.channelId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!channels.length}>
          <Plus /> New schedule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a message</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Weekly offer reminder"
            />
          </Field>
          <Field label="Channel">
            <Select value={form.channelId} onValueChange={(v) => setForm({ ...form, channelId: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Recipient"
            hint={
              ch?.type === 'TELEGRAM'
                ? 'Telegram chat ID (the person must have messaged your bot first)'
                : 'WhatsApp number with country code, e.g. 919876543210'
            }
          >
            <Input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} />
          </Field>
          <Field label="Message">
            <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Repeat">
              <Select
                value={form.frequency}
                onValueChange={(v) => setForm({ ...form, frequency: v as Schedule['frequency'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ONCE">Once</SelectItem>
                  <SelectItem value="DAILY">Daily</SelectItem>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="First run">
              <Input
                type="datetime-local"
                value={form.runAt}
                onChange={(e) => setForm({ ...form, runAt: e.target.value })}
              />
            </Field>
          </div>
          {ch?.type === 'WHATSAPP_CLOUD' && (
            <p className="text-xs text-muted-foreground">
              Note: WhatsApp Business API only allows free-form messages within 24 hours of the customer’s
              last message.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => create.mutate(undefined)}
            loading={create.isPending}
            disabled={!form.name || !form.recipient || !form.message}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SchedulesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => get<{ schedules: Schedule[] }>('/schedules'),
  });
  const channels = useQuery({
    queryKey: ['channels'],
    queryFn: () => get<{ channels: ChannelDTO[] }>('/channels'),
  });
  const toggle = useAction(
    ({ id, enabled }: { id: string; enabled: boolean }) => patch(`/schedules/${id}`, { enabled }),
    { invalidate: [['schedules']] },
  );
  const remove = useAction((id: string) => del(`/schedules/${id}`), {
    success: 'Schedule deleted',
    invalidate: [['schedules']],
  });

  return (
    <div>
      <PageHeader
        title="Schedules"
        description="Send reminders, offers and follow-ups automatically."
        actions={
          <NewSchedule key={channels.data?.channels.length} channels={channels.data?.channels ?? []} />
        }
      />
      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !data?.schedules.length ? (
        <EmptyState
          icon={CalendarClock}
          title="No schedules yet"
          description="Create one to send a message at a set time — once, daily or weekly."
        />
      ) : (
        <div className="space-y-3">
          {data.schedules.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <Switch
                checked={s.enabled}
                onCheckedChange={(v) => toggle.mutate({ id: s.id, enabled: v })}
                aria-label="Enabled"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {s.name}
                  <Badge variant="secondary">
                    <Repeat /> {s.frequency.toLowerCase()}
                  </Badge>
                </div>
                <p className="truncate text-sm text-muted-foreground">{s.message}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ChannelIcon type={s.channel.type} className="h-3 w-3" /> {s.channel.name} → {s.recipient}
                  </span>
                  <span>
                    {s.enabled
                      ? `Next: ${formatDateTime(s.nextRunAt)}`
                      : s.lastRunAt
                        ? `Last ran ${formatDateTime(s.lastRunAt)}`
                        : 'Paused'}
                  </span>
                </div>
                {s.lastError && <p className="mt-1 text-xs text-destructive">{s.lastError}</p>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove.mutate(s.id)} aria-label="Delete">
                <Trash2 className="text-destructive" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
