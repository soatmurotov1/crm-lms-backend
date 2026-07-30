#!/bin/bash
#
# Zaxira nusxadan bazani tiklaydi.
#
# Ishlatish:
#   ./scripts/restore-db.sh backups/crm_lms_2026-07-31_0300.sql.gz
#
# DIQQAT: bu buyruq bazadagi HOZIRGI ma'lumotni o'chiradi va uning o'rniga
# nusxadagini qo'yadi. Shuning uchun tasdiqlash so'raladi.
#
# Nusxa haqiqatan ishlashini sinash uchun (tavsiya: oyiga bir marta)
# `--dry-run` bilan ishga tushiring: u vaqtinchalik bazaga tiklab ko'radi va
# asosiy bazaga tegmaydi.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

DB_CONTAINER="${DB_CONTAINER:-crm-lms-backend-db}"
APP_CONTAINER="${APP_CONTAINER:-crm-lms-backend-app}"

usage() {
    echo "Ishlatish: $0 <nusxa-fayli.sql.gz> [--dry-run]"
    echo
    echo "  --dry-run   Vaqtinchalik bazaga tiklab ko'radi (asosiy bazaga tegmaydi)"
    exit 1
}

ARCHIVE="${1:-}"
MODE="${2:-}"

[ -z "$ARCHIVE" ] && usage
[ -f "$ARCHIVE" ] || { echo "XATO: fayl topilmadi: $ARCHIVE"; exit 1; }

if ! gzip -t "$ARCHIVE" 2>/dev/null; then
    echo "XATO: arxiv buzuq: $ARCHIVE"
    exit 1
fi

if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-crm_lms}"

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    echo "XATO: baza konteyneri ishlamayapti: $DB_CONTAINER"
    exit 1
fi

# ---------------------------------------------------------------------------
# Sinov rejimi: nusxa haqiqatan tiklanadimi - asosiy bazaga tegmasdan.
# ---------------------------------------------------------------------------
if [ "$MODE" = "--dry-run" ]; then
    TEST_DB="restore_test_$(date '+%s')"

    echo "Sinov bazasi yaratilmoqda: $TEST_DB"
    docker exec "$DB_CONTAINER" createdb -U "$DB_USER" "$TEST_DB"

    cleanup() {
        echo "Sinov bazasi o'chirilmoqda: $TEST_DB"
        docker exec "$DB_CONTAINER" dropdb -U "$DB_USER" --if-exists "$TEST_DB" || true
    }
    trap cleanup EXIT

    echo "Tiklanmoqda..."
    gunzip -c "$ARCHIVE" | docker exec -i "$DB_CONTAINER" \
        psql -U "$DB_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 >/dev/null

    TABLES="$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -tAc \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"

    echo
    echo "✅ Nusxa yaroqli. Tiklangan jadvallar soni: $TABLES"
    exit 0
fi

# ---------------------------------------------------------------------------
# Haqiqiy tiklash.
# ---------------------------------------------------------------------------
echo
echo "⚠️  DIQQAT: '$DB_NAME' bazasidagi hozirgi MA'LUMOT O'CHIRILADI"
echo "    Nusxa: $ARCHIVE"
echo
read -r -p "Davom etilsinmi? 'ha' deb yozing: " CONFIRM

if [ "$CONFIRM" != "ha" ]; then
    echo "Bekor qilindi."
    exit 1
fi

# Tiklash paytida ilova bazaga yozmasligi kerak.
if docker ps --format '{{.Names}}' | grep -qx "$APP_CONTAINER"; then
    echo "Ilova to'xtatilmoqda..."
    docker stop "$APP_CONTAINER" >/dev/null
    RESTART_APP=1
else
    RESTART_APP=0
fi

# Tiklashdan oldin hozirgi holatning nusxasini olamiz - noto'g'ri fayl
# tanlangan bo'lsa qaytish imkoni qolsin.
SAFETY="backups/pre-restore_$(date '+%Y-%m-%d_%H%M').sql.gz"
mkdir -p backups
echo "Hozirgi holat saqlanmoqda: $SAFETY"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
    | gzip -9 > "$SAFETY"

echo "Tiklanmoqda..."
gunzip -c "$ARCHIVE" | docker exec -i "$DB_CONTAINER" \
    psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 >/dev/null

echo "✅ Tiklandi."

if [ "$RESTART_APP" = "1" ]; then
    echo "Ilova qayta ishga tushirilmoqda..."
    docker start "$APP_CONTAINER" >/dev/null
fi

echo
echo "Tiklashdan oldingi holat bu yerda saqlangan: $SAFETY"
