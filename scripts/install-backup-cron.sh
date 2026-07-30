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

chmod +x "$BACKUP_SCRIPT"

# Mavjud crontab'dan eski yozuvni olib tashlab, yangisini qo'shamiz.
CURRENT="$(crontab -l 2>/dev/null | grep -v "$MARKER" || true)"

{
    [ -n "$CURRENT" ] && echo "$CURRENT"
    echo "$SCHEDULE $BACKUP_SCRIPT >/dev/null 2>&1 $MARKER"
} | crontab -

echo "✅ Cron sozlandi:"
crontab -l | grep "$MARKER"
echo
echo "Tekshirish uchun hoziroq bir marta ishga tushiring:"
echo "  $BACKUP_SCRIPT"
