echo "== nginx server_name/listen =="
nginx -T 2>/dev/null | grep -Ei "server_name|listen "
echo "== letsencrypt live =="
ls -la /etc/letsencrypt/live 2>/dev/null || echo no-cert-yet
echo "== listen sockets 80/443/3000 =="
ss -tlnp 2>/dev/null | grep -E ":80 |:443 |:3000 "
echo "== /opt/jjsr/https dir =="
ls -la /opt/jjsr/https 2>/dev/null || echo no-https-dir
echo "== .env url/host hints (no secrets) =="
grep -iE "NOTIFY_URL|PUBLIC|BASE_URL|^HOST|DOMAIN|CALLBACK|RETURN_URL" /opt/jjsr/.env 2>/dev/null || echo no-url-lines
