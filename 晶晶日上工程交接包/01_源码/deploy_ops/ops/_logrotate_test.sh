#!/bin/bash
set +e
echo '== before: logs =='
ls -lah /root/.pm2/logs/ | grep jjsr
echo '== set tiny threshold 1K =='
pm2 set pm2-logrotate:max_size 1K
echo '== append 3KB to logs to exceed threshold =='
for f in /root/.pm2/logs/jjsr-out.log /root/.pm2/logs/jjsr-error.log; do
  head -c 3000 /dev/zero | tr '\0' 'x' >> "$f"
done
ls -lah /root/.pm2/logs/ | grep jjsr
echo '== wait one worker cycle (35s) =='
sleep 35
echo '== after: logs (expect rotated timestamped files / gz) =='
ls -lah /root/.pm2/logs/ | grep -E 'jjsr'
echo '== restore 10M =='
pm2 set pm2-logrotate:max_size 10M
pm2 conf pm2-logrotate | grep -E 'max_size|retain|compress'
echo DONE
