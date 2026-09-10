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
    if (s.includes(tag)) { console.log('SKIP ' + tag); continue; }
    if (!s.includes(oldStr)) { console.error('MISS [' + tag + '] @' + file); process.exit(2); }
    s = s.replace(oldStr, newStr); n++; console.log('OK ' + tag);
  }
  if (n) fs.writeFileSync(p, s, 'utf8');
  console.log(file + ' n=' + n);
}

// ── projects ──
patch('lib/pages/projects/projects_page.dart', [
  ['projects perf import', "import '../../utils/motion.dart';",
    ["import '../../utils/motion.dart';", "import '../../utils/perf_trace.dart';"]],
  ['projects load start', '  Future<void> _load() async {',
    ['  Future<void> _load() async {',
     "    PerfTrace.stamp('projects load start');"]],
  ['projects meaningful', ['      setState(() {',
     '        _projects =',
     '            list.map((e) => _normalize(e as Map<String, dynamic>)).toList();',
     '        _loading = false;',
     '      });'],
    ['      setState(() {',
     '        _projects =',
     '            list.map((e) => _normalize(e as Map<String, dynamic>)).toList();',
     '        _loading = false;',
     '      });',
     '      WidgetsBinding.instance.addPostFrameCallback((_) =>',
     "          PerfTrace.stamp('projects meaningful frame', meta: 'n=${_projects.length}'));"]],
]);

// ── profile ──
patch('lib/pages/profile/profile_page.dart', [
  ['profile perf import', "import '../../utils/motion.dart';",
    ["import '../../utils/motion.dart';", "import '../../utils/perf_trace.dart';"]],
  ['profile postframe', ['    WidgetsBinding.instance.addPostFrameCallback((_) {',
     '      final logged = context.read<UserProvider>().isLoggedIn;',
     '      if (logged) _loadStats();',
     '    });'],
    ['    WidgetsBinding.instance.addPostFrameCallback((_) {',
     '      final logged = context.read<UserProvider>().isLoggedIn;',
     "      PerfTrace.stamp('profile postFrame logged=$logged');",
     '      if (logged) _loadStats();',
     '    });']],
  ['profile load start', '  Future<void> _loadStats() async {',
    ['  Future<void> _loadStats() async {',
     "    PerfTrace.stamp('profile loadStats start');"]],
  ['profile meaningful', '    if (mounted) setState(() => _loadingStats = false);',
    ['    if (mounted) setState(() => _loadingStats = false);',
     '    WidgetsBinding.instance.addPostFrameCallback((_) =>',
     "        PerfTrace.stamp('profile meaningful frame', meta: 'orders=$_orderCount'));"]],
]);

// ── home ──
patch('lib/pages/home/home_page.dart', [
  ['home perf import', "import '../../utils/motion.dart';",
    ["import '../../utils/motion.dart';", "import '../../utils/perf_trace.dart';"]],
  ['home initstate', ['  void initState() {',
     '    super.initState();',
     '    _loadProjects();',
     '    _loadArtists();',
     '  }'],
    ['  void initState() {',
     '    super.initState();',
     "    PerfTrace.stamp('home initState');",
     '    _loadProjects();',
     '    _loadArtists();',
     '  }']],
  ['home artists meaningful', ['      setState(() {',
     '        _allArtists = mapped;',
     '        _applyTab();',
     '        _artistsLoading = false;',
     '      });'],
    ['      setState(() {',
     '        _allArtists = mapped;',
     '        _applyTab();',
     '        _artistsLoading = false;',
     '      });',
     '      WidgetsBinding.instance.addPostFrameCallback((_) =>',
     "          PerfTrace.stamp('home artists meaningful frame', meta: 'n=${mapped.length}'));"]],
  ['home projects meaningful', ['        setState(() {',
     "          _projects = list.cast<Map<String, dynamic>>();",
     '          _projectsLoading = false;',
     '        });'],
    ['        setState(() {',
     "          _projects = list.cast<Map<String, dynamic>>();",
     '          _projectsLoading = false;',
     '        });',
     '        WidgetsBinding.instance.addPostFrameCallback((_) =>',
     "            PerfTrace.stamp('home projects meaningful frame', meta: 'n=${list.length}'));"]],
]);
