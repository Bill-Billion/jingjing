#!/bin/bash
echo "=ufw="; ufw status 2>&1 | head -5
echo "=iptables INPUT="; iptables -L INPUT -n -v --line-numbers 2>&1 | head -25
echo "=nginx listen="; ss -tlnp | grep -E ':80 |:443 '
echo "=self visit public:80="; curl -s -m6 -o /dev/null -w "http_code=%{http_code} time=%{time_total}\n" http://8.222.213.43/api/health
echo "=local nginx 80="; curl -s -m6 http://127.0.0.1/api/health; echo
echo "=nginx error log="; tail -6 /var/log/nginx/error.log 2>/dev/null || echo "no error log"
echo "=nginx access tail="; tail -4 /var/log/nginx/access.log 2>/dev/null || echo "no access log"
