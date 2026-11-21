'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { PLAN_IDS, type PlanId } from '@partner/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { get } from '@/lib/api';
import { UserActionsMenu } from '@/components/admin/user-actions';
import { timeAgo } from '@/lib/utils';

type Row = {
  id: string;
  email: string;
  name: string;
  businessName: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  emailVerified: boolean;
  plan: PlanId;
  planActive: boolean;
  trialEndsAt: string | null;
  channels: number;
  messages: number;
  lastLoginAt: string | null;
  createdAt: string;
};

export default function AdminUsers() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [plan, setPlan] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (debounced) params.set('q', debounced);
  if (plan !== 'all') params.set('plan', plan);
  if (status !== 'all') params.set('status', status);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', params.toString()],
    queryFn: () => get<{ items: Row[]; total: number; pageSize: number }>(`/admin/users?${params}`),
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader title="Users" description={data ? `${data.total} accounts` : undefined} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email"
            className="pl-9"
          />
        </div>
        <Select
          value={plan}
          onValueChange={(v) => {
            setPlan(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {PLAN_IDS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Channels</th>
              <th className="px-4 py-3 font-medium">Messages</th>
              <th className="px-4 py-3 font-medium">Last login</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-8" />
                    </td>
                  </tr>
                ))
              : data?.items.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}`} className="font-medium hover:text-primary">
                        {u.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {u.email}
                        {u.businessName ? ` · ${u.businessName}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={u.planActive ? 'success' : 'secondary'}>{u.plan}</Badge>
                        {u.status === 'SUSPENDED' && <Badge variant="destructive">Suspended</Badge>}
                        {!u.emailVerified && <Badge variant="warning">Unverified</Badge>}
                        {u.role === 'ADMIN' && <Badge>Admin</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{u.channels}</td>
                    <td className="px-4 py-3 tabular-nums">{u.messages.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.lastLoginAt ? timeAgo(u.lastLoginAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{timeAgo(u.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <UserActionsMenu u={u} />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </Card>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          {page} / {pages}
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
