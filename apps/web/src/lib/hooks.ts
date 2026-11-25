'use client';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MeDTO } from '@cowork/shared';
import { api, ApiError, get } from './api';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => get<{ user: MeDTO }>('/auth/me').then((r) => r.user),
    // only a real 401 means signed out; keep retrying while the server restarts
    retry: (n, err) => !(err instanceof ApiError && err.status < 500 && err.status !== 429) && n < 4,
    staleTime: 60_000,
  });
}

/** Mutation with toast feedback and cache invalidation. */
export function useAction<TVars, TRes = unknown>(
  fn: (vars: TVars) => Promise<TRes>,
  opts: {
    success?: string | ((r: TRes) => string);
    invalidate?: QueryKey[];
    onSuccess?: (r: TRes) => void;
  } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(res) : opts.success);
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      opts.onSuccess?.(res);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT') {
        toast.error(err.message, {
          action: { label: 'Upgrade', onClick: () => (window.location.href = '/billing') },
        });
      } else {
        toast.error(err instanceof Error ? err.message : 'Something went wrong');
      }
    },
  });
}

export { api, get };
