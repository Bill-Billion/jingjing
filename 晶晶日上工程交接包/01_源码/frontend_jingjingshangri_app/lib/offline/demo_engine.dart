import 'dart:convert';
import 'demo_models.dart';

/// Pure local demo rules. No production session, HTTP client, or external SDK.
/// The caller supplies a private copy and commits it only after this succeeds.
class DemoEngine {
  DemoEngine(this.db, this.actor, this.now);
  final DemoRow db;
  final String actor;
  final DateTime now;

  List<dynamic> rows(String table) => db[table] as List<dynamic>;
  DemoRow record(String table, String id) =>
      rows(table).cast<DemoRow>().firstWhere((row) => row['id'] == id,
          orElse: () => throw const DemoFailure('记录已不存在，请返回列表。'));

  void require(bool condition, String message) {
    if (!condition) throw DemoFailure(message);
  }

  void role(String required) => require(actor == required,
      '请切换到${demoAccounts.firstWhere((a) => a.id == required).role}账号办理。');
  void state(DemoRow row, List<String> allowed) =>
      require(allowed.contains(row['status']), '这一步已处理或尚未开放，请刷新查看当前进度。');
  String field(DemoRow input, String key, {int max = 2000}) {
    final value = input[key];
    require(value is String && value.trim().isNotEmpty, '请完整填写必填资料。');
    final text = (value as String).trim();
    require(text.length <= max, '输入内容过长，请适当缩短。');
    return text;
  }

  String nextId(String prefix) {
    db['sequence'] = (db['sequence'] as int) + 1;
    return '$prefix-${db['sequence']}';
  }

  void event(DemoRow row, String text, {String? to, String? domain}) {
    final entry = {'text': text, 'at': now.toIso8601String(), 'by': actor};
    (row['history'] as List).add(entry);
    if (to != null) {
      rows('messages').insert(0, {
        ...entry,
        'id': nextId('message'),
        'to': to,
        'record': row['id'],
        'domain': domain,
        'read': false,
      });
    }
  }

  void move(DemoRow row, String target, String text,
      {String? to, String? domain}) {
    row['status'] = target;
    event(row, text, to: to, domain: domain);
  }

  void payment(String recordId, String phase, int cents) {
    require(cents > 0, '演示金额无效。');
    final key = '$recordId/$phase';
    if (rows('payments').any((r) => r['key'] == key)) return;
    rows('payments').add({
      'key': key,
      'record': recordId,
      'phase': phase,
      'cents': cents,
      'actor': actor,
      'simulated': true,
      'at': now.toIso8601String(),
    });
  }

  String media(DemoRow input, String key) {
    final path = field(input, key, max: 1000);
    require(path.startsWith('assets/') || path.startsWith('local:'),
        '演示只能使用随包素材或已导入的本地文件。');
    return path;
  }

  String apply(String action, DemoRow input) {
    require(db['actor'] == actor, '账号已切换，请重新操作。');
    final id = input['id'] as String? ?? '';
    if (action == 'switch') {
      require(demoAccounts.any((a) => a.id == id), '演示账号不存在。');
      db['actor'] = id;
      return id;
    }
    if (action == 'read_message') {
      final row = record('messages', id);
      require(row['to'] == actor, '这不是当前账号的消息。');
      row['read'] = true;
      return id;
    }
    if (action.startsWith('order_')) return _order(action, input, id);
    if (action.startsWith('artist_')) return _artist(action, input);
    if (action.startsWith('audition_')) return _audition(action, input, id);
    if (action.startsWith('org_')) return _organization(action, input);
    if (action.startsWith('project_')) return _project(action, input);
    if (action.startsWith('notice_')) return _notice(action, input, id);
    throw const DemoFailure('此功能不在四组离线演示范围内。');
  }

  String _create(String action, DemoRow input, String table, DemoRow values) {
    final key = field(input, 'requestKey', max: 100);
    final commands = db['commands'] as Map;
    final fingerprint =
        jsonEncode({'actor': actor, 'action': action, ...input});
    if (commands[key] != null) {
      require(
          commands[key]['fingerprint'] == fingerprint, '重复提交的内容已变化，请重新打开表单。');
      return commands[key]['id'] as String;
    }
    final id = nextId(table);
    rows(table).insert(0, {
      ...values,
      'id': id,
      'createdAt': now.toIso8601String(),
      'history': <dynamic>[],
    });
    commands[key] = {'id': id, 'fingerprint': fingerprint};
    return id;
  }

  String _order(String action, DemoRow input, String id) {
    role('customer');
    if (action == 'order_create') {
      require(input['consent'] == true, '请确认有权使用所选素材。');
      final newId = _create(action, input, 'orders', {
        'customer': actor,
        'recipient': field(input, 'recipient', max: 60),
        'occasion': field(input, 'occasion', max: 60),
        'brief': field(input, 'brief'),
        'material': media(input, 'material'),
        'status': 'submitted',
        'version': 1,
        'total': 100000,
        'script': '',
      });
      final row = record('orders', newId);
      if ((row['history'] as List).isEmpty) {
        event(row, '客户提交祝福视频需求', to: actor, domain: 'orders');
      }
      return newId;
    }
    final row = record('orders', id);
    require(row['customer'] == actor, '只能办理自己的订单。');
    switch (action) {
      case 'order_quote':
        state(row, ['submitted']);
        row['contract'] = '祝福视频人工定制 · 演示约定\n'
            '祝福对象：${row['recipient']}；场景：${row['occasion']}。\n'
            '需求：${row['brief']}\n'
            '虚构报价 ¥1,000.00，首款30%／中期40%／尾款30%。\n'
            '演示交付：一段约8秒的预置示意短片，剧本、样片、粗剪逐次确认。\n'
            '仅限本机演示，不产生真实制作、付款或签署效力。';
        move(row, 'quoted', '模拟平台已报价，约定快照已生成', to: actor, domain: 'orders');
      case 'order_sign':
        state(row, ['quoted']);
        require(input['consent'] == true, '请阅读并确认演示约定。');
        move(row, 'signed', '客户确认演示报价与约定');
      case 'order_pay':
        final phase = field(input, 'phase');
        final rules = {
          'deposit': ['signed', 'producing_script', 30000],
          'middle': ['middle_due', 'producing_rough', 40000],
          'tail': ['tail_due', 'producing_final', 30000],
        };
        require(rules.containsKey(phase), '付款阶段无效。');
        if (rows('payments').any((r) => r['key'] == '$id/$phase')) return id;
        final rule = rules[phase]!;
        state(row, [rule[0] as String]);
        payment(id, phase, rule[2] as int);
        move(row, rule[1] as String, '模拟付款 ${demoMoney(rule[2] as int)} 已记录',
            to: actor, domain: 'orders');
      case 'order_produce':
        final stages = {
          'producing_script': 'script_review',
          'producing_sample': 'sample_review',
          'producing_rough': 'rough_review',
          'producing_final': 'final_ready',
        };
        state(row, stages.keys.toList());
        if (row['status'] == 'producing_script') {
          row['script'] = '镜头一：暖色灯光亮起。\n'
              '镜头二：向${row['recipient']}送上${row['occasion']}祝福。\n'
              '旁白参考：${row['brief']}\n'
              '结尾：愿每一个平凡日子，都有值得珍藏的光。\n'
              '这是本地演示剧本，第${row['version']}版。';
        }
        move(row, stages[row['status']]!, '模拟平台提交第${row['version']}版制作结果',
            to: actor, domain: 'orders');
      case 'order_feedback':
        final stages = {
          'script_review': 'producing_script',
          'sample_review': 'producing_sample',
          'rough_review': 'producing_rough',
        };
        state(row, stages.keys.toList());
        final feedback = field(input, 'feedback');
        row['version'] = (row['version'] as int) + 1;
        row['feedback'] = feedback;
        move(row, stages[row['status']]!, '客户反馈：$feedback');
      case 'order_confirm':
        final stages = {
          'script_review': 'producing_sample',
          'sample_review': 'middle_due',
          'rough_review': 'tail_due',
          'final_ready': 'received',
        };
        state(row, stages.keys.toList());
        final previous = demoLabel(row['status']);
        move(row, stages[row['status']]!, '客户完成：$previous',
            to: actor, domain: 'orders');
      default:
        throw const DemoFailure('订单操作不存在。');
    }
    return id;
  }

  String _artist(String action, DemoRow input) {
    role('artist');
    final row = db['artist'] as DemoRow;
    switch (action) {
      case 'artist_save':
        final height = int.tryParse(field(input, 'height', max: 3));
        require(height != null && height >= 100 && height <= 230,
            '请填写100至230厘米之间的身高。');
        row.addAll({
          'name': field(input, 'name', max: 30),
          'city': field(input, 'city', max: 30),
          'height': height.toString(),
          'bio': field(input, 'bio'),
          'avatar': media(input, 'avatar'),
          'card': media(input, 'card'),
          'consent': false,
        });
        move(row, 'draft', '本人保存形象资料，等待重新确认展示授权');
      case 'artist_submit':
        state(row, ['draft', 'rejected']);
        require(input['consent'] == true, '展示前需要艺人本人确认授权。');
        row['consent'] = true;
        move(row, 'review', '本人确认形象展示授权并提交');
      case 'artist_approve':
        state(row, ['review']);
        move(row, 'approved', '模拟审核通过，艺人卡可展示', to: actor, domain: 'artist');
      default:
        throw const DemoFailure('形象操作不存在。');
    }
    return 'artist';
  }

  String _audition(String action, DemoRow input, String id) {
    if (action == 'audition_create') {
      role('customer');
      require(db['artist']['status'] == 'approved', '艺人形象尚未展示，请先由本人完成形象审核。');
      final date = DateTime.tryParse(field(input, 'date'));
      require(date != null && date.isAfter(now), '请选择将来的试镜时间。');
      final newId = _create(action, input, 'auditions', {
        'customer': actor,
        'artist': 'artist',
        'brief': field(input, 'brief'),
        'date': date!.toIso8601String(),
        'status': 'unpaid',
        'fee': 20000,
      });
      final row = record('auditions', newId);
      if ((row['history'] as List).isEmpty) event(row, '客户提交试镜预约');
      return newId;
    }
    final row = record('auditions', id);
    require([row['customer'], row['artist']].contains(actor), '当前账号不能办理这笔试镜。');
    switch (action) {
      case 'audition_pay':
        role('customer');
        if (rows('payments').any((r) => r['key'] == '$id/audition')) return id;
        state(row, ['unpaid']);
        payment(id, 'audition', row['fee'] as int);
        move(row, 'paid', '客户模拟支付试镜费用', to: 'artist', domain: 'auditions');
      case 'audition_accept':
        role('artist');
        state(row, ['paid']);
        move(row, 'accepted', '艺人接受试镜预约', to: 'customer', domain: 'auditions');
      case 'audition_deliver':
        role('artist');
        state(row, ['accepted']);
        row['photo'] = media(input, 'photo');
        row['video'] = media(input, 'video');
        move(row, 'delivered', '艺人提交试镜样照与短视频');
      case 'audition_approve':
        state(row, ['delivered']);
        move(row, 'ready', '模拟审核通过，客户可查看素材',
            to: 'customer', domain: 'auditions');
      case 'audition_confirm':
        role('customer');
        state(row, ['ready']);
        move(row, 'completed', '客户确认试镜交付；参演另行办理',
            to: 'artist', domain: 'auditions');
      default:
        throw const DemoFailure('试镜操作不存在。');
    }
    return id;
  }

  String _organization(String action, DemoRow input) {
    final row = db['organization'] as DemoRow;
    if (action == 'org_accept') {
      role('member');
      require(row['memberStatus'] == 'invited', '没有待接受的邀请。');
      row['memberStatus'] = 'active';
      event(row, '许安接受机构邀请', to: 'owner', domain: 'organization');
      return 'organization';
    }
    role('owner');
    switch (action) {
      case 'org_save':
        row.addAll({
          'name': field(input, 'name', max: 80),
          'city': field(input, 'city', max: 30),
          'bio': field(input, 'bio'),
          'image': media(input, 'image'),
        });
        event(row, '机构负责人更新资料');
      case 'org_invite':
        require(row['memberStatus'] == 'removed', '该成员已经在职或已有待接受邀请。');
        row['memberStatus'] = 'invited';
        row['permissions'] = <dynamic>[];
        event(row, '晴川工作室邀请许安加入', to: 'member', domain: 'organization');
      case 'org_permissions':
        require(row['memberStatus'] == 'active', '成员接受邀请后才能授权。');
        final permissions = input['permissions'];
        require(
            permissions is List &&
                permissions.every((p) => ['查看艺人资料', '协助试镜'].contains(p)),
            '权限选项无效。');
        row['permissions'] = (permissions as List).toSet().toList();
        event(row, '机构负责人更新成员权限', to: 'member', domain: 'organization');
      case 'org_remove':
        require(row['memberStatus'] != 'removed', '该成员已移除。');
        row['memberStatus'] = 'removed';
        row['permissions'] = <dynamic>[];
        event(row, '成员已移除，原权限立即失效', to: 'member', domain: 'organization');
      default:
        throw const DemoFailure('机构操作不存在。');
    }
    return 'organization';
  }

  String _project(String action, DemoRow input) {
    role('artist');
    final row = db['project'] as DemoRow;
    final transitions = {
      'project_apply': ['open', 'applied', '艺人报名参演'],
      'project_select': ['applied', 'offered', '模拟平台筛选通过并生成参演约定'],
      'project_confirm': ['offered', 'confirmed', '艺人本人确认演示参演约定'],
      'project_pay': ['confirmed', 'scheduled', '模拟出品方付款已记录，进入拍摄安排'],
      'project_start': ['scheduled', 'shooting', '模拟平台更新：拍摄开始'],
      'project_complete': ['shooting', 'completed', '模拟平台更新：项目拍摄完成'],
    };
    require(transitions.containsKey(action), '参演操作不存在。');
    if (action == 'project_pay' &&
        rows('payments').any((r) => r['key'] == 'project-1/participation')) {
      return 'project-1';
    }
    final step = transitions[action]!;
    state(row, [step[0]]);
    if (action == 'project_confirm') {
      require(input['consent'] == true, '请由艺人本人阅读并确认演示参演约定。');
    }
    if (action == 'project_select') {
      row['contract'] = '参演演示约定\n项目：${row['title']}\n角色：${row['role']}\n'
          '地点：${row['location']}\n演示报酬：${demoMoney(row['fee'] as int)}\n'
          '本次仅展示报名、本人确认与拍摄进度；不授予真实肖像、发行或商业使用权。';
    }
    if (action == 'project_pay') {
      payment('project-1', 'participation', row['fee'] as int);
    }
    move(row, step[1], step[2], to: 'artist', domain: 'project');
    return 'project-1';
  }

  DemoRow _noticeFields(DemoRow input) {
    final deadline = DateTime.tryParse(field(input, 'deadline'));
    require(deadline != null && deadline.isAfter(now), '截止时间须晚于现在。');
    return {
      'title': field(input, 'title', max: 80),
      'role': field(input, 'role', max: 80),
      'city': field(input, 'city', max: 30),
      'brief': field(input, 'brief'),
      'requirements': field(input, 'requirements'),
      'deadline': deadline!.toIso8601String(),
    };
  }

  String _notice(String action, DemoRow input, String id) {
    if (action == 'notice_create') {
      role('producer');
      return _create(action, input, 'notices', {
        ..._noticeFields(input),
        'producer': actor,
        'organization': '星河影业（演示）',
        'status': 'draft',
      });
    }
    if (action == 'notice_interest' || action == 'notice_decline') {
      role('producer');
      final application = record('applications', id);
      final notice = record('notices', application['notice'] as String);
      require(notice['producer'] == actor, '只能处理本机构的通告投稿。');
      state(application, ['pending']);
      final interested = action == 'notice_interest';
      application['serviceTask'] = interested ? nextId('service') : null;
      move(application, interested ? 'interested' : 'declined',
          interested ? '出品方标记感兴趣，生成模拟客服跟进待办；未授角或签约' : '出品方婉拒本次投稿',
          to: 'artist', domain: 'application');
      return id;
    }
    final row = record('notices', id);
    if (action == 'notice_apply') {
      role('artist');
      state(row, ['published']);
      require(DateTime.parse(row['deadline'] as String).isAfter(now), '通告已截止。');
      require(db['artist']['status'] == 'approved', '请先完成形象展示审核。');
      final existing = rows('applications')
          .where((r) => r['notice'] == id && r['artist'] == actor);
      if (existing.isNotEmpty) return existing.first['id'] as String;
      require(input['consent'] == true, '请确认提交本人的艺人资料。');
      final newId = nextId('application');
      final application = {
        'id': newId,
        'notice': id,
        'artist': actor,
        'artistSnapshot': copyDemo(db['artist'] as DemoRow),
        'note': field(input, 'note'),
        'status': 'pending',
        'history': <dynamic>[],
      };
      rows('applications').insert(0, application);
      event(application, '艺人投稿：${row['title']}',
          to: 'producer', domain: 'application');
      return newId;
    }
    role('producer');
    require(row['producer'] == actor, '只能管理本机构通告。');
    switch (action) {
      case 'notice_edit':
        state(row, ['draft', 'rejected']);
        row.addAll(_noticeFields(input));
        move(row, 'draft', '出品方保存通告草稿');
      case 'notice_submit':
        state(row, ['draft', 'rejected']);
        require(DateTime.parse(row['deadline'] as String).isAfter(now),
            '请先修改已过期的截止时间。');
        require(input['consent'] == true, '请确认拥有发布资格与资料授权。');
        move(row, 'review', '出品方确认发布条件并提交通告');
      case 'notice_publish':
        state(row, ['review']);
        require(DateTime.parse(row['deadline'] as String).isAfter(now),
            '通告已截止，请退回修改日期。');
        move(row, 'published', '模拟审核通过，通告已发布', to: 'artist', domain: 'notices');
      case 'notice_reject':
        state(row, ['review']);
        row['reviewNote'] = '模拟退回：请补充具体角色要求。';
        move(row, 'rejected', row['reviewNote'] as String,
            to: actor, domain: 'notices');
      default:
        throw const DemoFailure('通告操作不存在。');
    }
    return id;
  }
}
