#!/bin/bash
cd /opt/jjsr
echo "=registry="; npm config get registry
npm i @alicloud/openapi-client@^0.4.15 @alicloud/tea-util@^1.4.11 @alicloud/credentials@^2.4.7 @alicloud/cloudauth20200618@^2.0.4 @alicloud/green20220302@^3.4.4 --no-audit --no-fund --registry=https://registry.npmmirror.com 2>&1 | tail -12
echo "=alicloud_installed="; ls node_modules/@alicloud
echo "=bsqlite_intact="; node -e "require('better-sqlite3');console.log('better-sqlite3 load ok')"
