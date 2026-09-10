const fs = require('fs');
const p = String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\work\app\jingjingshangri_app\lib\services\api_service.dart`;
let s = fs.readFileSync(p, 'utf8');
const reps = [
  ["PerfTrace.stamp('request_start ' + options.method + ' ' + options.path);",
   "PerfTrace.stamp('request_start ${options.method} ${options.path}');"],
  ["PerfTrace.stamp('request_end ' + response.requestOptions.method + ' ' + response.requestOptions.path,",
   "PerfTrace.stamp('request_end ${response.requestOptions.method} ${response.requestOptions.path}',"],
  ["PerfTrace.stamp('request_error ' + err.requestOptions.method + ' ' + err.requestOptions.path,",
   "PerfTrace.stamp('request_error ${err.requestOptions.method} ${err.requestOptions.path}',"],
];
let n = 0;
for (const [o, x] of reps) {
  if (!s.includes(o)) { console.error('MISS: ' + o); process.exit(2); }
  s = s.replace(o, x); n++;
}
fs.writeFileSync(p, s, 'utf8');
console.log('fixed interpolations n=' + n);
