#!/bin/bash
#
# Bazaning kunlik zaxira nusxasini oladi.
#
# Ishlatish (serverda, loyiha papkasidan):
#   ./scripts/backup-db.sh
#
# Cron orqali avtomatik ishga tushirish uchun: ./scripts/install-backup-cron.sh
#
# Muvaffaqiyatsiz tugasa 0 dan farqli kod qaytaradi - cron buni pochta yoki
# monitoring orqali xabar qilishi mumkin.

set -euo pipefail

# Skript qayerdan chaqirilishidan qat'i nazar loyiha papkasida ishlaymiz.
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
LOG_FILE="${BACKUP_LOG_FILE:-$BACKUP_DIR/backup.log}"
# Nechа kunlik nusxa saqlanadi.
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DB_CONTAINER="${DB_CONTAINER:-crm-lms-backend-db}"

mkdir -p "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

fail() {
    log "XATO: $*"
    exit 1
}

# .env dagi DB nomi va foydalanuvchisi kerak. `set -a` bilan o'qiymiz,
# lekin `source` qilishdan oldin izohlar va bo'sh qatorlar muammo qilmaydi.
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
else
    fail ".env fayli topilmadi ($PROJECT_DIR/.env)"
fi

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-crm_lms}"

TIMESTAMP="$(date '+%Y-%m-%d_%H%M')"
ARCHIVE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

log "Zaxira boshlandi: $DB_NAME -> $(basename "$ARCHIVE")"

# Konteyner ishlab turganini tekshiramiz, aks holda pg_dump tushunarsiz
# xato beradi.
if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    fail "Baza konteyneri ishlamayapti: $DB_CONTAINER"
fi

# --clean --if-exists: tiklashda mavjud jadvallar avval o'chiriladi, ya'ni
# nusxani bo'sh bo'lmagan bazaga ham qo'llash mumkin.
# Quvurda xato bo'lsa `pipefail` uni ushlaydi.
if ! docker exec "$DB_CONTAINER" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
    | gzip -9 > "$ARCHIVE"; then
    rm -f "$ARCHIVE"
    fail "pg_dump bajarilmadi"
fi

# Bo'sh yoki buzuq arxiv - zaxira yo'qligidan ham yomon, chunki u borga
# o'xshab turadi. Shuning uchun darhol tekshiramiz.
if ! gzip -t "$ARCHIVE" 2>/dev/null; then
    rm -f "$ARCHIVE"
    fail "Arxiv buzuq (gzip -t o'tmadi)"
fi

ARCHIVE_SIZE="$(stat -c '%s' "$ARCHIVE" 2>/dev/null || stat -f '%z' "$ARCHIVE")"
MIN_SIZE=1024

if [ "$ARCHIVE_SIZE" -lt "$MIN_SIZE" ]; then
    rm -f "$ARCHIVE"
    fail "Arxiv juda kichik ($ARCHIVE_SIZE bayt) - bo'sh dump bo'lishi mumkin"
fi

# Hajm ham yetarli dalil emas: faqat sxemadan iborat nusxa bir necha kilobayt
# bo'ladi va yuqoridagi tekshiruvdan bemalol o'tadi. Shuning uchun arxiv ichida
# haqiqiy qatorlar borligini sanaymiz - `COPY ... FROM stdin` bloklari orasidagi
# satrlar. Bazada ma'lumot bor, nusxada yo'q bo'lsa - bu jimgina falokat.
LIVE_ROWS="$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "
    SELECT coalesce(sum(cnt), 0) FROM (
        SELECT (xpath('/row/c/text()', query_to_xml(
            format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
            false, true, '')))[1]::text::bigint AS cnt
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ) t" | tr -d '[:space:]')"

DUMP_ROWS="$(gunzip -c "$ARCHIVE" | awk '
    /^COPY .* FROM stdin;$/ { inblock = 1; next }
    inblock && /^\\\.$/     { inblock = 0; next }
    inblock                 { n++ }
    END                     { print n + 0 }')"

if [ "${LIVE_ROWS:-0}" -gt 0 ] && [ "$DUMP_ROWS" -eq 0 ]; then
    rm -f "$ARCHIVE"
    fail "Bazada $LIVE_ROWS qator bor, arxivda esa 0 - nusxa ma'lumotsiz chiqdi"
fi

log "Qatorlar: bazada $LIVE_ROWS, arxivda $DUMP_ROWS"

log "Tayyor: $(basename "$ARCHIVE") ($(numfmt --to=iec "$ARCHIVE_SIZE" 2>/dev/null || echo "$ARCHIVE_SIZE bayt"))"

# ---------------------------------------------------------------------------
# Tashqi saqlash (ixtiyoriy, lekin QAT'IY tavsiya etiladi).
#
# Nusxa o'sha serverda yotsa - server yo'qolganda nusxa ham yo'qoladi.
# .env ga quyidagilarni qo'shsangiz avtomatik yuklanadi:
#   BACKUP_S3_BUCKET=s3://mening-bucketim/crm-backups
#   AWS_ACCESS_KEY_ID=...
#   AWS_SECRET_ACCESS_KEY=...
#   BACKUP_S3_ENDPOINT=https://fra1.digitaloceanspaces.com
# ---------------------------------------------------------------------------
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    if command -v aws >/dev/null 2>&1; then
        ENDPOINT_ARG=()
        if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
            ENDPOINT_ARG=(--endpoint-url "$BACKUP_S3_ENDPOINT")
        fi

        if aws "${ENDPOINT_ARG[@]}" s3 cp "$ARCHIVE" "$BACKUP_S3_BUCKET/" >/dev/null; then
            log "Tashqi saqlashga yuklandi: $BACKUP_S3_BUCKET"
        else
            # Yuklanmasa ham lokal nusxa bor - shuning uchun to'xtamaymiz,
            # lekin bu holat ko'zga tashlanishi kerak.
            log "OGOHLANTIRISH: tashqi saqlashga yuklab bo'lmadi"
        fi
    else
        log "OGOHLANTIRISH: BACKUP_S3_BUCKET berilgan, lekin aws CLI o'rnatilmagan"
    fi
fi

# ---------------------------------------------------------------------------
# Eski nusxalarni tozalash.
# ---------------------------------------------------------------------------
DELETED="$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime "+$RETENTION_DAYS" -print -delete | wc -l)"

if [ "$DELETED" -gt 0 ]; then
    log "$DELETED ta eski nusxa o'chirildi (${RETENTION_DAYS} kundan eski)"
fi

REMAINING="$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f | wc -l)"
log "Jami nusxalar: $REMAINING"
