#!/bin/bash
#
# Kunlik zaxira nusxani cron'ga qo'yadi.
#
# Serverda bir marta ishga tushiriladi:
#   ./scripts/install-backup-cron.sh
#
# Qayta ishga tushirilsa eski yozuv almashtiriladi, ikkinchi nusxa qo'shilmaydi.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_SCRIPT="$PROJECT_DIR/scripts/backup-db.sh"

# Har kuni soat 03:00 da - kunlik yuk eng past bo'lgan payt.
SCHEDULE="${BACKUP_SCHEDULE:-0 3 * * *}"
MARKER="# crm-lms-backup"
CRON_LOG="$PROJECT_DIR/backups/cron.log"

chmod +x "$BACKUP_SCRIPT"
mkdir -p "$PROJECT_DIR/backups"

# Cron'ning PATH'i juda qisqa (odatda /usr/bin:/bin). `docker` boshqa joyda
# bo'lsa skript "command not found" bilan yiqiladi - shuning uchun PATH'ni
# aniq yozamiz.
CRON_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Mavjud crontab'dan eski yozuvni olib tashlab, yangisini qo'shamiz.
CURRENT="$(crontab -l 2>/dev/null | grep -v "$MARKER" || true)"

# Chiqishni /dev/null ga emas, faylga yozamiz. Aks holda zaxira umuman
# ishlamasa ham (masalan `docker` topilmasa) hech qanday iz qolmaydi va
# "zaxira bor" degan noto'g'ri ishonch paydo bo'ladi.
{
    [ -n "$CURRENT" ] && echo "$CURRENT"
    echo "$SCHEDULE PATH=$CRON_PATH \"$BACKUP_SCRIPT\" >> \"$CRON_LOG\" 2>&1 $MARKER"
} | crontab -

echo "✅ Cron sozlandi:"
crontab -l | grep "$MARKER"
echo
echo "Tekshirish uchun hoziroq bir marta ishga tushiring:"
echo "  $BACKUP_SCRIPT"
