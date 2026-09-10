#!/bin/bash
# 02 脚本证书已签发、仅第5步因 nginx1.24 不支持 http2 on 而中断；本脚本渲染修正模板并完成启用/续期/自检。
set -euo pipefail
PRIMARY=www.jingjingrishang.com
ROOTD=jingjingrishang.com
SITE=/etc/nginx/sites-available/jjsr
HERE="$(cd "$(dirname "$0")" && pwd)"
TPL="$HERE/nginx_dual.conf.template"

echo "==> [1/5] render fixed HTTPS site & reload"
sed -e "s/__PRIMARY__/$PRIMARY/g" -e "s/__ROOT__/$ROOTD/g" "$TPL" > "$SITE"
nginx -t
systemctl reload nginx

echo "==> [2/5] renewal deploy hook + timer"
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh <<'EOF'
#!/bin/bash
nginx -t && systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh
systemctl enable --now certbot.timer >/dev/null 2>&1 || true

echo "==> [3/5] renewal dry-run (real ACME webroot validation over HTTP-01)"
certbot renew --dry-run

echo "==> [4/5] local selfcheck"
curl -s -m8 -o /dev/null -w "http80 code=%{http_code} loc=%{redirect_url}\n" -H "Host: $PRIMARY" http://127.0.0.1/api/health
echo -n "https443 www  -> "; curl -s -m8 https://127.0.0.1/api/health -H "Host: $PRIMARY" --resolve "$PRIMARY:443:127.0.0.1" --resolve "$ROOTD:443:127.0.0.1"; echo
echo -n "https443 root -> "; curl -s -m8 https://127.0.0.1/api/health -H "Host: $ROOTD"  --resolve "$PRIMARY:443:127.0.0.1" --resolve "$ROOTD:443:127.0.0.1"; echo

echo "==> [5/5] listening sockets"
ss -tlnp | grep -E ':80 |:443 |:3000 '
echo ENABLE_DONE
