#!/bin/bash
cd /opt/jjsr
head -20 ops/smoke_api.js
echo "======== RUN ========"
node ops/smoke_api.js 2>&1 | tail -35
