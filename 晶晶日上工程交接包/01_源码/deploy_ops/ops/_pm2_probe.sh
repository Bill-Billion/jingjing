#!/bin/bash
echo '===== systemctl status pm2-root ====='
systemctl status pm2-root --no-pager -l | sed -n '1,20p'
echo '===== unit file ====='
systemctl cat pm2-root --no-pager
echo '===== dump file ====='
ls -la /root/.pm2/dump.pm2 2>&1
echo '===== pm2 startup lines ====='
pm2 startup systemd -u root --hp /root 2>&1 | sed -n '1,20p'
echo '===== is-enabled ====='
systemctl is-enabled pm2-root
