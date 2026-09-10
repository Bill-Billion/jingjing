#!/bin/bash
# =============================================================================
# 晶晶日上 · 双域名(www + 主域) Let's Encrypt webroot 签发 + HTTPS 启用
# 幂等、可重复运行(--keep-until-expiring)；签发期间网站保持 HTTP 可用，不中断业务。
# 正式入口 PRIMARY=https://www.jingjingrishang.com；主域同时可用。
# 回滚：cp /etc/nginx/sites-available/jjsr.httpbak /etc/nginx/sites-available/jjsr && nginx -t && systemctl reload nginx
# =============================================================================
set -euo pipefail
PRIMARY=www.jingjingrishang.com
ROOTD=jingjingrishang.com
WEBROOT=/var/www/letsencrypt
SITE=/etc/nginx/sites-available/jjsr
HERE="$(cd "$(dirname "$0")" && pwd)"
TPL="$HERE/nginx_dual.conf.template"

echo "==> [1/7] install certbot (skip if present)"
export DEBIAN_FRONTEND=noninteractive
if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq certbot
fi
certbot --version

echo "==> [2/7] webroot dir"
mkdir -p "$WEBROOT/.well-known/acme-challenge"
chown -R www-data:www-data /var/www/letsencrypt || true
echo "ping-$$" > "$WEBROOT/.well-known/acme-challenge/selftest"

echo "==> [3/7] temporary HTTP site: ACME pass-through + normal proxy (no downtime)"
cat > "$SITE" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $PRIMARY $ROOTD _;
    client_max_body_size 50m;
    location ^~ /.well-known/acme-challenge/ {
        root $WEBROOT;
        default_type "text/plain";
        try_files \$uri =404;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
EOF
ln -sf "$SITE" /etc/nginx/sites-enabled/jjsr
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
echo -n "acme selftest via nginx -> "
curl -s -m8 -H "Host: $PRIMARY" http://127.0.0.1/.well-known/acme-challenge/selftest; echo
rm -f "$WEBROOT/.well-known/acme-challenge/selftest"

echo "==> [4/7] issue cert (www + root SAN; idempotent)"
certbot certonly --webroot -w "$WEBROOT" -d "$PRIMARY" -d "$ROOTD" \
  --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
ls -l "/etc/letsencrypt/live/$PRIMARY/"

echo "==> [5/7] render & enable HTTPS site (80 -> 443)"
[ -f "$TPL" ] || { echo "missing template $TPL"; exit 2; }
sed -e "s/__PRIMARY__/$PRIMARY/g" -e "s/__ROOT__/$ROOTD/g" "$TPL" > "$SITE"
nginx -t
systemctl reload nginx

echo "==> [6/7] renewal hook + timer + dry-run"
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh <<'EOF'
#!/bin/bash
nginx -t && systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh
systemctl enable --now certbot.timer >/dev/null 2>&1 || true
certbot renew --dry-run || echo "dry-run can be re-run later manually"

echo "==> [7/7] self check"
curl -s -m8 -o /dev/null -w "http80 code=%{http_code} location=%{redirect_url}\n" -H "Host: $PRIMARY" http://127.0.0.1/api/health
echo -n "https443 health -> "
curl -s -m8 https://127.0.0.1/api/health -H "Host: $PRIMARY" --resolve "$PRIMARY:443:127.0.0.1" --resolve "$ROOTD:443:127.0.0.1"; echo
echo "ALL_DONE"
