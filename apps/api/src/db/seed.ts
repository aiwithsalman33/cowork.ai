import { prisma } from './client.js';
import { SKILL_CATALOG } from './skills-catalog.js';
import { hashPassword } from '../auth/password.js';

const DEFAULT_FLAGS = [
  {
    key: 'boss_mode',
    description: 'Owner can manage the agent by messaging it from a whitelisted number',
    enabled: true,
  },
  { key: 'skill_creator', description: 'AI Skill Creator in the Skill Store', enabled: true },
  {
    key: 'whatsapp_qr',
    description: 'Allow connecting WhatsApp by scanning a QR code (Baileys)',
    enabled: true,
  },
  {
    key: 'maintenance_read_only',
    description:
      'MAINTENANCE: tenants can only read; saving and changes are paused (admins, sign-in and webhooks still work)',
    enabled: false,
  },
  {
    key: 'maintenance_agent_paused',
    description: 'MAINTENANCE: incoming messages are saved but the agent does not reply',
    enabled: false,
  },
  {
    key: 'google_integrations',
    description:
      'Google integrations (Gmail, Calendar, Sheets, Drive, Docs) with the tenant’s own Google Cloud OAuth client',
    enabled: true,
  },
];

/** Idempotent: safe to run on every deploy. */
export async function seed() {
  for (const s of SKILL_CATALOG) {
    await prisma.skill.upsert({
      where: { slug: s.slug },
      create: { ...s, tools: s.tools ?? [], isPublic: true, isBuiltin: true },
      update: {
        name: s.name,
        description: s.description,
        category: s.category,
        icon: s.icon,
        promptFragment: s.promptFragment,
        tools: s.tools ?? [],
        isBuiltin: true,
      },
    });
  }
  await prisma.featureFlag.deleteMany({ where: { key: 'composio_integrations' } });
  for (const f of DEFAULT_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      create: f,
      update: { description: f.description },
    });
  }

  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          name: 'Platform Admin',
          role: 'ADMIN',
          emailVerifiedAt: new Date(),
          approvedAt: new Date(),
          plan: 'GROWTH',
          passwordHash: await hashPassword(password),
          currentPeriodEnd: new Date('2099-01-01'),
          agent: { create: {} },
        },
      });
      console.log(`Created admin user ${email}`);
    } else if (existing.role !== 'ADMIN') {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: 'ADMIN',
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          approvedAt: existing.approvedAt ?? new Date(),
        },
      });
      console.log(`Promoted ${email} to ADMIN`);
    }
  }
  console.log(`Seeded ${SKILL_CATALOG.length} skills and ${DEFAULT_FLAGS.length} feature flags`);
}

const isMain =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('seed.ts') ||
  process.argv[1]?.endsWith('seed.js');
if (isMain) {
  seed()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
