#!/bin/bash
# 晶晶日上线上健康检查：进程 / 端口 / HTTP / Nginx / 磁盘 / 内存 / SQLite完整性
# 用法: bash healthcheck.sh   （退出码 0=健康，1=有告警/异常；明细打印并追加到 health.log）
LOG=/opt/jjsr/ops/health.log
WARN=0
LINE() { echo "$1"; }

echo "==================== $(date '+%F %T %Z') ===================="

# 1) PM2 进程
if pm2 jlist 2>/dev/null | grep -q '"name":"jjsr"' && pm2 jlist 2>/dev/null | grep -q '"status":"online"'; then
  LINE "[OK]   PM2 进程 jjsr online"
else
  LINE "[CRIT] PM2 进程 jjsr 未在线"; WARN=1
fi

# 2) 3000 端口监听
if ss -ltn 2>/dev/null | grep -q ':3000 '; then
  LINE "[OK]   端口 3000 正在监听"
else
  LINE "[CRIT] 端口 3000 未监听"; WARN=1
fi

# 3) 本地 HTTP 健康接口
HCODE=$(curl -s -o /tmp/_h.json -w '%{http_code}' --max-time 8 http://127.0.0.1:3000/api/health)
if [ "$HCODE" = "200" ]; then
  LINE "[OK]   /api/health 200 ($(cat /tmp/_h.json | tr -d '\n' | cut -c1-120))"
else
  LINE "[CRIT] /api/health 异常 HTTP=$HCODE"; WARN=1
fi
rm -f /tmp/_h.json

# 4) 经 Nginx 80 访问
NCODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1/api/health)
if [ "$NCODE" = "200" ]; then
  LINE "[OK]   Nginx:80 -> Node 200"
else
  LINE "[CRIT] Nginx:80 异常 HTTP=$NCODE"; WARN=1
fi
if systemctl is-active --quiet nginx; then
  LINE "[OK]   systemd nginx active"
else
  LINE "[WARN] systemd nginx 非 active"; WARN=1
fi

# 5) 磁盘占用（根分区 >85% 告警，>95% 严重）
DISKUSE=$(df / | awk 'NR==2{gsub("%","",$5); print $5}')
if [ "$DISKUSE" -ge 95 ]; then LINE "[CRIT] 根分区占用 ${DISKUSE}%"; WARN=1;
elif [ "$DISKUSE" -ge 85 ]; then LINE "[WARN] 根分区占用 ${DISKUSE}%"; WARN=1;
else LINE "[OK]   根分区占用 ${DISKUSE}%"; fi
df -h / | awk 'NR==2{print "       "$0}'

# 6) 内存（available < 80MB 告警）
AVAIL_MB=$(free -m | awk '/^Mem:/{print $7}')
if [ "$AVAIL_MB" -lt 80 ]; then LINE "[WARN] 可用内存仅 ${AVAIL_MB}MB"; WARN=1;
else LINE "[OK]   可用内存 ${AVAIL_MB}MB"; fi
free -h | awk 'NR<=2{print "       "$0}'

# 7) 系统负载
LINE "       $(uptime)"

# 8) uploads 与备份目录体积
LINE "       uploads: $(du -sh /opt/jjsr/uploads 2>/dev/null | awk '{print $1}')  backups/db: $(du -sh /opt/jjsr/backups/db 2>/dev/null | awk '{print $1}')"

# 9) SQLite 快速完整性（耗时短，库小）
INTEG=$(node -e "const D=require('/opt/jjsr/node_modules/better-sqlite3');const d=new D('/opt/jjsr/jingjingshangri.db',{readonly:true});console.log(d.pragma('integrity_check')[0].integrity_check);d.close();" 2>&1)
if [ "$INTEG" = "ok" ]; then LINE "[OK]   SQLite integrity_check=ok";
else LINE "[CRIT] SQLite integrity=$INTEG"; WARN=1; fi

# 10) PM2 最近是否有进程重启（restart 次数）
RS=$(pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const a=JSON.parse(s);const p=a.find(x=>x.name==='jjsr');console.log(p?p.pm2_env.restart_time:'?')}catch(e){console.log('?')}})")
LINE "       jjsr 累计重启次数=$RS"

if [ "$WARN" = "0" ]; then LINE "RESULT: HEALTHY"; else LINE "RESULT: ATTENTION"; fi
echo "=================================================="
# 同时落盘（只保留最近 2000 行）
{
  echo "==== $(date '+%F %T') result=$([ $WARN = 0 ] && echo HEALTHY || echo ATTENTION) disk=${DISKUSE}% availMem=${AVAIL_MB}MB healthHttp=$HCODE nginxHttp=$NCODE restarts=$RS integ=$INTEG"
} >> "$LOG"
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit $WARN
