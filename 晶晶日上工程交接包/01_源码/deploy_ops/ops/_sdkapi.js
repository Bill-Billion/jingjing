const root = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/node_modules/@alicloud/';
function methods(pkg) {
  const mod = require(root + pkg);
  const C = mod.default || mod.Client || mod;
  const names = Object.getOwnPropertyNames(C.prototype).filter(n => !['constructor'].includes(n));
  const ver = require(root + pkg + '/package.json').version;
  console.log(`\n### ${pkg}@${ver}`);
  console.log(names.filter(n => /Verify|Moderation|Video|Task|Face|Id|Meta|Text|Image/i.test(n)).join('\n'));
}
try { methods('cloudauth20200618'); } catch (e) { console.log('cloudauth ERR', e.message); }
try { methods('green20220302'); } catch (e) { console.log('green ERR', e.message); }
try { const oc = require(root + 'openapi-client'); console.log('\n### openapi-client Config keys:', Object.keys(oc).join(',')); } catch (e) { console.log('oc ERR', e.message); }
