#!/usr/bin/env bash
# Låser serveren til Cloudflare (kjøres som root; trygt å kjøre igjen, f.eks.
# ukentlig fra cron så nye Cloudflare-adresser kommer med):
#
#   1. Port 80/443 er bare åpne for Cloudflares IP-er (ufw). Ingen kan gå forbi
#      Cloudflare direkte mot serverens IP.
#   2. nginx henter den ekte klient-IP-en fra CF-Connecting-IP – men bare når
#      forespørselen kommer fra Cloudflare – og sender den videre som X-Real-IP.
#      Appen stoler bare på X-Real-IP (bremser mot passordgjetting o.l.).
#
# SSH påvirkes ikke.

set -euo pipefail

V4=$(curl -fsS https://www.cloudflare.com/ips-v4)
V6=$(curl -fsS https://www.cloudflare.com/ips-v6)
[ -n "$V4" ] && [ -n "$V6" ] || { echo "Fikk ikke Cloudflares IP-liste – endrer ingenting"; exit 1; }

# nginx: ekte klient-IP fra Cloudflare
{
  echo "# Generert av deploy/cloudflare.sh – ikke rediger for hånd."
  for ip in $V4 $V6; do echo "set_real_ip_from $ip;"; done
  echo "real_ip_header CF-Connecting-IP;"
} > /etc/nginx/conf.d/cloudflare-realip.conf
nginx -t
systemctl reload nginx

# Brannmur: 80/443 bare fra Cloudflare
for ip in $V4 $V6; do
  ufw allow proto tcp from "$ip" to any port 80,443 comment 'cloudflare' >/dev/null
done
# Fjern den gamle «åpent for alle»-regelen (finnes den ikke, gjør det ingenting).
ufw delete allow 'Nginx Full' >/dev/null 2>&1 || true
ufw reload >/dev/null
echo "Ferdig: $(echo $V4 $V6 | wc -w) Cloudflare-nett åpnet for 80/443."
