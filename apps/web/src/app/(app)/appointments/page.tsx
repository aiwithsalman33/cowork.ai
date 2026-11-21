'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, CalendarDays, Clock, Mail, MoreHorizontal, Phone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { get, patch } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { cn } from '@/lib/utils';

type Appointment = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  googleEventId: string | null;
};

const STATUS: Record<Appointment['status'], { label: string; variant: 'success' | 'secondary' | 'destructive' | 'default' }> = {
  CONFIRMED: { label: 'Confirmed', variant: 'default' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
  NO_SHOW: { label: 'No-show', variant: 'destructive' },
};

export default function AppointmentsPage() {
  const [scope, setScope] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const { data, isLoading } = useQuery({
    queryKey: ['appointments', scope],
    queryFn: () => get<{ appointments: Appointment[] }>(`/appointments?scope=${scope}`),
  });
  const update = useAction(({ id, status }: { id: string; status: Appointment['status'] }) => patch(`/appointments/${id}`, { status }), {
    success: 'Appointment updated',
    invalidate: [['appointments']],
  });

  const groups = new Map<string, Appointment[]>();
  for (const a of data?.appointments ?? []) {
    const key = new Date(a.startsAt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Bookings made by your AI agent. Connected to Google Calendar if you link it in Integrations."
        actions={
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {(['upcoming', 'past', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn('cursor-pointer rounded-md px-3 py-1 text-sm capitalize', scope === s ? 'bg-card shadow-sm' : 'text-muted-foreground')}
              >
                {s}
              </button>
            ))}
          </div>
        }
      />
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : !data?.appointments.length ? (
        <EmptyState
          icon={CalendarCheck}
          title={scope === 'upcoming' ? 'No upcoming appointments' : 'No appointments'}
          description="Enable the Appointment Scheduler skill and your agent will book appointments straight from chat."
        />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([day, list]) => (
            <section key={day}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <CalendarDays className="h-4 w-4" /> {day}
              </h3>
              <div className="space-y-2">
                {list.map((a) => (
                  <Card key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="flex w-24 shrink-0 items-center gap-2 font-semibold tabular-nums">
                      <Clock className="h-4 w-4 text-primary" />
                      {new Date(a.startsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{a.title}</span>
                        <Badge variant={STATUS[a.status].variant}>{STATUS[a.status].label}</Badge>
                        {a.googleEventId && <Badge variant="outline">Google Calendar</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>{a.customerName}</span>
                        {a.customerPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {a.customerPhone}
                          </span>
                        )}
                        {a.customerEmail && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {a.customerEmail}
                          </span>
                        )}
                        <span>{Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000)} min</span>
                      </div>
                      {a.notes && <p className="mt-1 text-sm">{a.notes}</p>}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(Object.keys(STATUS) as Appointment['status'][])
                          .filter((s) => s !== a.status)
                          .map((s) => (
                            <DropdownMenuItem key={s} onClick={() => update.mutate({ id: a.id, status: s })}>
                              Mark {STATUS[s].label.toLowerCase()}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
