cd /opt/jjsr
echo "=== syntax check ==="
node -c routes/samples.js && echo "samples.js syntax ok"
echo "=== migrate db ==="
node migrate_samples.cjs
echo "=== reload pm2 ==="
pm2 reload jjsr --update-env 2>&1 | tail -3
sleep 2
echo "=== library via local backend ==="
curl -s -m8 "http://127.0.0.1:3000/api/samples/library" -o /tmp/lib.json
node -e 'const d=require("/tmp/lib.json");for(const g in d.library){for(const it of d.library[g])console.log(it.id,"|",g,"|",it.title,"| video="+(it.video_url||"-"),"| cover="+(it.cover_url||"-"));}'
echo "=== static head (https via nginx) ==="
curl -s -I -m8 "https://www.jingjingrishang.com/uploads/samples/huangdi_ttx.mp4" | grep -iE "HTTP/|content-type|content-length|accept-ranges"
curl -s -I -m8 "https://www.jingjingrishang.com/uploads/samples/renxingju_7sins.mp4" | grep -iE "HTTP/|content-type|content-length|accept-ranges"
echo "=== range 0-1023 ==="
curl -s -m8 -r 0-1023 -o /dev/null -w "huangdi range=%{http_code} type=%{content_type}\n" "https://www.jingjingrishang.com/uploads/samples/huangdi_ttx.mp4"
curl -s -m8 -r 0-1023 -o /dev/null -w "renxing range=%{http_code} type=%{content_type}\n" "https://www.jingjingrishang.com/uploads/samples/renxingju_7sins.mp4"
echo "=== cover head ==="
curl -s -I -m8 "https://www.jingjingrishang.com/uploads/samples/huangdi_ttx_cover.jpg" | grep -iE "HTTP/|content-type"
echo APPLY_DONE
