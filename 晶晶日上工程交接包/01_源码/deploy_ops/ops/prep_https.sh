mkdir -p /opt/jjsr/https
echo "== sites-available / enabled =="
ls -la /etc/nginx/sites-available/ /etc/nginx/sites-enabled/ 2>/dev/null
echo "== idempotent backup of current site(s) =="
for f in /etc/nginx/sites-available/*; do [ -f "$f" ] && cp -n "$f" "${f}.httpbak" 2>/dev/null || true; done
ls -la /etc/nginx/sites-available/
echo "== certbot =="
which certbot 2>/dev/null || echo no-certbot
echo "== webroot =="
ls -ld /var/www/letsencrypt 2>/dev/null || echo no-webroot
echo "== nginx root/proxy lines =="
nginx -T 2>/dev/null | grep -Ei "root |location |proxy_pass|server_name" | head -30
