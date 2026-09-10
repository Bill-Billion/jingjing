#!/bin/bash
set -e
cd /opt/jjsr
node --check routes/videos.js && echo CHECK_OK
pm2 restart jjsr --update-env >/dev/null && pm2 save >/dev/null
sleep 2
curl -s http://127.0.0.1:3000/api/health; echo
