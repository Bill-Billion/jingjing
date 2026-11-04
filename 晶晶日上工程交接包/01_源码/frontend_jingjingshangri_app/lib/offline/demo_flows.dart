import 'package:flutter/material.dart';
import '../account/account_theme.dart';
import 'demo_models.dart';
import 'demo_store.dart';
import 'demo_widgets.dart';

void demoOpen(BuildContext context, Widget page) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));

String demoRequestKey() => 'form-${DateTime.now().microsecondsSinceEpoch}';

class DemoRecordPage extends StatelessWidget {
  const DemoRecordPage(
      {super.key,
      required this.store,
      required this.title,
      required this.read,
      required this.content});
  final DemoStore store;
  final String title;
  final DemoRow? Function() read;
  final List<Widget> Function(BuildContext context, DemoRow row) content;
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: store,
        builder: (context, _) {
          final row = read();
          return DemoPage(
              key: ValueKey(
                  '${store.actor}/$title/${row?['status']}/${row?['memberStatus']}'),
              title: title,
              store: store,
              children: row == null
                  ? [const Text('当前账号没有这条记录的办理权限，请返回列表。')]
                  : content(context, row));
        },
      );
}

Widget demoState(DemoRow row) => Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Text(demoLabel(row['status']),
          style: const TextStyle(
              fontFamily: AccountTheme.serif,
              fontSize: 26,
              fontWeight: FontWeight.w900)),
    );

DemoAction demoCommand(
        DemoStore store, String label, String action, DemoRow input,
        {bool simulated = false}) =>
    DemoAction(
        label: label,
        simulated: simulated,
        run: () async {
          await store.send(action, input);
        });

void newDemoOrder(BuildContext context, DemoStore store) {
  final requestKey = demoRequestKey();
  demoOpen(
      context,
      DemoForm(
        store: store,
        title: '定制祝福视频',
        submitLabel: '提交祝福需求',
        introduction: '把想说的话，留在一段影像里。\n本次演示人工定制流程，报价和制作由本机模拟平台推进。',
        fields: const [
          DemoField('recipient', '祝福对象'),
          DemoField('occasion', '祝福场景', initial: '生日'),
          DemoField('brief', '祝福内容与制作要求', lines: 4),
        ],
        media: const {'material': demoImage},
        consent: '我确认有权使用所选素材，仅用于本机演示。',
        submit: (values) async {
          final id = await store
              .send('order_create', {...values, 'requestKey': requestKey});
          if (context.mounted) {
            Navigator.pop(context);
            demoOpen(context, demoOrderPage(store, id));
          }
        },
      ));
}

Widget demoOrderPage(DemoStore store, String id) => DemoRecordPage(
      store: store,
      title: '祝福视频订单',
      read: () => store.find('orders', id),
      content: (context, row) {
        final status = row['status'];
        final review =
            ['script_review', 'sample_review', 'rough_review'].contains(status);
        final payable = {
          'signed': ['deposit', 30000],
          'middle_due': ['middle', 40000],
          'tail_due': ['tail', 30000]
        }[status];
        return [
          demoState(row),
          Text('${row['recipient']} · ${row['occasion']}',
              style: Theme.of(context).textTheme.titleLarge),
          Text('订单 $id',
              style: const TextStyle(fontSize: 11, color: AccountTheme.muted)),
          const SizedBox(height: 16),
          DemoPanel(title: '你的祝福', children: [
            Text(row['brief'] as String),
            const SizedBox(height: 12),
            DemoPicture(row['material'] as String)
          ]),
          if (row['contract'] != null)
            DemoPanel(title: '报价与演示约定', children: [
              SelectableText(row['contract'] as String),
              const SizedBox(height: 12),
              Text(
                  '已模拟支付：${demoMoney(store.list('payments').where((p) => p['record'] == id).fold<int>(0, (sum, p) => sum + (p['cents'] as int)))}'),
            ]),
          if (status == 'submitted')
            demoCommand(store, '模拟平台报价', 'order_quote', {'id': id},
                simulated: true),
          if (status == 'quoted')
            DemoAction(
                label: '确认报价与演示约定',
                run: () async {
                  if (await demoConfirm(
                      context, '确认演示约定', '请确认已阅读上方报价与约定。本操作只保存本机确认记录。')) {
                    await store.send('order_sign', {'id': id, 'consent': true});
                  }
                }),
          if (payable != null)
            DemoAction(
                label: '模拟付款 ${demoMoney(payable[1] as int)}',
                run: () async {
                  if (await demoConfirm(context, '模拟付款',
                      '将记录 ${demoMoney(payable[1] as int)} 演示付款，不发生真实扣款。')) {
                    await store
                        .send('order_pay', {'id': id, 'phase': payable[0]});
                  }
                }),
          if ((status as String).startsWith('producing_')) ...[
            if (row['feedback'] != null)
              DemoPanel(
                  title: '最新修改意见', children: [Text(row['feedback'] as String)]),
            demoCommand(
                store,
                '模拟平台提交${const {
                  'producing_script': '剧本',
                  'producing_sample': '样片',
                  'producing_rough': '粗剪',
                  'producing_final': '成片'
                }[status]}',
                'order_produce',
                {'id': id},
                simulated: true),
          ],
          if (row['script'] != '')
            DemoPanel(
                title: '演示剧本 · 第${row['version']}版',
                children: [Text(row['script'] as String)]),
          if ([
            'sample_review',
            'middle_due',
            'rough_review',
            'tail_due',
            'final_ready',
            'received'
          ].contains(status))
            DemoPanel(
                title: status == 'received' || status == 'final_ready'
                    ? '本地演示成片'
                    : '本地制作预览',
                children: [const DemoVideo(demoVideo)]),
          if (review) ...[
            demoCommand(
                store,
                '确认${const {
                  'script_review': '剧本',
                  'sample_review': '样片',
                  'rough_review': '粗剪'
                }[status]}',
                'order_confirm',
                {'id': id}),
            DemoAction(
                label: '提出修改意见',
                simulated: true,
                run: () async {
                  demoOpen(
                      context,
                      DemoForm(
                          store: store,
                          title: '制作反馈',
                          submitLabel: '提交修改意见',
                          fields: const [
                            DemoField('feedback', '修改意见', lines: 4)
                          ],
                          submit: (values) async {
                            await store
                                .send('order_feedback', {'id': id, ...values});
                            if (context.mounted) Navigator.pop(context);
                          }));
                }),
          ],
          if (status == 'final_ready')
            DemoAction(
                label: '确认成片收讫',
                run: () async {
                  if (await demoConfirm(
                      context, '确认收讫', '确认已查看本地演示成片，本笔订单将标记为已收讫。')) {
                    await store.send('order_confirm', {'id': id});
                  }
                }),
          if (status == 'received')
            const DemoPanel(
                title: '祝福已收讫', children: [Text('演示订单已完成。成片与全部办理记录可在本机继续查看。')]),
          DemoHistory(row),
        ];
      },
    );

Widget demoArtistPage(DemoStore store) => DemoRecordPage(
      store: store,
      title: '我的艺人形象',
      read: () => store.actor == 'artist' ? store.artist : null,
      content: (context, row) => [
        demoState(row),
        DemoPicture(row['avatar'] as String, height: 280),
        const SizedBox(height: 16),
        Text(row['name'] as String,
            style: Theme.of(context).textTheme.headlineMedium),
        Text('${row['city']} · ${row['height']}cm'),
        Text(row['bio'] as String),
        const SizedBox(height: 18),
        DemoPanel(
            title: '形象模卡',
            children: [DemoPicture(row['card'] as String, height: 240)]),
        DemoAction(
            label: '编辑形象资料',
            run: () async {
              demoOpen(
                  context,
                  DemoForm(
                      store: store,
                      title: '编辑艺人形象',
                      fields: [
                        DemoField('name', '艺名', initial: row['name'] as String),
                        DemoField('city', '城市', initial: row['city'] as String),
                        DemoField('height', '身高（厘米）',
                            initial: row['height'] as String),
                        DemoField('bio', '形象介绍',
                            initial: row['bio'] as String, lines: 4),
                      ],
                      media: {
                        'avatar': row['avatar'] as String,
                        'card': row['card'] as String
                      },
                      introduction: '编辑后将保存为草稿，需要本人重新确认展示授权。',
                      submit: (values) async {
                        await store.send('artist_save', values);
                        if (context.mounted) Navigator.pop(context);
                      }));
            }),
        if (['draft', 'rejected'].contains(row['status']))
          DemoAction(
              label: '本人授权并申请展示',
              run: () async {
                if (await demoConfirm(
                    context, '本人确认展示授权', '同意将当前头像、模卡和介绍展示在本机艺人卡中。仅供离线演示。')) {
                  await store.send('artist_submit', {'consent': true});
                }
              }),
        if (row['status'] == 'review')
          demoCommand(store, '模拟形象审核通过', 'artist_approve', {}, simulated: true),
        if (row['status'] == 'approved') const Text('形象已展示，可接受试镜并向通告投稿。'),
        const SizedBox(height: 16),
        DemoHistory(row),
      ],
    );

void newDemoAudition(BuildContext context, DemoStore store) {
  final key = demoRequestKey();
  demoOpen(
      context,
      DemoForm(
          store: store,
          title: '预约艺人试镜',
          submitLabel: '提交预约',
          introduction:
              '艺人：${store.artist['name']}\n演示费用 ¥200.00，包含样照与试镜短片。试镜交付与正式参演分别办理。',
          fields: [
            DemoField('date', '预约时间',
                initial: demoDate(DateTime.now().add(const Duration(days: 2))),
                date: true),
            const DemoField('brief', '试镜要求', lines: 4),
          ],
          submit: (values) async {
            final id = await store
                .send('audition_create', {...values, 'requestKey': key});
            if (context.mounted) {
              Navigator.pop(context);
              demoOpen(context, demoAuditionPage(store, id));
            }
          }));
}

Widget demoAuditionPage(DemoStore store, String id) => DemoRecordPage(
      store: store,
      title: '试镜预约',
      read: () => store.find('auditions', id),
      content: (context, row) => [
        demoState(row),
        DemoPanel(title: '预约详情', children: [
          Text('艺人：${store.artist['name']}'),
          Text('时间：${demoDate(row['date'])}'),
          Text(row['brief'] as String),
          Text('模拟费用：${demoMoney(row['fee'] as int)}'),
          Text('预约 $id',
              style: const TextStyle(fontSize: 11, color: AccountTheme.muted)),
        ]),
        if (store.actor == 'customer' && row['status'] == 'unpaid')
          DemoAction(
              label: '模拟支付试镜费用',
              run: () async {
                if (await demoConfirm(
                    context, '模拟支付 ¥200.00', '本机记录演示付款，随后切换艺人账号接单。不会发生真实扣款。')) {
                  await store.send('audition_pay', {'id': id});
                }
              }),
        if (row['status'] == 'paid' && store.actor == 'artist')
          demoCommand(store, '接受试镜预约', 'audition_accept', {'id': id}),
        if (row['status'] == 'paid' && store.actor == 'customer')
          const Text('请切换至艺人账号，在“试镜”中接受这笔预约。'),
        if (row['status'] == 'accepted' && store.actor == 'artist')
          DemoAction(
              label: '提交试镜样照与视频',
              run: () async {
                demoOpen(
                    context,
                    DemoForm(
                        store: store,
                        title: '试镜交付',
                        fields: const [],
                        media: const {
                          'photo': 'assets/images/artist_1.jpg',
                          'video': demoAuditionVideo
                        },
                        submitLabel: '提交试镜素材',
                        submit: (values) async {
                          await store
                              .send('audition_deliver', {'id': id, ...values});
                          if (context.mounted) Navigator.pop(context);
                        }));
              }),
        if (row['status'] == 'delivered')
          demoCommand(store, '模拟试镜素材审核通过', 'audition_approve', {'id': id},
              simulated: true),
        if (['ready', 'completed'].contains(row['status']) ||
            store.actor == 'artist' && row['photo'] != null)
          DemoPanel(title: '试镜交付素材', children: [
            DemoPicture(row['photo'] as String),
            const SizedBox(height: 16),
            DemoVideo(row['video'] as String),
          ]),
        if (row['status'] == 'ready' && store.actor == 'customer')
          DemoAction(
              label: '确认试镜交付',
              run: () async {
                if (await demoConfirm(
                    context, '确认试镜交付', '确认已查看样照和短视频。本次确认不产生参演约定。')) {
                  await store.send('audition_confirm', {'id': id});
                }
              }),
        if (row['status'] == 'ready' && store.actor == 'artist')
          const Text('请切换客户账号查看并确认试镜交付。'),
        if (row['status'] == 'completed')
          const Text('试镜办理完成。参演需在独立项目中报名、筛选和确认约定。'),
        const SizedBox(height: 16),
        DemoHistory(row),
      ],
    );

Widget demoProjectPage(DemoStore store) => DemoRecordPage(
      store: store,
      title: '参演项目',
      read: () => store.actor == 'artist' ? store.project : null,
      content: (context, row) => [
        demoState(row),
        Text(row['title'] as String,
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 16),
        DemoPanel(title: '角色与安排', children: [
          Text('角色：${row['role']}'),
          Text(row['location'] as String),
          Text(row['description'] as String)
        ]),
        if (row['contract'] != null)
          DemoPanel(
              title: '参演演示约定',
              children: [SelectableText(row['contract'] as String)]),
        if (row['status'] == 'open')
          demoCommand(store, '报名参演', 'project_apply', {}),
        if (row['status'] == 'applied')
          demoCommand(store, '模拟筛选通过并生成约定', 'project_select', {},
              simulated: true),
        if (row['status'] == 'offered')
          DemoAction(
              label: '本人确认参演约定',
              run: () async {
                if (await demoConfirm(
                    context, '本人确认参演', '已阅读上方角色、报酬和权利范围，并确认本机演示参演约定。')) {
                  await store.send('project_confirm', {'consent': true});
                }
              }),
        if (row['status'] == 'confirmed')
          demoCommand(store, '模拟出品方付款', 'project_pay', {}, simulated: true),
        if (row['status'] == 'scheduled')
          demoCommand(store, '模拟更新：开始拍摄', 'project_start', {}, simulated: true),
        if (row['status'] == 'shooting')
          demoCommand(store, '模拟更新：拍摄完成', 'project_complete', {},
              simulated: true),
        if (['scheduled', 'shooting', 'completed'].contains(row['status']))
          Text('演示付款已记录：${demoMoney(row['fee'] as int)}'),
        const SizedBox(height: 16),
        DemoHistory(row),
      ],
    );
