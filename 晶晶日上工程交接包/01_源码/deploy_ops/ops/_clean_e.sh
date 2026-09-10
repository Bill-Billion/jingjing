#!/bin/bash
rm -f /tmp/_probe_e.js
cd /opt/jjsr
node ops/smoke_api.js 2>&1 | tail -n 3
