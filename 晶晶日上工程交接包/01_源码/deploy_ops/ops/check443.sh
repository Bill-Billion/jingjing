echo "== 443 app layer (skip local CA) =="
curl -sk -m8 https://127.0.0.1/api/health -H "Host: www.jingjingrishang.com" --resolve "www.jingjingrishang.com:443:127.0.0.1"; echo
echo "== cert subject/issuer/dates =="
echo | openssl s_client -connect 127.0.0.1:443 -servername www.jingjingrishang.com 2>/dev/null | openssl x509 -noout -subject -issuer -dates 2>/dev/null
echo "== SAN list =="
echo | openssl s_client -connect 127.0.0.1:443 -servername www.jingjingrishang.com 2>/dev/null | openssl x509 -noout -ext subjectAltName 2>/dev/null
echo "== sockets =="
ss -tlnp | grep -E ':80 |:443 |:3000 '
echo "== ca-certificates =="
dpkg -l ca-certificates 2>/dev/null | tail -1
