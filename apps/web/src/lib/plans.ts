'use client';
import { useQuery } from '@tanstack/react-query';
import { PLANS, planToJSON, type PlanJSON } from '@cowork/shared';
import { get } from './api';

const DEFAULTS = Object.values(PLANS).map(planToJSON);

/** Plans as configured by the admin; the built-in defaults until they load. */
export function usePublicPlans() {
  const { data } = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => get<{ plans: PlanJSON[] }>('/public/plans').then((r) => r.plans),
    staleTime: 5 * 60_000,
  });
  return data ?? DEFAULTS;
}

export const limitText = (n: number | null) => (n === null ? 'Unlimited' : n.toLocaleString('en-IN'));
