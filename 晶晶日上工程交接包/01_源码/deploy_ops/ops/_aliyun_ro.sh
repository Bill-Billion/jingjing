#!/bin/bash
cd /opt/jjsr
echo "=version="; node -e "console.log(require('./package.json').version)"
echo "=pm2="; pm2 jlist 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const a=JSON.parse(d);a.forEach(p=>console.log(p.name,p.pm2_env.status,'restarts='+p.pm2_env.restart_time))}catch(e){console.log('pm2 parse err')}})"
echo "=tables="; node -e "const db=require('./db');console.log(db.prepare(\"SELECT COUNT(*) c FROM sqlite_master WHERE type='table'\").get().c)"
echo "=alicloud_installed="; ls node_modules/@alicloud 2>/dev/null || echo NONE
echo "=new_files="; for f in services/providers/aliyunClient.js services/providers/idVerify.js services/providers/faceVerify.js routes/faceverify.js services/providers/moderation.js; do if [ -f $f ]; then echo "EXIST $f $(md5sum $f | cut -c1-12)"; else echo "MISSING $f"; fi; done
echo "=env_aliyun_keys="; grep -c ALIYUN .env 2>/dev/null || echo 0
echo "=health="; curl -s http://127.0.0.1:3000/api/health; echo
echo "=res="; df -h / | tail -1; free -m | sed -n '2p'
