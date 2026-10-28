#!/usr/bin/env bash
# Nattlig backup av Flatr. Kjøres av cron (deploy/flatr-backup.cron) som root.
#
#   1. Konsistente kopier av alle databaser (server/backup.js i containeren)
#      -> /opt/flatr-backups/db/flatr-db-<dato>.tgz  (de siste 14 beholdes)
#   2. Mediefiler speiles til /opt/flatr-backups/media/ (bare nye filer kopieres)
#   3. Er rclone-remoten «flatr-offsite» satt opp (f.eks. Cloudflare R2),
#      sendes begge deler dit også – da overlever backupen at serveren forsvinner.
#
# Gjenoppretting: se deploy/RESTORE.md.

set -euo pipefail

# Feiler noe, får plattformeierne (SUPERADMIN_EMAILS) beskjed på e-post.
notify_failure() {
  local line=$1
  cd /opt/flatr 2>/dev/null || return 0
  docker compose exec -T -e LINE="$line" flatr node --disable-warning=ExperimentalWarning --input-type=module -e "
    const { sendMail } = await import('./server/mail.js');
    const to = String(process.env.SUPERADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (to.length) await sendMail({ to, subject: 'Backup av Flatr feilet', text: 'Nattens backup stoppet (linje ' + process.env.LINE + '). Se /var/log/flatr-backup.log på serveren.' });
  " >/dev/null 2>&1 || true
}
trap 'notify_failure $LINENO' ERR

APP=/opt/flatr
OUT=/opt/flatr-backups
STAMP=$(date +%Y%m%d-%H%M)
KEEP_DAYS=14
REMOTE=flatr-offsite
BUCKET=${FLATR_BACKUP_BUCKET:-flatr-backup}

mkdir -p "$OUT/db" "$OUT/media"
cd "$APP"

# 1. Databaser (skrives til /data/_backup i containeren = $APP/data/_backup)
rm -rf data/_backup
docker compose exec -T flatr node --disable-warning=ExperimentalWarning server/backup.js /data/_backup
tar czf "$OUT/db/flatr-db-$STAMP.tgz" -C data/_backup .
rm -rf data/_backup
find "$OUT/db" -name 'flatr-db-*.tgz' -mtime +"$KEEP_DAYS" -delete

# 2. Mediefiler (hver kundes media-mappe + skjermbilder)
for dir in data/tenants/*/; do
  slug=$(basename "$dir")
  if [ -d "$dir/media" ]; then
    mkdir -p "$OUT/media/$slug"
    rsync -a "$dir/media/" "$OUT/media/$slug/"
  fi
done

# Plattformens egne filer: app-ikoner (Flatr Apps) og bildene i malmarkedet.
for sub in app-icons market; do
  if [ -d "data/$sub" ]; then
    mkdir -p "$OUT/media/_platform/$sub"
    rsync -a "data/$sub/" "$OUT/media/_platform/$sub/"
  fi
done

# 3. Utenfor serveren, hvis konfigurert
if rclone listremotes 2>/dev/null | grep -q "^$REMOTE:"; then
  rclone copy "$OUT/db" "$REMOTE:$BUCKET/db" --max-age 48h
  rclone sync "$OUT/media" "$REMOTE:$BUCKET/media"
  rclone delete "$REMOTE:$BUCKET/db" --min-age "${KEEP_DAYS}d" || true
  echo "backup $STAMP: lokalt + $REMOTE"
else
  echo "backup $STAMP: bare lokalt (rclone-remoten «$REMOTE» er ikke satt opp)"
fi
