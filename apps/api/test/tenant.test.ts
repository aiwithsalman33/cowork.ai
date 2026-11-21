import { beforeAll, describe, expect, it } from 'vitest';
import { tenantDb } from '../src/db/tenant.js';
import { prisma, signup } from './helpers.js';

describe('tenantDb isolation', () => {
  let a: string;
  let b: string;
  let bContactId: string;
  let bChannelId: string;

  beforeAll(async () => {
    a = (await signup()).userId;
    b = (await signup()).userId;
    const ch = await prisma.channel.create({
      data: { userId: b, type: 'TELEGRAM', name: 'B bot', webhookSecret: 'x' },
    });
    bChannelId = ch.id;
    const contact = await prisma.contact.create({
      data: { userId: b, channelType: 'TELEGRAM', externalId: '42', name: 'Secret customer of B' },
    });
    bContactId = contact.id;
    await prisma.contact.create({
      data: { userId: a, channelType: 'TELEGRAM', externalId: '7', name: 'A customer' },
    });
  });

  it("findMany only returns the tenant's own rows", async () => {
    const rows = await tenantDb(a).contact.findMany();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.userId === a)).toBe(true);
    expect(rows.find((r) => r.id === bContactId)).toBeUndefined();
  });

  it("findUnique / findFirst by another tenant's id returns null", async () => {
    expect(await tenantDb(a).contact.findUnique({ where: { id: bContactId } })).toBeNull();
    expect(await tenantDb(a).channel.findFirst({ where: { id: bChannelId } })).toBeNull();
  });

  it('even an explicit userId filter for another tenant is overridden', async () => {
    const rows = await tenantDb(a).contact.findMany({ where: { userId: b } });
    expect(rows.every((r) => r.userId === a)).toBe(true);
  });

  it("cannot update or delete another tenant's row", async () => {
    await expect(
      tenantDb(a).contact.update({ where: { id: bContactId }, data: { name: 'hacked' } }),
    ).rejects.toThrow();
    const res = await tenantDb(a).contact.deleteMany({ where: { id: bContactId } });
    expect(res.count).toBe(0);
    const res2 = await tenantDb(a).channel.updateMany({
      where: { id: bChannelId },
      data: { name: 'hacked' },
    });
    expect(res2.count).toBe(0);
    const still = await prisma.contact.findUniqueOrThrow({ where: { id: bContactId } });
    expect(still.name).toBe('Secret customer of B');
  });

  it('create always writes the current tenant id', async () => {
    const created = await tenantDb(a).lead.create({ data: { userId: b, name: 'Spoofed' } as never });
    expect(created.userId).toBe(a);
  });

  it('update cannot move a row to another tenant', async () => {
    const own = await tenantDb(a).lead.create({ data: { name: 'Mine' } as never });
    await tenantDb(a).lead.update({ where: { id: own.id }, data: { userId: b } as never });
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: own.id } });
    expect(after.userId).toBe(a);
  });

  it('count and aggregate are scoped', async () => {
    const total = await prisma.contact.count();
    const scoped = await tenantDb(a).contact.count();
    expect(scoped).toBeLessThan(total);
  });
});
