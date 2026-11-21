'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, Clock, LogIn, MoreHorizontal, ShieldCheck, Trash2 } from 'lucide-react';
import { PLAN_IDS, type PlanId } from '@partner/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { del, patch, post } from '@/lib/api';
import { useAction } from '@/lib/hooks';

type Row = { id: string; email: string; status: 'ACTIVE' | 'SUSPENDED'; role: 'USER' | 'ADMIN' };

export function useUserActions(onDone?: () => void) {
  const qc = useQueryClient();
  const router = useRouter();
  const inv = [['admin-users'], ['admin-user']];
  return {
    update: useAction(
      ({ id, ...body }: { id: string; plan?: PlanId; status?: string; extendTrialHours?: number }) =>
        patch(`/admin/users/${id}`, body),
      {
        success: 'User updated',
        invalidate: inv,
        onSuccess: onDone,
      },
    ),
    impersonate: useAction((id: string) => post(`/admin/users/${id}/impersonate`), {
      onSuccess: () => {
        qc.clear();
        router.push('/dashboard');
      },
    }),
    remove: useAction((id: string) => del(`/admin/users/${id}`), {
      success: 'User deleted',
      invalidate: inv,
      onSuccess: onDone,
    }),
  };
}

export function UserActionsMenu({
  u,
  onDeleted,
}: {
  u: Pick<Row, 'id' | 'email' | 'status' | 'role'>;
  onDeleted?: () => void;
}) {
  const actions = useUserActions(onDeleted);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="User actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {u.role !== 'ADMIN' && (
            <DropdownMenuItem onClick={() => actions.impersonate.mutate(u.id)}>
              <LogIn /> Login as user
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => actions.update.mutate({ id: u.id, extendTrialHours: 24 })}>
            <Clock /> Extend trial 24h
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => actions.update.mutate({ id: u.id, extendTrialHours: 24 * 7 })}>
            <Clock /> Extend trial 7 days
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Change plan</DropdownMenuLabel>
          {PLAN_IDS.map((p) => (
            <DropdownMenuItem key={p} onClick={() => actions.update.mutate({ id: u.id, plan: p })}>
              <ShieldCheck /> {p.charAt(0) + p.slice(1).toLowerCase()}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              actions.update.mutate({ id: u.id, status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })
            }
          >
            <Ban /> {u.status === 'ACTIVE' ? 'Suspend' : 'Unsuspend'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirm(true)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {u.email}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the account, agent, channels, conversations and all data. It cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={actions.remove.isPending}
              onClick={() => actions.remove.mutate(u.id)}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
