echo "== server-side resolve =="
(getent hosts www.jingjingrishang.com || echo no-resolve-www)
(getent hosts jingjingrishang.com || echo no-resolve-root)
command -v dig >/dev/null && { dig +short www.jingjingrishang.com; dig +short jingjingrishang.com; } || echo no-dig
echo "== ufw =="
(ufw status verbose 2>/dev/null || echo ufw-not-active-or-absent)
echo "== iptables 443/80/3000 hints =="
(iptables -L INPUT -n 2>/dev/null | head -20 || echo no-iptables-read)
echo "== external IP self =="
(curl -s -m8 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null || curl -s -m8 ifconfig.me 2>/dev/null || echo no-metadata); echo
echo "== nginx site current =="
cat /etc/nginx/sites-available/jjsr
