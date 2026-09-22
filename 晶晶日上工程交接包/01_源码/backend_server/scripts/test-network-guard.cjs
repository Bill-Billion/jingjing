'use strict';
// Loaded only by test commands. Block external TCP before DNS or HTTP/provider traffic.
const net=require('node:net');
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args) {
  const normalized=Array.isArray(args[0])?args[0]:args;
  const options=normalized[0];
  const host=options && typeof options==='object' ? (options.host || 'localhost') :
    (typeof normalized[1]==='string' ? normalized[1] : 'localhost');
  if (!['127.0.0.1','::1','localhost'].includes(host)) {
    throw Object.assign(new Error('External network access is forbidden in backend tests'),{code:'TEST_EXTERNAL_NETWORK_FORBIDDEN'});
  }
  return connect.apply(this,args);
};
