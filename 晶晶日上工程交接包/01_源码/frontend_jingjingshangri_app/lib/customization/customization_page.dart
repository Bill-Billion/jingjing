import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/app_visual.dart';
import '../pages/login/login_page.dart';
import '../trade/trade_widgets.dart';
import 'customization_api.dart';
import 'customization_followup.dart';
import 'customization_models.dart';

/// Private story drafts, supplement replies and immutable formal submissions.
class CustomizationPage extends StatelessWidget {
  const CustomizationPage({super.key, this.requestId, this.createNew = false});
  final String? requestId;
  final bool createNew;
  @override
  Widget build(BuildContext context) {
    final session = context.watch<AccountSession>();
    final allowed = session.isLoggedIn &&
        session.partyId != null &&
        session.selected?['membership']?['current_status'] == 'ACTIVE' &&
        !['SUSPENDED', 'CLOSED'].contains(session.party?['current_status']);
    final route = requestId != null
        ? '/customization/$requestId'
        : createNew
            ? '/customization/new'
            : '/customization';
    if (!allowed) {
      return tradeScaffold(context, '我的定制故事', [
        _heading('让故事从这里开始'),
        appNotice(
          session.isLoggedIn
              ? '请选择当前有效的个人或机构身份。草稿仅本人可见，切换身份不会转移故事。'
              : '登录后可以保存故事草稿、继续填写，并查看平台受理进度。',
        ),
        FilledButton(
          onPressed: () => session.isLoggedIn
              ? Navigator.pushNamed(context, '/account')
              : Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => LoginPage(returnRoute: route),
                  ),
                ),
          child: const Text('前往账号与身份'),
        ),
      ]);
    }
    return KeyedSubtree(
      key: ValueKey(
        '${session.account?['id']}:${session.epoch}:${session.partyId}:$route',
      ),
      child: requestId == null && !createNew
          ? _StoryList(session: session)
          : _StoryEditor(session: session, id: requestId),
    );
  }
}

Widget _heading(String text) => tradeHeading(text);
Widget _eyebrow(String text) => Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Text(
        text,
        style: const TextStyle(fontSize: 12, color: AccountTheme.accent),
      ),
    );
Widget _section(String title, List<Widget> children) =>
    tradeSection(title, children);
Widget _note(String text) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        text,
        style: const TextStyle(color: AccountTheme.muted, height: 1.6),
      ),
    );
String _date(dynamic value) {
  final date = value is String ? DateTime.tryParse(value)?.toLocal() : null;
  if (date == null) return '—';
  String two(int value) => value.toString().padLeft(2, '0');
  return '${date.year}-${two(date.month)}-${two(date.day)} ${two(date.hour)}:${two(date.minute)}';
}

class _StoryList extends StatefulWidget {
  const _StoryList({required this.session});
  final AccountSession session;
  @override
  State<_StoryList> createState() => _StoryListState();
}

class _StoryListState extends State<_StoryList> {
  late final api = CustomizationApi(widget.session);
  List<StorySummary> rows = [];
  String? cursor, status, error;
  bool busy = false, denied = false;
  int ticket = 0;
  final seenCursors = <String>{};
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    final started = ++ticket;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        rows = [];
        cursor = null;
        seenCursors.clear();
      }
    });
    try {
      final result = await api.page(
        cursor: more ? cursor : null,
        status: status,
      );
      if (!mounted || started != ticket) return;
      if (result.cursor != null) storyRequire(seenCursors.add(result.cursor!));
      setState(() {
        rows = {
          for (final row in [...rows, ...result.items]) row.id: row,
        }.values.toList();
        cursor = result.cursor;
        denied = false;
      });
    } on AccountError catch (e) {
      if (!mounted || started != ticket) return;
      setState(() {
        error = storyError(e);
        if ([401, 403, 404].contains(e.status)) {
          rows = [];
          cursor = null;
          denied = true;
        }
      });
    } finally {
      if (mounted && started == ticket) setState(() => busy = false);
    }
  }

  Future<void> open({String? id, bool create = false}) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CustomizationPage(requestId: id, createNew: create),
      ),
    );
    if (mounted) await load();
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(context, '我的需求', [
        _eyebrow('从念头，到自己的片段'),
        _heading('我发起的故事'),
        _note('保存未完成的故事，或查看已提交需求的办理进度。只显示当前身份下由你本人创建的记录。'),
        FilledButton.icon(
          key: const ValueKey('story-new'),
          onPressed: busy || denied ? null : () => open(create: true),
          icon: const Icon(Icons.add),
          label: const Text('把我的故事拍成片'),
        ),
        const SizedBox(height: 20),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            for (final entry in <String?, String>{
              null: '全部',
              ...storyStatuses,
            }.entries)
              ChoiceChip(
                label: Text(entry.value),
                selected: status == entry.key,
                onSelected: busy
                    ? null
                    : (_) {
                        status = entry.key;
                        load();
                      },
              ),
          ],
        ),
        const SizedBox(height: 16),
        if (busy) const LinearProgressIndicator(),
        if (error != null) appNotice(error!, icon: Icons.error_outline),
        if (!busy && rows.isEmpty && error == null)
          _section('还没有${status == null ? '发起的需求' : storyStatuses[status]}', [
            _note('可以先选择品类，写下一段故事。没写完也能保存。'),
          ]),
        for (final row in rows)
          Container(
            decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: AccountTheme.border))),
            child: ListTile(
              key: ValueKey('story-open-${row.id}'),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 0,
                vertical: 14,
              ),
              title: Text(
                row.title,
                style:
                    const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
              ),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '编号 ${row.id.substring(0, 8)} · ${storyStatuses[row.status]}${row.status == 'DRAFT' ? ' · 可继续填写' : '\n提交于 ${_date(row.data['submitted_at'])}'}',
                  style: const TextStyle(
                      fontSize: 12, color: AccountTheme.muted, height: 1.6),
                ),
              ),
              trailing: const Icon(Icons.north_east, size: 18),
              onTap:
                  row.allows('READ') && !busy ? () => open(id: row.id) : null,
            ),
          ),
        if (cursor != null)
          OutlinedButton(
            key: const ValueKey('story-more'),
            onPressed: busy ? null : () => load(more: true),
            child: const Text('加载更多'),
          ),
        TextButton(onPressed: busy ? null : load, child: const Text('重新读取列表')),
      ]);
}

class _StoryEditor extends StatefulWidget {
  const _StoryEditor({required this.session, this.id});
  final AccountSession session;
  final String? id;
  @override
  State<_StoryEditor> createState() => _StoryEditorState();
}

class _StoryEditorState extends State<_StoryEditor> {
  late final api = CustomizationApi(widget.session);
  List<StoryCategory> categories = [];
  StoryCategory? selected;
  StoryRequest? record, latest;
  StorySupplementContext? supplement, latestSupplement;
  final answers = <String, String>{};
  final responses = <String, String>{};
  final controllers = <String, TextEditingController>{};
  final responseControllers = <String, TextEditingController>{};
  Map<String, String> fieldErrors = {};
  String? error, notice;
  bool busy = false, dirty = false, conflict = false, denied = false;
  StoryTemplate? get template => record?.template ?? selected?.template;
  StoryPending? get pending =>
      denied ? null : api.pending(id: record?.id ?? widget.id);
  bool get supplementOpen => supplement?.open == true;
  bool get editable =>
      !denied &&
      (record == null ||
          record!.allows('SAVE') ||
          supplementOpen && supplement!.allows('SAVE_SUPPLEMENT'));
  bool get locked => busy || pending != null;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    for (final controller in controllers.values) {
      controller.dispose();
    }
    for (final controller in responseControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void replaceAnswers(Map<String, String> input) {
    answers
      ..clear()
      ..addAll(input);
    for (final controller in controllers.values) {
      controller.dispose();
    }
    controllers.clear();
    for (final field in template?.fields ?? <StoryField>[]) {
      if (field.type == 'TEXT') {
        controllers[field.key] = TextEditingController(
          text: answers[field.key] ?? '',
        );
      }
    }
  }

  void applyRecord(StoryRequest value) {
    record = value;
    replaceAnswers(value.answers);
    dirty = false;
    conflict = false;
    latest = null;
    latestSupplement = null;
    fieldErrors = {};
  }

  void applySupplement(StorySupplementContext? value) {
    supplement = value;
    responses
      ..clear()
      ..addAll(value?.responses ?? {});
    for (final controller in responseControllers.values) {
      controller.dispose();
    }
    responseControllers.clear();
    if (value?.open == true) {
      replaceAnswers(value!.answers ?? record!.answers);
      for (final item in value.items) {
        responseControllers[item.key] =
            TextEditingController(text: responses[item.key] ?? '');
      }
    }
    dirty = false;
    conflict = false;
    latestSupplement = null;
    fieldErrors = {};
  }

  void onError(AccountError value) {
    error = storyError(value);
    fieldErrors = {
      for (final detail in value.details)
        detail['field']!: storyReason(detail['reason']),
    };
    if (value.status == 412 ||
        value.code == 'CUSTOMIZATION_FORMAL_VERSION_CHANGED') {
      conflict = true;
      latest = null;
      latestSupplement = null;
    }
    if ([401, 403, 404].contains(value.status)) {
      denied = true;
      record = null;
      latest = null;
      selected = null;
      categories = [];
      replaceAnswers({});
      applySupplement(null);
      fieldErrors = {};
      notice = null;
    }
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (widget.id != null) {
        final result = await api.record(widget.id!);
        final context =
            result.status == 'DRAFT' ? null : await api.supplement(result);
        if (mounted) {
          setState(() {
            denied = false;
            applyRecord(result);
            applySupplement(context);
          });
        }
      } else {
        final result = await api.categories();
        if (mounted) {
          setState(() {
            categories = result;
            denied = false;
          });
        }
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => onError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<bool> confirm(String title, String message) async =>
      await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('返回继续填写'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('确认'),
            ),
          ],
        ),
      ) ??
      false;
  Future<void> choose(StoryCategory category) async {
    if (selected?.id == category.id) return;
    if (dirty && !await confirm('更换故事品类？', '更换品类后，将清空当前尚未保存的填写内容。')) return;
    if (!mounted) return;
    setState(() {
      selected = category;
      replaceAnswers({});
      dirty = false;
      fieldErrors = {};
      error = null;
      notice = null;
    });
  }

  Map<String, String> completeAnswers() => {
        for (final field in template!.fields)
          field.key: answers[field.key] ?? '',
      };
  bool validateSubmission() {
    final problems = <String, String>{};
    for (final field in template!.fields) {
      final value = answers[field.key] ?? '';
      if (field.required && value.trim().isEmpty) {
        problems['answers.${field.key}'] = storyReason('REQUIRED');
      }
    }
    if (supplementOpen) {
      for (final item in supplement!.items) {
        if ((responses[item.key] ?? '').trim().isEmpty) {
          problems['responses.${item.key}'] = '请对这一项要求写出明确回复；保持原内容也需要说明原因。';
        }
      }
    }
    setState(() => fieldErrors = problems);
    return problems.isEmpty;
  }

  Future<void> save({bool submit = false}) async {
    if (locked || conflict || template == null || !editable) return;
    if (submit && (!template!.submissionAvailable || !validateSubmission())) {
      return;
    }
    if (submit &&
        !await confirm(
          supplementOpen ? '正式提交这次补充？' : '正式把故事交给平台？',
          supplementOpen
              ? '平台将收到当前故事和逐项回复，保存为一次新的正式提交，等待重新受理。保存草稿不会代替正式重提。'
              : '平台将收到当前故事内容。提交后本轮不能直接修改；提交不会收款，也不表示授权通过或制作开工。',
        )) {
      return;
    }
    if (!mounted) return;
    setState(() {
      busy = true;
      error = null;
      notice = null;
      fieldErrors = {};
    });
    try {
      if (supplementOpen) {
        var current = supplement!;
        if (dirty) {
          current =
              await api.saveSupplement(record!, current, completeAnswers(), {
            for (final item in current.items)
              item.key: responses[item.key] ?? '',
          });
          if (!mounted) return;
          setState(() => applySupplement(current));
        }
        if (submit && current.allows('SUBMIT_SUPPLEMENT')) {
          final submitted = await api.submitSupplement(record!, current);
          if (!mounted) return;
          setState(() {
            applyRecord(submitted);
            applySupplement(null);
          });
          final context = await api.supplement(submitted);
          if (!mounted) return;
          setState(() {
            applyRecord(submitted);
            applySupplement(context);
          });
        }
        if (mounted) {
          setState(() => notice =
              submit ? '补充已正式送交，等待平台重新查看；不表示内容已审核通过。' : '补充草稿已保存，尚未送交平台。');
        }
        return;
      }
      StoryRequest current;
      if (record == null) {
        current = await api.create(selected!, completeAnswers());
      } else if (dirty) {
        current = await api.save(record!, completeAnswers());
      } else {
        current = record!;
      }
      if (!mounted) return;
      setState(() => applyRecord(current));
      if (submit && current.allows('SUBMIT')) {
        current = await api.submit(current);
        if (!mounted) return;
        setState(() {
          applyRecord(current);
          applySupplement(null);
        });
        final context = await api.supplement(current);
        if (!mounted) return;
        setState(() {
          applyRecord(current);
          applySupplement(context);
        });
      }
      if (mounted) {
        setState(
          () => notice = current.status == 'DRAFT'
              ? '故事草稿已保存，可以从“我的需求”继续填写。'
              : '故事已交给平台，等待查看。',
        );
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => onError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> retry() async {
    final original = pending;
    if (original == null || busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (original.path.endsWith('/supplement')) {
        final result = await api.retrySupplement(record!, original);
        if (mounted) {
          setState(() {
            applySupplement(result);
            notice = '已核对原补充草稿保存结果，尚未送交平台。';
          });
        }
        return;
      }
      final result = await api.retry(original);
      if (!mounted) return;
      setState(() {
        applyRecord(result);
        applySupplement(null);
      });
      final context =
          result.status == 'DRAFT' ? null : await api.supplement(result);
      if (mounted) {
        setState(() {
          applyRecord(result);
          applySupplement(context);
          notice = '已核对原操作结果。${storyStatuses[result.status]}。';
        });
      }
    } on AccountError catch (e) {
      if (mounted) setState(() => onError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> compareCurrent() async {
    final id = record?.id ?? widget.id;
    if (id == null || busy || pending != null) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await api.record(id);
      final context =
          result.status == 'DRAFT' ? null : await api.supplement(result);
      if (!mounted) return;
      setState(() {
        if (!dirty && !conflict) {
          applyRecord(result);
          applySupplement(context);
        } else {
          latest = result;
          latestSupplement = context;
          conflict = true;
          notice = '当前版本已读取。本页输入仍然保留，请核对后选择如何继续。';
        }
      });
    } on AccountError catch (e) {
      if (mounted) setState(() => onError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<bool> leave() async {
    if (locked) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('操作仍在处理或结果尚未确认，请先核对原操作结果。')));
      return false;
    }
    return !dirty || await confirm('离开当前故事？', '尚未保存的内容将丢失。你也可以返回后先保存草稿。');
  }

  Widget field(StoryField field) {
    final warning = fieldErrors['answers.${field.key}'];
    final canEdit = editable && !locked && !conflict;
    final label = '${field.label}${field.required ? ' · 必填' : ' · 选填'}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          if (!editable && ['TEXT', 'CHOICE'].contains(field.type))
            SelectableText(
              (answers[field.key]?.trim().isNotEmpty ?? false)
                  ? answers[field.key]!
                  : '（未填写）',
              key: ValueKey('story-answer-${field.key}'),
              style: const TextStyle(
                  color: AccountTheme.text, fontSize: 16, height: 1.6),
            ),
          if (editable && field.type == 'TEXT')
            TextField(
              key: ValueKey('story-field-${field.key}'),
              controller: controllers[field.key],
              enabled: canEdit,
              minLines: 3,
              maxLines: 7,
              maxLength: field.maxLength,
              decoration: InputDecoration(
                hintText: '写下${field.label}',
                errorText: warning,
                alignLabelWithHint: true,
              ),
              onChanged: (value) => setState(() {
                answers[field.key] = value;
                dirty = true;
                fieldErrors.remove('answers.${field.key}');
                notice = null;
              }),
            ),
          if (editable && field.type == 'CHOICE')
            DropdownButtonFormField<String>(
              key: ValueKey('story-field-${field.key}-${answers[field.key]}'),
              initialValue: field.options.contains(answers[field.key])
                  ? answers[field.key]
                  : null,
              isExpanded: true,
              decoration: InputDecoration(hintText: '请选择', errorText: warning),
              items: [
                const DropdownMenuItem(value: '', child: Text('暂不选择')),
                for (final option in field.options)
                  DropdownMenuItem(
                    value: option,
                    child: Text(option, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: canEdit
                  ? (value) => setState(() {
                        answers[field.key] = value ?? '';
                        dirty = true;
                        fieldErrors.remove('answers.${field.key}');
                        notice = null;
                      })
                  : null,
            ),
          if (field.type == 'PRIVATE_ATTACHMENT') ...[
            const DashedUpload(
              child: Row(
                children: [
                  Icon(Icons.lock_outline),
                  SizedBox(width: 10),
                  Expanded(child: Text('私有附件提交尚未开放。本轮可先保存文字，请勿粘贴公开文件链接。')),
                ],
              ),
            ),
            if (warning != null)
              Text(warning, style: const TextStyle(color: AccountTheme.danger)),
          ],
        ],
      ),
    );
  }

  List<Widget> comparison() => latest == null
      ? []
      : [
          _section(
              '服务器当前版本 · ${latestSupplement?.version ?? latest!.version}', [
            _note('当前状态：${storyStatuses[latest!.status]}。下列内容用于与本页保留的输入核对。'),
            for (final field in latest!.template.fields)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: SelectableText(
                  '${field.label}\n${(latestSupplement?.answers ?? latest!.answers)[field.key]?.isNotEmpty == true ? (latestSupplement?.answers ?? latest!.answers)[field.key] : '（未填写）'}',
                ),
              ),
            for (final item
                in latestSupplement?.items ?? <StorySupplementItem>[])
              Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: SelectableText(
                      '当前补充要求：${item.data['instruction']}\n当前回复：${latestSupplement!.responses[item.key] ?? '（未填写）'}')),
            if ((latest!.allows('SAVE') ||
                    latestSupplement?.open == true &&
                        latestSupplement!.allows('SAVE_SUPPLEMENT') &&
                        latestSupplement!.id == supplement?.id) &&
                latest!.templateId == record?.templateId)
              OutlinedButton(
                key: const ValueKey('story-keep-local'),
                onPressed: busy
                    ? null
                    : () => setState(() {
                          record = latest;
                          supplement = latestSupplement;
                          latestSupplement = null;
                          latest = null;
                          conflict = false;
                          dirty = true;
                          error = null;
                          notice = '已保留本页输入。请再次保存，使用刚核对的当前版本。';
                        }),
                child: const Text('保留本页内容，按当前版本继续保存'),
              ),
            TextButton(
              key: const ValueKey('story-adopt-current'),
              onPressed: busy
                  ? null
                  : () => setState(() {
                        final context = latestSupplement;
                        applyRecord(latest!);
                        applySupplement(context);
                        error = null;
                        notice = '已采用服务器当前版本。';
                      }),
              child: const Text('采用服务器内容并放弃本页修改'),
            ),
          ]),
        ];
  @override
  Widget build(BuildContext context) {
    final pendingOperation = pending;
    final children = <Widget>[
      _eyebrow('人工定制 / 故事需求'),
      _heading(
        supplementOpen
            ? '还需要你补充一些内容'
            : record != null && record!.status != 'DRAFT'
                ? '故事已交给平台'
                : '写下你的故事',
      ),
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!, icon: Icons.error_outline),
      if (notice != null) appNotice(notice!, icon: Icons.check_circle_outline),
      if (denied) ...[
        _note('私有内容已清空，请核对当前账号与身份。'),
        OutlinedButton(
          onPressed: busy ? null : load,
          child: const Text('重新核对访问权限'),
        ),
      ],
      if (pendingOperation != null)
        _section('上次操作结果尚未确认', [
          _note('请重试原内容核对结果。核对完成前，暂时不能更改填写内容。'),
          FilledButton(
            key: const ValueKey('story-retry-original'),
            onPressed: busy ? null : retry,
            child: const Text('重试原操作'),
          ),
        ]),
      if (!denied && widget.id == null && record == null) ...[
        _note('选择故事品类，写下属于你的片段。不同品类有不同的问题，没写完也能先保存。'),
        if (!busy && categories.isEmpty && error == null)
          _section('暂未发布可用故事表单', [
            _note('平台发布表单后即可选择，请稍后再试。'),
            OutlinedButton(
              onPressed: locked ? null : load,
              child: const Text('重新读取品类'),
            ),
          ]),
        for (final category in categories)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: selected?.id == category.id
                  ? AccountTheme.text
                  : AccountTheme.surface,
              child: ListTile(
                key: ValueKey('customization-category-${category.code}'),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                leading: Icon(
                  selected?.id == category.id ? Icons.check : Icons.add,
                  size: 20,
                  color: selected?.id == category.id
                      ? AccountTheme.canvas
                      : AccountTheme.text,
                ),
                title: Text(category.template.title,
                    style: TextStyle(
                        color: selected?.id == category.id
                            ? AccountTheme.canvas
                            : AccountTheme.text,
                        fontSize: 15,
                        fontWeight: FontWeight.w600)),
                subtitle: Text(
                  '${category.template.description}${category.template.submissionAvailable ? '' : '\n可保存文字，暂不可正式提交'}',
                  style: TextStyle(
                      color: selected?.id == category.id
                          ? const Color(0xFFD9D5CB)
                          : AccountTheme.muted,
                      fontSize: 12,
                      height: 1.5),
                ),
                onTap: locked ? null : () => choose(category),
              ),
            ),
          ),
      ],
      if (record != null)
        _section(storyStatuses[record!.status]!, [
          _note(
            record!.status == 'DRAFT'
                ? '这是仅你本人可见的草稿，尚未送交平台。'
                : record!.status == 'SUBMITTED'
                    ? '平台已收到正式提交内容，等待工作人员查看。'
                    : '工作人员已开始受理。受理不表示报价批准、收款、权利授权或制作开工。',
          ),
          Text('故事品类：${record!.template.title}'),
          Text('当前版本：${supplement?.version ?? record!.version}'),
          if (record!.data['submitted_at'] != null)
            Text('正式提交：${_date(record!.data['submitted_at'])}'),
          if (record!.data['intake_at'] != null)
            Text('开始受理：${_date(record!.data['intake_at'])}'),
        ]),
      if (!denied && template != null) ...[
        if (supplement?.id != null)
          _section(supplementOpen ? '平台请你逐项补充' : '最近一次补充已送交', [
            _note(supplementOpen
                ? '按要求完善下面的原故事，并逐项写明回复。可以先保存草稿，正式重提后平台才会收到本次修改。'
                : '这次回复已经正式提交，仍需平台重新查看；补充结束不表示审核通过。'),
            if (fieldErrors['responses'] != null)
              appNotice(fieldErrors['responses']!, icon: Icons.error_outline),
            for (final item in supplement!.items) ...[
              Text(template!.fields.firstWhere((f) => f.key == item.key).label,
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w600)),
              _note('原因：${item.data['reason']}'),
              _note('请补充：${item.data['instruction']}'),
              if (supplementOpen)
                TextField(
                  key: ValueKey('story-response-${item.key}'),
                  controller: responseControllers[item.key],
                  enabled: editable && !locked && !conflict,
                  minLines: 2,
                  maxLines: 5,
                  maxLength: 2000,
                  decoration: InputDecoration(
                      labelText: '这一项的回复',
                      errorText: fieldErrors['responses.${item.key}']),
                  onChanged: (value) => setState(() {
                    responses[item.key] = value;
                    dirty = true;
                    fieldErrors.remove('responses.${item.key}');
                    notice = null;
                  }),
                )
              else
                SelectableText(
                    '正式回复：${supplement!.responses[item.key] ?? '—'}'),
              const SizedBox(height: 16),
            ],
          ]),
        const SizedBox(height: 8),
        _section(template!.title, [
          if (template!.description.isNotEmpty) _note(template!.description),
          if (fieldErrors['answers'] != null)
            appNotice(fieldErrors['answers']!, icon: Icons.error_outline),
          for (final item in template!.fields) field(item),
          _note(
            record != null ? '这里保留这份需求保存时的问题与故事内容。' : '没写完也可以保存。正式提交时再检查必填项。',
          ),
        ]),
        if (!template!.submissionAvailable)
          appNotice('此品类含必填私有附件，附件提交尚未开放。你可以保存文字草稿，当前无法正式提交。'),
      ],
      if (conflict) ...[
        appNotice('记录已有更新。本页输入已保留，先读取当前版本核对，再决定如何保存。'),
        OutlinedButton(
          key: const ValueKey('story-read-current'),
          onPressed: locked ? null : compareCurrent,
          child: const Text('读取当前版本核对'),
        ),
        ...comparison(),
      ],
      if (record != null && !conflict)
        TextButton(
          key: const ValueKey('story-progress-refresh'),
          onPressed: locked ? null : compareCurrent,
          child: const Text('重新读取当前进度'),
        ),
      if (record != null && record!.status != 'DRAFT')
        _section('正式记录与报价', [
          OutlinedButton(
              key: const ValueKey('story-cocreation'),
              onPressed: locked || dirty
                  ? null
                  : () => Navigator.pushNamed(
                      context, '/cocreation?view=new&recordId=${record!.id}'),
              child: const Text('以这份故事发起多人共创')),
          _note('共创须在正式报价前建立。进入后继续选择当前承制方和已审规则；已有订单不能补建房间沿用旧报价。'),
          OutlinedButton(
              key: const ValueKey('story-history'),
              onPressed: locked || dirty
                  ? null
                  : () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => CustomizationFollowupPage(
                              requestId: record!.id, history: true))),
              child: const Text('查看正式提交历史')),
          FilledButton(
              key: const ValueKey('story-quotes'),
              onPressed: locked || dirty
                  ? null
                  : () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => CustomizationFollowupPage(
                              requestId: record!.id))),
              child: const Text('查看这份需求的报价与订单')),
        ]),
      _note('故事提交后由平台对接。报价、合同、授权和制作将在后续步骤分别确认。'),
    ];
    Future<void> goBack() async {
      if (!await leave() || !context.mounted) return;
      if (Navigator.canPop(context)) {
        Navigator.pop(context);
      } else {
        Navigator.pushReplacementNamed(context, '/my');
      }
    }

    return PopScope(
      canPop: !dirty && !locked,
      onPopInvokedWithResult: (didPop, result) async {
        if (!didPop) await goBack();
      },
      child: AccountTheme(
        child: Scaffold(
          appBar: AppBar(
            title: Text(
              record?.status == 'DRAFT' || record == null
                  ? '定制故事需求'
                  : '需求与办理进度',
            ),
            leading: BackButton(onPressed: goBack),
          ),
          body: SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(18, 20, 18, 0),
                  children: [...children, const SizedBox(height: 24)],
                ),
              ),
            ),
          ),
          bottomNavigationBar: !editable || template == null
              ? null
              : DecoratedBox(
                  decoration: const BoxDecoration(
                      color: AccountTheme.canvas,
                      border:
                          Border(top: BorderSide(color: AccountTheme.border))),
                  child: SafeArea(
                    top: false,
                    child: Center(
                      heightFactor: 1,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 560),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(18, 10, 18, 12),
                          child: Row(
                            children: [
                              Expanded(
                                child: OutlinedButton(
                                  key: const ValueKey('story-save'),
                                  onPressed: locked || conflict ? null : save,
                                  child: Text(
                                      supplementOpen ? '保存补充草稿' : '保存业务草稿'),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: FilledButton(
                                  key: const ValueKey('story-submit'),
                                  onPressed: locked ||
                                          conflict ||
                                          !template!.submissionAvailable ||
                                          (supplementOpen
                                              ? !supplement!
                                                  .allows('SUBMIT_SUPPLEMENT')
                                              : record != null &&
                                                  !record!.allows('SUBMIT'))
                                      ? null
                                      : () => save(submit: true),
                                  child: Text(
                                      supplementOpen ? '正式重提补充' : '正式提交需求'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}
