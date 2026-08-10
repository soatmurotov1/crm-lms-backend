/**
 * Eski xabarnomalarni tashkilotga biriktiradi (bir martalik).
 *
 * Nima uchun kerak: 2026-08-10 gacha `Notification.organizationId` so'rovdan
 * kelardi va ko'pincha bo'sh qolardi. Bo'sh qolgan xabarnoma esa rol bo'yicha
 * auditoriyada (ALL / STUDENTS / TEACHERS / ADMINS) HAMMA tashkilotdagi
 * foydalanuvchiga ko'rinadi — ya'ni bitta markazning e'loni butun platformaga
 * tarqalib ketgan. Kod tuzatildi, lekin eski qatorlar o'sha holicha qolgan.
 *
 * Ishlatish (loyiha papkasidan):
 *
 *   node scripts/backfill-notification-org.js              # faqat ko'rsatadi
 *   node scripts/backfill-notification-org.js --apply      # yozadi
 *   node scripts/backfill-notification-org.js --apply --fallback-org=1
 *
 * Sukut bo'yicha HECH NARSA yozilmaydi: skript o'zgarishlarni tranzaksiya
 * ichida bajarib, natijani ko'rsatadi va orqaga qaytaradi (rollback).
 * Raqamlarni ko'rib, keyin `--apply` bilan qayta chaqiring.
 *
 * Qayta chaqirish xavfsiz: faqat `organizationId IS NULL` qatorlarga tegadi.
 */

require('dotenv').config();
const { Pool } = require('pg');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

/**
 * Hech qanday belgi bo'yicha aniqlab bo'lmagan qatorlarni shu tashkilotga
 * beradi. Bitta markazli o'rnatmalarda qulay; ko'p markazli bazada ehtiyot
 * bo'ling — noto'g'ri markazga bergandan ko'ra NULL qoldirgan yaxshiroq.
 */
const fallbackArg = args.find((arg) => arg.startsWith('--fallback-org='));
const FALLBACK_ORG_ID = fallbackArg
  ? Number(fallbackArg.split('=')[1])
  : null;

if (fallbackArg && !Number.isInteger(FALLBACK_ORG_ID)) {
  console.error("--fallback-org= dan keyin tashkilot raqami bo'lishi kerak");
  process.exit(1);
}

/**
 * Qadamlar ketma-ketligi muhim: yuqoridagisi ishonchliroq belgiga tayanadi.
 * Har biri faqat hali biriktirilmagan qatorlarga tegadi, shuning uchun
 * keyingi qadam oldingisining natijasini buzmaydi.
 */
const STEPS = [
  {
    name: "guruh orqali (eng ishonchli)",
    sql: `
      UPDATE "Notification" n
         SET "organizationId" = g."organizationId"
        FROM "Group" g
       WHERE n."organizationId" IS NULL
         AND n."groupId" = g.id
         AND g."organizationId" IS NOT NULL
    `,
  },
  {
    name: "qabul qiluvchi o'quvchi orqali",
    sql: `
      UPDATE "Notification" n
         SET "organizationId" = s."organizationId"
        FROM "Student" s
       WHERE n."organizationId" IS NULL
         AND n.audience = 'USER'
         AND n."recipientRole" = 'STUDENT'
         AND n."recipientId" = s.id
         AND s."organizationId" IS NOT NULL
    `,
  },
  {
    name: "qabul qiluvchi o'qituvchi orqali",
    sql: `
      UPDATE "Notification" n
         SET "organizationId" = t."organizationId"
        FROM "Teacher" t
       WHERE n."organizationId" IS NULL
         AND n.audience = 'USER'
         AND n."recipientRole" = 'TEACHER'
         AND n."recipientId" = t.id
         AND t."organizationId" IS NOT NULL
    `,
  },
  {
    name: 'qabul qiluvchi xodim orqali',
    sql: `
      UPDATE "Notification" n
         SET "organizationId" = u."organizationId"
        FROM "User" u
       WHERE n."organizationId" IS NULL
         AND n.audience = 'USER'
         AND n."recipientRole" NOT IN ('STUDENT', 'TEACHER')
         AND n."recipientId" = u.id
         AND u."organizationId" IS NOT NULL
    `,
  },
  {
    name: "yuboruvchi o'qituvchi orqali",
    sql: `
      UPDATE "Notification" n
         SET "organizationId" = t."organizationId"
        FROM "Teacher" t
       WHERE n."organizationId" IS NULL
         AND n."createdByRole" = 'TEACHER'
         AND n."createdById" = t.id
         AND t."organizationId" IS NOT NULL
    `,
  },
  {
    name: "yuboruvchi o'quvchi orqali",
    sql: `
      UPDATE "Notification" n
         SET "organizationId" = s."organizationId"
        FROM "Student" s
       WHERE n."organizationId" IS NULL
         AND n."createdByRole" = 'STUDENT'
         AND n."createdById" = s.id
         AND s."organizationId" IS NOT NULL
    `,
  },
  {
    /*
      SUPERADMIN ataylab chetda qoldiriladi: platforma egasining e'loni
      hamma markazga ko'rinishi KERAK, `organizationId` esa aynan shuni
      bildiradi (NULL = umumiy e'lon).
    */
    name: 'yuboruvchi xodim orqali (SUPERADMIN dan tashqari)',
    sql: `
      UPDATE "Notification" n
         SET "organizationId" = u."organizationId"
        FROM "User" u
       WHERE n."organizationId" IS NULL
         AND n."createdByRole" IS NOT NULL
         AND n."createdByRole" NOT IN ('SUPERADMIN', 'TEACHER', 'STUDENT')
         AND n."createdById" = u.id
         AND u."organizationId" IS NOT NULL
    `,
  },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    /*
      Tashkilot raqami eng boshida tekshiriladi: xatolikni ish boshlanguncha
      aytgan yaxshi, aks holda terib xato qilingan raqam faqat ishning
      oxirida (yoki umuman ish bo'lmasa, hech qachon) bilinardi.
    */
    let fallbackOrgName = null;
    if (FALLBACK_ORG_ID !== null) {
      const org = await pool.query(
        'SELECT id, name FROM "Organization" WHERE id = $1',
        [FALLBACK_ORG_ID],
      );

      if (org.rowCount === 0) {
        throw new Error(`Tashkilot topilmadi: id=${FALLBACK_ORG_ID}`);
      }

      fallbackOrgName = org.rows[0].name;
    }

    const before = await pool.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE "organizationId" IS NULL)::int AS bogliqsiz
        FROM "Notification"
    `);

    console.log(
      `Xabarnomalar: jami ${before.rows[0].total}, ` +
        `tashkilotsiz ${before.rows[0].bogliqsiz}\n`,
    );

    if (before.rows[0].bogliqsiz === 0) {
      console.log("Biriktirish kerak bo'lgan qator yo'q.");
      return;
    }

    await pool.query('BEGIN');

    let updated = 0;
    for (const step of STEPS) {
      const result = await pool.query(step.sql);
      updated += result.rowCount;
      console.log(`  ${String(result.rowCount).padStart(5)}  ${step.name}`);
    }

    if (FALLBACK_ORG_ID !== null) {
      /*
        Bu yerda ham SUPERADMIN yozganlari tegilmaydi — ular umumiy e'lon
        bo'lishi mumkin va uni bitta markazga yopib qo'yish ma'lumot
        yo'qotish bilan teng.
      */
      const result = await pool.query(
        `
          UPDATE "Notification"
             SET "organizationId" = $1
           WHERE "organizationId" IS NULL
             AND ("createdByRole" IS NULL OR "createdByRole" <> 'SUPERADMIN')
        `,
        [FALLBACK_ORG_ID],
      );

      updated += result.rowCount;
      console.log(
        `  ${String(result.rowCount).padStart(5)}  zaxira variant -> ` +
          `${fallbackOrgName} (id=${FALLBACK_ORG_ID})`,
      );
    }

    // Qolganlarni sababi bilan ko'rsatamiz — qo'lda hal qilish uchun.
    const remaining = await pool.query(`
      SELECT COALESCE("createdByRole"::text, '(nomalum)') AS yuboruvchi,
             audience::text AS auditoriya,
             count(*)::int AS soni
        FROM "Notification"
       WHERE "organizationId" IS NULL
    GROUP BY 1, 2
    ORDER BY 3 DESC
    `);

    console.log(`\nBiriktirildi: ${updated}`);

    if (remaining.rowCount > 0) {
      console.log('\nTashkilotsiz qolganlari:');
      remaining.rows.forEach((row) => {
        const izoh =
          row.yuboruvchi === 'SUPERADMIN'
            ? "  <- ataylab: platforma e'loni"
            : '';
        console.log(
          `  ${String(row.soni).padStart(5)}  ${row.yuboruvchi} / ${row.auditoriya}${izoh}`,
        );
      });
    }

    if (APPLY) {
      await pool.query('COMMIT');
      console.log('\n✅ Yozildi.');
    } else {
      await pool.query('ROLLBACK');
      console.log(
        '\nSINOV REJIMI — hech narsa yozilmadi.\n' +
          'Yozish uchun: node scripts/backfill-notification-org.js --apply',
      );
    }
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('\n❌ XATO:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
