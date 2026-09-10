const fs = require('fs');
const p = String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\work\app\jingjingshangri_app\lib\services\api_service.dart`;
let s = fs.readFileSync(p, 'utf8');
const eol = s.includes('\r\n') ? '\r\n' : '\n';
const J = (arr) => arr.join(eol);
let changed = 0;

// 1) import
if (!s.includes("utils/perf_trace.dart")) {
  const o = "import 'mock_data.dart';";
  if (!s.includes(o)) { console.error('MISS import anchor'); process.exit(2); }
  s = s.replace(o, J(["import 'mock_data.dart';", "import '../utils/perf_trace.dart';"]));
  changed++; console.log('import added');
}

// 2) interceptor timing
if (!s.includes("request_start ")) {
  const old = J([
    '    _dio.interceptors.add(InterceptorsWrapper(',
    '      onRequest: (options, handler) {',
    '        if (_token != null) {',
    "          options.headers['Authorization'] = 'Bearer $_token';",
    '        }',
    '        handler.next(options);',
    '      },',
    '    ));',
  ]);
  const neu = J([
    '    _dio.interceptors.add(InterceptorsWrapper(',
    '      onRequest: (options, handler) {',
    '        if (_token != null) {',
    "          options.headers['Authorization'] = 'Bearer $_token';",
    '        }',
    '        // Gate0 性能时间线：记录请求起点（release 下 PerfTrace 为 no-op，不改变请求行为）',
    "        options.extra['_perfT0'] = Stopwatch()..start();",
    "        PerfTrace.stamp('request_start ' + options.method + ' ' + options.path);",
    '        handler.next(options);',
    '      },',
    '      onResponse: (response, handler) {',
    "        final w = response.requestOptions.extra['_perfT0'] as Stopwatch?;",
    "        PerfTrace.stamp('request_end ' + response.requestOptions.method + ' ' + response.requestOptions.path,",
    "            meta: '${w?.elapsedMilliseconds ?? '-'}ms status=${response.statusCode}');",
    '        handler.next(response);',
    '      },',
    '      onError: (err, handler) {',
    "        final w = err.requestOptions.extra['_perfT0'] as Stopwatch?;",
    "        PerfTrace.stamp('request_error ' + err.requestOptions.method + ' ' + err.requestOptions.path,",
    "            meta: '${w?.elapsedMilliseconds ?? '-'}ms ${err.type}');",
    '        handler.next(err);',
    '      },',
    '    ));',
  ]);
  if (!s.includes(old)) { console.error('MISS interceptor anchor'); process.exit(2); }
  s = s.replace(old, neu);
  changed++; console.log('interceptor timing added');
}

if (changed) { fs.writeFileSync(p, s, 'utf8'); console.log('written, changed=' + changed + ', bytes=' + fs.statSync(p).size); }
else console.log('already patched');
