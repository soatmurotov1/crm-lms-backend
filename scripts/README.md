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
✅ Nusxa yaroqli. Tiklangan jadvallar soni: 27
```

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

## Nima qilinmagan

Bu skriptlar **kunlik** nusxa oladi — ya'ni eng yomon holatda 24 soatlik
ma'lumot yo'qolishi mumkin. Bu yetarli bo'lmasa, keyingi qadam — WAL
arxivlash (`pgBackRest` yoki `wal-g`) bilan istalgan daqiqaga qaytish.
