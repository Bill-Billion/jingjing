#!/bin/bash
set -e
cd /opt/jjsr
node --check routes/humans.js && echo HUMANS_CHECK_OK
node --check routes/videos.js && echo VIDEOS_CHECK_OK
pm2 restart jjsr --update-env >/dev/null && pm2 save >/dev/null
sleep 2
echo HEALTH_LOCAL:; curl -s http://127.0.0.1:3000/api/health; echo
echo MINE_NO_TOKEN:; curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3000/api/humans?mine=1'
echo HUMANS_LIST:; curl -s 'http://127.0.0.1:3000/api/humans?pageSize=2' | head -c 300; echo
pm2 logs jjsr --lines 10 --nostream --err | tail -n 12
