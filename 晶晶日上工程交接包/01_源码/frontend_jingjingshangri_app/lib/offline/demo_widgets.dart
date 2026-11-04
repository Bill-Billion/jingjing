import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../account/account_theme.dart';
import 'demo_models.dart';
import 'demo_persistence.dart';
import 'demo_store.dart';

String demoDate(dynamic value) {
  final date = DateTime.tryParse(value.toString())?.toLocal();
  if (date == null) return value?.toString() ?? '';
  String pad(int value) => value.toString().padLeft(2, '0');
  return '${date.year}-${pad(date.month)}-${pad(date.day)} ${pad(date.hour)}:${pad(date.minute)}';
}

void demoError(BuildContext context, Object error) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(
          error is DemoFailure ? error.message : '未能保存本机资料，请重试；当前进度已保留。')));
}

Future<bool> demoConfirm(
        BuildContext context, String title, String text) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(text),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('确认')),
        ],
      ),
    ) ??
    false;

Future<void> switchDemoAccount(BuildContext context, DemoStore store) async {
  final chosen = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('切换演示账号',
                    style: Theme.of(context).textTheme.headlineSmall),
                const Text('五个虚构账号，共享这台设备上的演示进度。'),
                const SizedBox(height: 12),
                for (final account in demoAccounts)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Image.asset(account.image,
                        width: 44, height: 44, fit: BoxFit.cover),
                    title: Text('${account.name} · ${account.role}'),
                    trailing: store.actor == account.id
                        ? const Icon(Icons.check)
                        : const Icon(Icons.chevron_right),
                    onTap: () => Navigator.pop(context, account.id),
                  ),
              ]),
        ),
      ),
    ),
  );
  if (chosen == null || !context.mounted) return;
  try {
    await store.send('switch', {'id': chosen});
    if (context.mounted) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  } catch (error) {
    if (context.mounted) demoError(context, error);
  }
}

class DemoBanner extends StatelessWidget {
  const DemoBanner({super.key});
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        color: AccountTheme.text,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
        child: const Text('单机离线演示 · 所有审核、签署与付款均为模拟',
            style: TextStyle(color: AccountTheme.canvas, fontSize: 11)),
      );
}

class DemoPage extends StatelessWidget {
  const DemoPage(
      {super.key,
      required this.title,
      required this.store,
      required this.children,
      this.allowSwitch = true});
  final String title;
  final DemoStore store;
  final List<Widget> children;
  final bool allowSwitch;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Text(title),
          actions: [
            if (allowSwitch)
              IconButton(
                tooltip: '切换演示账号',
                onPressed: () => switchDemoAccount(context, store),
                icon: const Icon(Icons.switch_account_outlined),
              )
          ],
        ),
        body: SafeArea(
          child: Column(children: [
            const DemoBanner(),
            Expanded(
                child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 40),
              children: [
                Text('${store.account.name} · ${store.account.role}',
                    style: const TextStyle(
                        color: AccountTheme.muted, fontSize: 12)),
                const SizedBox(height: 16),
                ...children,
              ],
            )),
          ]),
        ),
      );
}

class DemoPanel extends StatelessWidget {
  const DemoPanel({super.key, required this.title, required this.children});
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Card(
          child: Padding(
        padding: const EdgeInsets.all(16),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          ...children,
        ]),
      ));
}

class DemoAction extends StatefulWidget {
  const DemoAction(
      {super.key,
      required this.label,
      required this.run,
      this.simulated = false});
  final String label;
  final Future<void> Function() run;
  final bool simulated;
  @override
  State<DemoAction> createState() => _DemoActionState();
}

class _DemoActionState extends State<DemoAction> {
  bool busy = false;
  Future<void> runAction() async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await widget.run();
    } catch (error) {
      if (mounted) demoError(context, error);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: widget.simulated
            ? OutlinedButton.icon(
                onPressed: busy ? null : runAction,
                icon: const Icon(Icons.science_outlined, size: 18),
                label: Text(busy ? '正在保存…' : widget.label))
            : FilledButton(
                onPressed: busy ? null : runAction,
                child: Text(busy ? '正在保存…' : widget.label)),
      );
}

class DemoHistory extends StatelessWidget {
  const DemoHistory(this.row, {super.key});
  final DemoRow row;
  @override
  Widget build(BuildContext context) => DemoPanel(title: '办理记录', children: [
        if ((row['history'] as List).isEmpty) const Text('尚无操作记录'),
        for (final entry in (row['history'] as List).reversed)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(entry['text'] as String),
              Text(demoDate(entry['at']),
                  style:
                      const TextStyle(fontSize: 11, color: AccountTheme.muted)),
            ]),
          ),
      ]);
}

class DemoPicture extends StatelessWidget {
  const DemoPicture(this.reference, {super.key, this.height = 180});
  final String reference;
  final double height;
  @override
  Widget build(BuildContext context) {
    Widget missing() => SizedBox(
        height: height, child: const Center(child: Text('本地图片无法打开，请重新选择')));
    if (reference.startsWith('assets/')) {
      return Image.asset(reference,
          height: height,
          width: double.infinity,
          fit: BoxFit.cover,
          errorBuilder: (_, error, stack) => missing());
    }
    return FutureBuilder<File>(
      future: DemoMedia.file(reference),
      builder: (context, snapshot) => snapshot.hasData
          ? Image.file(snapshot.data!,
              height: height,
              width: double.infinity,
              fit: BoxFit.cover,
              errorBuilder: (_, error, stack) => missing())
          : missing(),
    );
  }
}

class DemoVideo extends StatefulWidget {
  const DemoVideo(this.reference, {super.key});
  final String reference;
  @override
  State<DemoVideo> createState() => _DemoVideoState();
}

class _DemoVideoState extends State<DemoVideo> {
  VideoPlayerController? controller;
  String? error;
  @override
  void initState() {
    super.initState();
    initialize();
  }

  Future<void> initialize() async {
    try {
      final video = widget.reference.startsWith('assets/')
          ? VideoPlayerController.asset(widget.reference)
          : VideoPlayerController.file(await DemoMedia.file(widget.reference));
      if (!mounted) {
        await video.dispose();
        return;
      }
      controller = video;
      await video.initialize();
      if (mounted) setState(() {});
    } catch (_) {
      if (mounted) setState(() => error = '本地视频无法打开，请重新选择。');
    }
  }

  @override
  void dispose() {
    controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (error != null) return Text(error!);
    final video = controller;
    if (video == null || !video.value.isInitialized) {
      return const SizedBox(
          height: 160, child: Center(child: CircularProgressIndicator()));
    }
    return Column(children: [
      AspectRatio(
          aspectRatio: video.value.aspectRatio, child: VideoPlayer(video)),
      VideoProgressIndicator(video,
          allowScrubbing: true,
          padding: const EdgeInsets.symmetric(vertical: 8)),
      ValueListenableBuilder<VideoPlayerValue>(
        valueListenable: video,
        builder: (_, value, child) => TextButton.icon(
          icon: Icon(value.isPlaying ? Icons.pause : Icons.play_arrow),
          label: Text(value.isPlaying ? '暂停本地视频' : '播放本地视频'),
          onPressed: () async {
            if (value.isPlaying) {
              await video.pause();
            } else {
              if (value.position >= value.duration) {
                await video.seekTo(Duration.zero);
              }
              await video.play();
            }
          },
        ),
      ),
      const Text('预置演示素材 · 不代表按当前需求实际制作',
          style: TextStyle(fontSize: 11, color: AccountTheme.muted)),
    ]);
  }
}

class DemoMediaPicker extends StatefulWidget {
  const DemoMediaPicker(
      {super.key,
      required this.label,
      required this.value,
      required this.onChanged,
      this.video = false});
  final String label, value;
  final ValueChanged<String> onChanged;
  final bool video;
  @override
  State<DemoMediaPicker> createState() => _DemoMediaPickerState();
}

class _DemoMediaPickerState extends State<DemoMediaPicker> {
  bool busy = false;
  @override
  Widget build(BuildContext context) =>
      DemoPanel(title: widget.label, children: [
        if (!widget.video) DemoPicture(widget.value, height: 130),
        if (widget.video)
          Text(widget.value.startsWith('assets/') ? '已选择随包试镜短视频' : '已导入本地视频'),
        Wrap(spacing: 10, children: [
          TextButton(
            onPressed: busy
                ? null
                : () async {
                    final choices = widget.video
                        ? [demoAuditionVideo]
                        : [
                            demoImage,
                            'assets/images/artist_1.jpg',
                            'assets/images/artist_6.jpg',
                            'assets/images/pr17-commercial-studio.png',
                          ];
                    final selected = await showDialog<String>(
                        context: context,
                        builder: (context) => SimpleDialog(
                              title: const Text('选择随包演示素材'),
                              children: [
                                for (final choice in choices)
                                  SimpleDialogOption(
                                    onPressed: () =>
                                        Navigator.pop(context, choice),
                                    child: widget.video
                                        ? const Text('试镜短片（本地）')
                                        : DemoPicture(choice, height: 100),
                                  )
                              ],
                            ));
                    if (mounted && selected != null) widget.onChanged(selected);
                  },
            child: const Text('随包素材'),
          ),
          TextButton(
            onPressed: busy
                ? null
                : () async {
                    setState(() => busy = true);
                    try {
                      final files = await FilePicker.pickFiles(
                        type: FileType.custom,
                        allowedExtensions: widget.video
                            ? ['mp4', 'mov', 'm4v']
                            : ['jpg', 'jpeg', 'png', 'webp'],
                      );
                      final path = files?.files.single.path;
                      if (path == null) return;
                      final ref =
                          await DemoMedia.importFile(path, video: widget.video);
                      if (mounted) widget.onChanged(ref);
                    } catch (error) {
                      if (context.mounted) demoError(context, error);
                    } finally {
                      if (mounted) setState(() => busy = false);
                    }
                  },
            child: Text(busy ? '正在导入…' : '从设备导入'),
          ),
        ]),
      ]);
}

class DemoField {
  const DemoField(this.key, this.label,
      {this.initial = '', this.lines = 1, this.date = false});
  final String key, label, initial;
  final int lines;
  final bool date;
}

class DemoForm extends StatefulWidget {
  const DemoForm(
      {super.key,
      required this.store,
      required this.title,
      required this.fields,
      required this.submit,
      this.media = const {},
      this.consent,
      this.submitLabel = '保存',
      this.introduction});
  final DemoStore store;
  final String title, submitLabel;
  final String? consent, introduction;
  final List<DemoField> fields;
  final Map<String, String> media;
  final Future<void> Function(DemoRow values) submit;
  @override
  State<DemoForm> createState() => _DemoFormState();
}

class _DemoFormState extends State<DemoForm> {
  final formKey = GlobalKey<FormState>();
  late final controllers = {
    for (final f in widget.fields) f.key: TextEditingController(text: f.initial)
  };
  late final media = Map<String, String>.from(widget.media);
  bool consent = false;
  @override
  void dispose() {
    for (final controller in controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => DemoPage(
          title: widget.title,
          store: widget.store,
          allowSwitch: false,
          children: [
            if (widget.introduction != null) ...[
              Text(widget.introduction!),
              const SizedBox(height: 18)
            ],
            Form(
                key: formKey,
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final field in widget.fields)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 18),
                          child: TextFormField(
                            key: ValueKey('field_${field.key}'),
                            controller: controllers[field.key],
                            maxLines: field.lines,
                            maxLength: field.lines > 1 ? 2000 : 100,
                            readOnly: field.date,
                            decoration: InputDecoration(
                                labelText: field.label,
                                counterText: '',
                                suffixIcon: field.date
                                    ? const Icon(Icons.calendar_today, size: 18)
                                    : null),
                            validator: (value) =>
                                value == null || value.trim().isEmpty
                                    ? '请填写${field.label}'
                                    : null,
                            onTap: !field.date
                                ? null
                                : () async {
                                    final now = DateTime.now();
                                    final current = DateTime.tryParse(
                                        controllers[field.key]!.text);
                                    final date = await showDatePicker(
                                        context: context,
                                        initialDate: current != null &&
                                                current.isAfter(now)
                                            ? current
                                            : now.add(const Duration(days: 1)),
                                        firstDate: now,
                                        lastDate:
                                            now.add(const Duration(days: 365)));
                                    if (date == null || !context.mounted) {
                                      return;
                                    }
                                    final time = await showTimePicker(
                                        context: context,
                                        initialTime: const TimeOfDay(
                                            hour: 14, minute: 0));
                                    if (time != null && mounted) {
                                      controllers[field.key]!.text = demoDate(
                                          DateTime(
                                              date.year,
                                              date.month,
                                              date.day,
                                              time.hour,
                                              time.minute));
                                    }
                                  },
                          ),
                        ),
                      for (final key in media.keys)
                        DemoMediaPicker(
                            label: const {
                                  'material': '参考素材',
                                  'avatar': '头像',
                                  'card': '形象模卡',
                                  'image': '机构图片',
                                  'photo': '试镜样照',
                                  'video': '试镜视频'
                                }[key] ??
                                key,
                            value: media[key]!,
                            video: key == 'video',
                            onChanged: (value) =>
                                setState(() => media[key] = value)),
                      if (widget.consent != null)
                        CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(widget.consent!),
                            value: consent,
                            onChanged: (value) =>
                                setState(() => consent = value ?? false)),
                      const SizedBox(height: 12),
                      DemoAction(
                          label: widget.submitLabel,
                          run: () async {
                            if (!formKey.currentState!.validate()) return;
                            if (widget.consent != null && !consent) {
                              throw const DemoFailure('请先阅读并勾选确认项。');
                            }
                            await widget.submit({
                              for (final e in controllers.entries)
                                e.key: e.value.text.trim(),
                              ...media,
                              'consent': consent
                            });
                          }),
                    ])),
          ]);
}
