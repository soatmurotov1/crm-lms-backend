# Zaxira nusxa (backup) va tiklash

Bazaning zaxira nusxasini olish, tekshirish va tiklash uchun skriptlar.
Hammasi **serverda**, loyiha papkasidan (`/root/crm-lms-backend`) ishlatiladi.

## Bir marta sozlash

```bash
chmod +x scripts/*.sh
./scripts/install-backup-cron.sh
```

Shundan keyin har kuni soat **03:00** da nusxa avtomatik olinadi.

Darhol bir marta sinab ko'ring — cron ertaga ishlashini kutib o'tirmang:

```bash
./scripts/backup-db.sh
ls -lh backups/
```

## Tashqi saqlashni yoqish (muhim)

Nusxa o'sha serverda yotsa, server yo'qolganda nusxa ham yo'qoladi.
DigitalOcean Spaces yoki boshqa S3-mos xizmatga yuklash uchun `.env` ga
qo'shing:

```env
BACKUP_S3_BUCKET=s3://crm-backups/najot
BACKUP_S3_ENDPOINT=https://fra1.digitaloceanspaces.com
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Serverda `aws` CLI kerak:

```bash
apt-get install -y awscli
```

Kalitlar berilgach `backup-db.sh` har safar nusxani avtomatik yuklaydi.

## Sozlamalar

Hammasi `.env` orqali o'zgartiriladi:

| O'zgaruvchi | Sukut bo'yicha | Vazifasi |
|---|---|---|
| `BACKUP_RETENTION_DAYS` | `30` | Nusxa necha kun saqlanadi |
| `BACKUP_DIR` | `<loyiha>/backups` | Nusxalar qayerda yotadi |
| `BACKUP_SCHEDULE` | `0 3 * * *` | Cron jadvali |
| `BACKUP_S3_BUCKET` | — | Berilsa, tashqi saqlashga yuklanadi |
| `DB_CONTAINER` | `crm-lms-backend-db` | Baza konteyneri nomi |

## Nusxa ishlashini tekshirish

**Sinalmagan nusxa — nusxa emas.** Oyiga bir marta quyidagini bajaring —
u vaqtinchalik bazaga tiklab ko'radi va asosiy bazaga **tegmaydi**:

```bash
./scripts/restore-db.sh backups/crm_lms_2026-07-31_0300.sql.gz --dry-run
```

Natija:

```
Eng katta jadvallar:
  Student: 251
  Organization: 1
  Course: 1

✅ Nusxa yaroqli. Jadvallar: 30, jami qatorlar: 253
```

Jadval soni yolg'iz o'zi yetarli emas: `--schema-only` nusxada ham hamma jadval
bor, lekin ichi bo'sh. Shuning uchun **qatorlar ham sanaladi** va bitta ham
qator bo'lmasa skript `❌` bilan `1` kodini qaytaradi. `backup-db.sh` ham
xuddi shu tekshiruvni har safar bajaradi: bazada qator bor-u arxivda yo'q
bo'lsa, arxiv o'chiriladi va zaxira muvaffaqiyatsiz deb belgilanadi.

Ikkala skript ham xatoda **0 dan farqli kod** qaytaradi — cron yoki monitoring
shu kod bo'yicha ogohlantirsin.

## Haqiqiy tiklash

```bash
./scripts/restore-db.sh backups/crm_lms_2026-07-31_0300.sql.gz
```

Skript ketma-ket:

1. `ha` deb tasdiqlashni so'raydi
2. ilovani to'xtatadi (tiklash paytida bazaga yozilmasin)
3. **hozirgi holatning nusxasini** `backups/pre-restore_*.sql.gz` ga saqlaydi
4. nusxani tiklaydi
5. ilovani qayta ishga tushiradi

Noto'g'ri fayl tanlagan bo'lsangiz, 3-qadamdagi fayldan qaytib olasiz.

## Sinovdan o'tgani

2026-08-05 da skriptlar haqiqiy Docker muhitida boshdan-oxir sinaldi:
baza to'ldirildi → zaxira olindi → **postgres volume butunlay o'chirildi**
(disk yo'qolishi taqlidi) → bo'sh konteynerdan faqat arxiv yordamida
tiklandi. Natija: 30 jadval, 253 qator, 16 enum turi joyida; `id` ketma-ketligi
ham to'g'ri tiklandi (tiklashdan keyingi birinchi yozuv `251` oldi, ya'ni
birlamchi kalit to'qnashuvi yo'q).

## Nima qilinmagan

**1. Nusxalar hamon o'sha serverda.** `BACKUP_S3_BUCKET` sozlanmagan ekan —
ya'ni droplet yo'qolsa, zaxira ham u bilan birga yo'qoladi. Kod tayyor,
faqat kalitlar kerak (yuqoridagi "Tashqi saqlashni yoqish" bo'limi). Bu
zaxira tizimidagi eng katta ochiq risk.

**2. Bo'sh bazani migratsiyadan qurib bo'lmaydi.** `20260729000000_...`
migratsiyasi `Exam` jadvaliga tashqi kalit qo'yadi, `Exam` esa undan keyingi
`20260729010000_exam_module` da yaratiladi. Shu sababli toza bazada
`prisma migrate deploy` shu joyda to'xtaydi (sinab ko'rilgan). Zaxiradan
tiklashga bu ta'sir qilmaydi — dump'da to'liq sxema bor — lekin "noldan yangi
server ko'tarish" yo'li hozir ishlamaydi.

**3. Kunlik oraliq.** Eng yomon holatda 24 soatlik ma'lumot yo'qoladi. Bu
yetarli bo'lmasa, keyingi qadam — WAL arxivlash (`pgBackRest` yoki `wal-g`)
bilan istalgan daqiqaga qaytish.

---

# Bir martalik ma'lumot skriptlari

## Eski xabarnomalarni tashkilotga biriktirish

`backfill-notification-org.js`

2026-08-10 gacha `Notification.organizationId` so'rovdan kelardi va ko'pincha
bo'sh qolardi. Bo'sh qolgan xabarnoma esa rol bo'yicha auditoriyada
(`ALL`, `STUDENTS`, `TEACHERS`, `ADMINS`) **hamma tashkilotdagi** foydalanuvchiga
ko'rinadi — ya'ni bitta markazning e'loni butun platformaga tarqalgan. Kod
tuzatildi, bu skript esa eski qatorlarni tartibga soladi.

Avval nima o'zgarishini ko'ring (hech narsa yozilmaydi):

```bash
node scripts/backfill-notification-org.js
```

Natija:

```
Xabarnomalar: jami 9, tashkilotsiz 9

      1  guruh orqali (eng ishonchli)
      1  qabul qiluvchi o'quvchi orqali
      ...
Biriktirildi: 7

Tashkilotsiz qolganlari:
      1  ADMIN / ALL
      1  SUPERADMIN / ALL  <- ataylab: platforma e'loni
```

Raqamlar to'g'ri bo'lsa, yozing:

```bash
node scripts/backfill-notification-org.js --apply
```

Tashkilot quyidagi tartibda aniqlanadi — yuqoridagisi ishonchliroq:
guruh → qabul qiluvchi → yuboruvchi. **SUPERADMIN yozgan xabarnomalarga
tegilmaydi**: ular butun platformaga mo'ljallangan umumiy e'lon va
`organizationId = NULL` aynan shuni bildiradi.

Hech qanday belgi bo'yicha aniqlab bo'lmaganlarni majburan bittasiga berish
mumkin (bitta markazli o'rnatmalarda qulay):

```bash
node scripts/backfill-notification-org.js --apply --fallback-org=2
```

Skript **qayta chaqirilsa xavfsiz** — faqat `organizationId IS NULL`
qatorlarga tegadi va hammasi bitta tranzaksiyada bajariladi.
