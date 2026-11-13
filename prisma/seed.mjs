/**
 * EduCRM lokal/demo seed: tashkilot, asosiy filial va egasi (owner) hisobi.
 *
 * Takror ishga tushirilsa hech narsa ikkilanmaydi (upsert). Hisob ma'lumotlari
 * env'dan olinadi:
 *   SEED_OWNER_EMAIL     (standart: owner@educrm.local)
 *   SEED_OWNER_PASSWORD
 *   SEED_OWNER_PHONE     (standart: 998900000001)
 *   SEED_ORG_NAME        (standart: EduCRM o'quv markazi)
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const digits = (value) => String(value ?? '').replace(/\D/g, '');

async function main() {
  const email = (process.env.SEED_OWNER_EMAIL || 'owner@educrm.local').toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  const phone = digits(process.env.SEED_OWNER_PHONE) || '998900000001';
  const orgName = process.env.SEED_ORG_NAME || "EduCRM o'quv markazi";

  if (!password) {
    throw new Error(
      'SEED_OWNER_PASSWORD sozlanmagan',
    );
  }

  const organization = await prisma.organization.upsert({
    where: { name: orgName },
    update: {},
    create: { name: orgName },
  });

  const branch = await prisma.branch.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: 'Asosiy filial',
      },
    },
    update: {},
    create: { name: 'Asosiy filial', organizationId: organization.id },
  });

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone }] },
  });
  const hash = await bcrypt.hash(password, 10);

  const owner = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          email,
          password: hash,
          role: 'ADMIN',
          status: 'ACTIVE',
          organizationId: organization.id,
          deleted_at: null,
        },
      })
    : await prisma.user.create({
        data: {
          fullName: 'Markaz egasi',
          phone,
          email,
          password: hash,
          role: 'ADMIN',
          position: 'Direktor',
          hire_date: new Date(),
          organizationId: organization.id,
        },
      });

  console.log(
    `Seed tayyor: tashkilot #${organization.id}, filial #${branch.id}, owner ${owner.email}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
