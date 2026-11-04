import 'package:flutter/material.dart';
import 'demo_flows.dart';
import 'demo_models.dart';
import 'demo_store.dart';
import 'demo_widgets.dart';

Widget demoOrganizationPage(DemoStore store) => DemoRecordPage(
      store: store,
      title: '机构资料与成员',
      read: () =>
          ['owner', 'member'].contains(store.actor) ? store.organization : null,
      content: (context, row) => [
        DemoPicture(row['image'] as String),
        const SizedBox(height: 16),
        Text(row['name'] as String,
            style: Theme.of(context).textTheme.titleLarge),
        Text(row['city'] as String),
        Text(row['bio'] as String),
        const SizedBox(height: 20),
        if (store.actor == 'owner') ...[
          DemoAction(
              label: '编辑机构资料',
              run: () async {
                demoOpen(
                    context,
                    DemoForm(
                        store: store,
                        title: '编辑机构资料',
                        fields: [
                          DemoField('name', '机构名称',
                              initial: row['name'] as String),
                          DemoField('city', '所在城市',
                              initial: row['city'] as String),
                          DemoField('bio', '机构简介',
                              initial: row['bio'] as String, lines: 4),
                        ],
                        media: {'image': row['image'] as String},
                        submit: (values) async {
                          await store.send('org_save', values);
                          if (context.mounted) Navigator.pop(context);
                        }));
              }),
          DemoPanel(title: '成员管理', children: [
            const ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('周宁 · 负责人'),
                subtitle: Text('机构资料与成员管理')),
            ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('许安 · 机构成员'),
                subtitle: Text(
                    '${demoLabel(row['memberStatus'])}\n当前权限：${(row['permissions'] as List).isEmpty ? '暂无授权' : (row['permissions'] as List).join('、')}')),
            if (row['memberStatus'] == 'removed')
              DemoAction(
                  label: '邀请许安加入机构',
                  run: () async {
                    if (await demoConfirm(
                        context, '邀请演示成员', '向本机的“许安 · 机构成员”演示账号发送邀请。')) {
                      await store.send('org_invite');
                    }
                  }),
            if (row['memberStatus'] == 'invited')
              const Text('等待许安接受。请切换机构成员账号办理。'),
            if (row['memberStatus'] == 'active')
              DemoAction(
                  label: '设置成员权限',
                  run: () async {
                    final selection =
                        (row['permissions'] as List).cast<String>().toSet();
                    final result = await showDialog<List<String>>(
                        context: context,
                        builder: (context) => StatefulBuilder(
                              builder: (context, setState) => AlertDialog(
                                title: const Text('成员权限'),
                                content: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      for (final permission in [
                                        '查看艺人资料',
                                        '协助试镜'
                                      ])
                                        CheckboxListTile(
                                            title: Text(permission),
                                            value:
                                                selection.contains(permission),
                                            onChanged: (value) => setState(() {
                                                  value == true
                                                      ? selection
                                                          .add(permission)
                                                      : selection
                                                          .remove(permission);
                                                })),
                                    ]),
                                actions: [
                                  TextButton(
                                      onPressed: () => Navigator.pop(context),
                                      child: const Text('取消')),
                                  FilledButton(
                                      onPressed: () => Navigator.pop(
                                          context, selection.toList()),
                                      child: const Text('保存权限'))
                                ],
                              ),
                            ));
                    if (result != null) {
                      await store
                          .send('org_permissions', {'permissions': result});
                    }
                  }),
            if (row['memberStatus'] != 'removed')
              DemoAction(
                  label: row['memberStatus'] == 'invited' ? '撤销邀请' : '移除成员',
                  simulated: true,
                  run: () async {
                    if (await demoConfirm(
                        context, '确认移除', '许安将失去机构成员权限，之后可重新邀请。')) {
                      await store.send('org_remove');
                    }
                  }),
          ]),
        ],
        if (store.actor == 'member')
          DemoPanel(title: '我的机构身份', children: [
            Text('状态：${demoLabel(row['memberStatus'])}'),
            if (row['memberStatus'] == 'invited')
              demoCommand(store, '接受机构邀请', 'org_accept', {}),
            if (row['memberStatus'] == 'active') ...[
              Text(
                  '当前权限：${(row['permissions'] as List).isEmpty ? '等待负责人授权' : (row['permissions'] as List).join('、')}'),
              if ((row['permissions'] as List).contains('查看艺人资料')) ...[
                const SizedBox(height: 16),
                Text('机构示例艺人：${store.artist['name']}'),
                Text(store.artist['bio'] as String),
                DemoPicture(store.artist['avatar'] as String),
              ],
              if ((row['permissions'] as List).contains('协助试镜'))
                const Text('可协助整理试镜安排；交样和参演确认仍由艺人本人办理。'),
            ],
            if (row['memberStatus'] == 'removed')
              const Text('当前未加入机构。请切换负责人账号发起邀请。'),
          ]),
        if (store.actor == 'owner' || row['memberStatus'] == 'active')
          DemoHistory(row),
      ],
    );

void editDemoNotice(BuildContext context, DemoStore store, {DemoRow? row}) {
  final key = demoRequestKey();
  demoOpen(
      context,
      DemoForm(
          store: store,
          title: row == null ? '发布通告 · 填写资料' : '修改通告草稿',
          submitLabel: '保存通告草稿',
          introduction: '发布机构：星河影业（演示）\n先填写通告及角色要求，再确认发布条件并提交审核。',
          fields: [
            DemoField('title', '通告标题', initial: row?['title'] as String? ?? ''),
            DemoField('role', '招募角色', initial: row?['role'] as String? ?? ''),
            DemoField('city', '拍摄城市', initial: row?['city'] as String? ?? '苏州'),
            DemoField('deadline', '投稿截止时间',
                initial: row?['deadline'] == null
                    ? demoDate(DateTime.now().add(const Duration(days: 14)))
                    : demoDate(row!['deadline']),
                date: true),
            DemoField('brief', '项目与拍摄说明',
                initial: row?['brief'] as String? ?? '', lines: 3),
            DemoField('requirements', '角色条件与材料要求',
                initial: row?['requirements'] as String? ?? '', lines: 3),
          ],
          submit: (values) async {
            final id = await store.send(
                row == null ? 'notice_create' : 'notice_edit', {
              ...values,
              if (row == null) 'requestKey': key else 'id': row['id']
            });
            if (context.mounted) {
              Navigator.pop(context);
              if (row == null) demoOpen(context, demoNoticePage(store, id));
            }
          }));
}

Widget demoNoticePage(DemoStore store, String id) => DemoRecordPage(
      store: store,
      title: '通告详情',
      read: () => store.find('notices', id),
      content: (context, row) {
        final applications =
            store.list('applications').where((a) => a['notice'] == id).toList();
        return [
          demoState(row),
          Text(row['title'] as String,
              style: Theme.of(context).textTheme.headlineSmall),
          Text('${row['organization']} · ${row['city']}'),
          const SizedBox(height: 16),
          DemoPanel(title: '项目与角色要求', children: [
            Text('招募角色：${row['role']}'),
            Text(row['brief'] as String),
            const SizedBox(height: 12),
            Text(row['requirements'] as String),
            Text('截止：${demoDate(row['deadline'])}'),
          ]),
          if (store.actor == 'producer') ...[
            if (['draft', 'rejected'].contains(row['status'])) ...[
              if (row['reviewNote'] != null) Text(row['reviewNote'] as String),
              DemoAction(
                  label: '编辑通告资料',
                  simulated: true,
                  run: () async {
                    editDemoNotice(context, store, row: row);
                  }),
              DemoAction(
                  label: '确认发布条件并提交',
                  run: () async {
                    if (await demoConfirm(context, '通告发布条件',
                        '当前机构为预置的合格演示出品方。确认通告内容完整、拥有发布和材料使用授权，且不含真实联系方式或真实交易。')) {
                      await store
                          .send('notice_submit', {'id': id, 'consent': true});
                    }
                  }),
            ],
            if (row['status'] == 'review') ...[
              demoCommand(store, '模拟审核通过并发布', 'notice_publish', {'id': id},
                  simulated: true),
              demoCommand(store, '模拟退回修改', 'notice_reject', {'id': id},
                  simulated: true),
            ],
            if (row['status'] == 'published')
              const Text('已在本机通告列表展示。切换艺人账号即可投稿。'),
            const SizedBox(height: 16),
            DemoPanel(title: '收到的投稿（${applications.length}）', children: [
              if (applications.isEmpty) const Text('尚无投稿'),
              for (final application in applications)
                ListTile(
                    contentPadding: EdgeInsets.zero,
                    title:
                        Text(application['artistSnapshot']['name'] as String),
                    subtitle: Text(demoLabel(application['status'])),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => demoOpen(
                        context,
                        demoApplicationPage(
                            store, application['id'] as String))),
            ]),
          ],
          if (store.actor == 'artist' && row['status'] == 'published') ...[
            if (applications.isEmpty)
              DemoAction(
                  label: '提交我的艺人资料',
                  run: () async {
                    demoOpen(
                        context,
                        DemoForm(
                            store: store,
                            title: '向通告投稿',
                            submitLabel: '确认投稿',
                            introduction:
                                '${row['title']} · ${row['role']}\n将提交当前已展示的艺人资料快照。',
                            fields: const [DemoField('note', '投稿说明', lines: 4)],
                            consent: '本人同意向此通告提交当前艺人资料，仅限本机演示。',
                            submit: (values) async {
                              final application = await store
                                  .send('notice_apply', {'id': id, ...values});
                              if (context.mounted) {
                                Navigator.pop(context);
                                demoOpen(context,
                                    demoApplicationPage(store, application));
                              }
                            }));
                  }),
            for (final application in applications)
              DemoAction(
                  label: '查看我的投稿 · ${demoLabel(application['status'])}',
                  run: () async {
                    demoOpen(
                        context,
                        demoApplicationPage(
                            store, application['id'] as String));
                  }),
          ],
          const SizedBox(height: 16),
          DemoHistory(row),
        ];
      },
    );

Widget demoApplicationPage(DemoStore store, String id) => DemoRecordPage(
      store: store,
      title: '通告投稿',
      read: () => store.find('applications', id),
      content: (context, row) => [
        demoState(row),
        DemoPanel(title: '投稿时的艺人资料', children: [
          DemoPicture(row['artistSnapshot']['avatar'] as String),
          Text(row['artistSnapshot']['name'] as String,
              style: Theme.of(context).textTheme.titleLarge),
          Text(row['artistSnapshot']['bio'] as String),
          const SizedBox(height: 12),
          Text(row['note'] as String),
        ]),
        if (store.actor == 'producer' && row['status'] == 'pending') ...[
          demoCommand(store, '感兴趣 · 转客服跟进', 'notice_interest', {'id': id}),
          DemoAction(
              label: '婉拒本次投稿',
              simulated: true,
              run: () async {
                if (await demoConfirm(context, '婉拒投稿', '将向本机艺人账号记录本次婉拒结果。')) {
                  await store.send('notice_decline', {'id': id});
                }
              }),
        ],
        if (row['status'] == 'interested')
          DemoPanel(title: '后续跟进', children: [
            Text('模拟客服待办：${row['serviceTask']}'),
            const Text('出品方已表达兴趣，等待进一步联系。此操作不代表授角、签约或参演确认。'),
          ]),
        DemoHistory(row),
      ],
    );
