const fs = require('fs');
const app = String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\work\app\jingjingshangri_app`;

function patch(file, jobs) {
  const p = `${app}\\${file}`;
  let s = fs.readFileSync(p, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  let n = 0;
  for (const [tag, oldL, newLarr] of jobs) {
    const oldStr = Array.isArray(oldL) ? oldL.join(eol) : oldL;
    const newStr = Array.isArray(newLarr) ? newLarr.join(eol) : newLarr;
    if (s.includes(tag)) { console.log('SKIP ' + tag + ' @' + file); continue; }
    if (!s.includes(oldStr)) { console.error('MISS [' + tag + '] @' + file); process.exit(2); }
    s = s.replace(oldStr, newStr); n++; console.log('OK ' + tag + ' @' + file);
  }
  if (n) fs.writeFileSync(p, s, 'utf8');
  console.log(file + ' done n=' + n);
}

patch('lib/widgets/main_scaffold.dart', [
  ['perf_trace import', "import '../utils/motion.dart';",
    ["import '../utils/motion.dart';", "import '../utils/perf_trace.dart';"]],
  ['tab tap stamp', '  void _onTap(int i) {',
    ['  void _onTap(int i) {',
     "    PerfTrace.stamp('tab tap i=$i from=$_currentIndex'); // Gate0 时间线：点击瞬间"]],
]);

patch('lib/pages/messages/messages_page.dart', [
  ['perf_trace import', "import '../../utils/motion.dart';",
    ["import '../../utils/motion.dart';", "import '../../utils/perf_trace.dart';"]],
  ['init stamp', '    WidgetsBinding.instance.addPostFrameCallback((_) => _load());',
    ["    WidgetsBinding.instance.addPostFrameCallback((_) {",
     "      PerfTrace.stamp('messages postFrame->load');",
     '      _load();',
     '    });']],
  ['load start stamp', '  Future<void> _load() async {',
    ['  Future<void> _load() async {',
     "    PerfTrace.stamp('messages load start');"]],
  ['meaningful stamp', ['      setState(() {',
     '        _list = rows;',
     '        _loading = false;',
     '      });'],
    ['      setState(() {',
     '        _list = rows;',
     '        _loading = false;',
     '      });',
     '      // Gate0：内容首帧绘制后打点，与 tab tap / request_* 拼出完整等待时间线',
     '      WidgetsBinding.instance.addPostFrameCallback((_) =>',
     "          PerfTrace.stamp('messages meaningful frame', meta: 'n=${rows.length}'));"]],
  ['error stamp', ['    } catch (e) {',
     '      if (!mounted) return;'],
    ['    } catch (e) {',
     "      PerfTrace.stamp('messages load error', meta: '$e');",
     '      if (!mounted) return;']],
]);
