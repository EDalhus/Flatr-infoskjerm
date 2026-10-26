# Gjenoppretting av Flatr fra backup

Backup tas hver natt kl. 03:30 av `deploy/backup.sh` (cron: `/etc/cron.d/flatr-backup`).

| Hva | Hvor |
|---|---|
| Databaser (alle kunder + plattform) | `/opt/flatr-backups/db/flatr-db-<dato>.tgz` – 14 dager |
| Mediefiler | `/opt/flatr-backups/media/<kunde>/` |
| Utenfor serveren (hvis satt opp) | rclone-remote `flatr-offsite`, bøtte `flatr-backup` |

## Hele plattformen

```bash
cd /opt/flatr
docker compose stop flatr
mkdir -p /tmp/restore && tar xzf /opt/flatr-backups/db/flatr-db-<dato>.tgz -C /tmp/restore
cp /tmp/restore/platform.db data/platform.db
for f in /tmp/restore/tenants/*.db; do
  slug=$(basename "$f" .db)
  mkdir -p "data/tenants/$slug"
  cp "$f" "data/tenants/$slug/db.sqlite"
  rm -f "data/tenants/$slug/db.sqlite-wal" "data/tenants/$slug/db.sqlite-shm"
  rsync -a "/opt/flatr-backups/media/$slug/" "data/tenants/$slug/media/"
done
rm -f data/platform.db-wal data/platform.db-shm
chown -R 1000:1000 data
docker compose start flatr
```

## Én kunde

Samme som over, men bare for `tenants/<slug>.db` og `media/<slug>/` – `platform.db` røres ikke.

## Fra Cloudflare R2 (hvis serveren er borte)

```bash
rclone copy flatr-offsite:flatr-backup/db /opt/flatr-backups/db
rclone copy flatr-offsite:flatr-backup/media /opt/flatr-backups/media
```

Deretter som over.
