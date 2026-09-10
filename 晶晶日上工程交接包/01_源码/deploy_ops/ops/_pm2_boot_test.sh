#!/bin/bash
# 受控验证 PM2 开机自启真实链路（等同开机时 systemd 调 pm2 resurrect）
set +e
echo '== 1) pm2 save 刷新进程快照 =='
pm2 save
ls -la /root/.pm2/dump.pm2

echo '== 2) 杀掉当前 PM2 守护（模拟整机重启后无进程状态）=='
pm2 kill
sleep 2

echo '== 3) 由 systemd 启动（与开机完全相同的入口）=='
systemctl start pm2-root
sleep 6

echo '== 4) systemd 单元状态 =='
systemctl is-active pm2-root
systemctl is-enabled pm2-root

echo '== 5) PM2 进程与健康检查 =='
pm2 list
for i in 1 2 3 4 5 6; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health)
  echo "health try$i = $CODE"
  if [ "$CODE" = "200" ]; then break; fi
  sleep 2
done
curl -s http://127.0.0.1:3000/api/health; echo

echo '== 6) 兜底：若 resurrect 未拉起 jjsr，则手动启动 =='
if ! pm2 jlist | grep -q '"name":"jjsr"'; then
  echo 'RESURRECT_MISS -> manual start'
  cd /opt/jjsr && pm2 start app.js --name jjsr && pm2 save
  sleep 3
fi
pm2 list
echo DONE
