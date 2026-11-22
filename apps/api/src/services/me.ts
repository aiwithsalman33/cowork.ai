import type { User } from '@prisma/client';
import type { MeDTO } from '@partner/shared';
import { prisma } from '../db/client.js';
import { isPlanActive } from './plan.js';

export async function toMeDTO(user: User, impersonatorId: string | null): Promise<MeDTO> {
  let impersonatedBy: MeDTO['impersonatedBy'] = null;
  if (impersonatorId) {
    const admin = await prisma.user.findUnique({
      where: { id: impersonatorId },
      select: { id: true, email: true },
    });
    impersonatedBy = admin;
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    status: user.status,
    trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
    planActive: isPlanActive(user),
    approved: user.role === 'ADMIN' || !!user.approvedAt,
    subscriptionStatus: user.subscriptionStatus,
    currentPeriodEnd: user.currentPeriodEnd?.toISOString() ?? null,
    impersonatedBy,
    createdAt: user.createdAt.toISOString(),
  };
}
