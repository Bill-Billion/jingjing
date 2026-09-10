#!/bin/bash
echo "==node/tool=="; node -v; npm -v
echo "==proc=="; ps -ef | grep -E 'jjsr|pm2' | grep -v grep
echo "==systemd=="; systemctl list-units --type=service 2>/dev/null | grep -iE 'jjsr|node|pm2' || echo "no related service"
echo "==dir=="; ls -la /opt/jjsr/ 2>/dev/null | head -60
echo "==pkg version=="; grep -E '"name"|"version"' /opt/jjsr/package.json 2>/dev/null
echo "==routes count=="; ls /opt/jjsr/routes/ 2>/dev/null | wc -l; ls /opt/jjsr/routes/ 2>/dev/null | tr '\n' ' '
echo "==services=="; ls /opt/jjsr/services/ 2>/dev/null | tr '\n' ' '
echo "==env=="; if [ -f /opt/jjsr/.env ]; then echo ".env PRESENT"; grep -c . /opt/jjsr/.env; else echo "no .env"; fi
echo "==db=="; ls -lah /opt/jjsr/*.db 2>/dev/null || echo "no db file"
echo "==uploads size=="; du -sh /opt/jjsr/uploads 2>/dev/null || echo "no uploads"
echo "==local health=="; curl -s -m5 http://127.0.0.1:3000/api/health; echo
echo "==ai route local=="; curl -s -m5 -X POST http://127.0.0.1:3000/api/ai/copy -H 'Content-Type: application/json' -d '{"scene":"ping"}' | head -c 200; echo
