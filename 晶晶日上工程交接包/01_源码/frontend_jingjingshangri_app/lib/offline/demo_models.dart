import 'dart:convert';

typedef DemoRow = Map<String, dynamic>;

DemoRow copyDemo(DemoRow value) =>
    Map<String, dynamic>.from(jsonDecode(jsonEncode(value)) as Map);

class DemoAccount {
  const DemoAccount(this.id, this.name, this.role, this.image);
  final String id, name, role, image;
}

const demoAccounts = [
  DemoAccount('customer', '陈悦', '普通客户', 'assets/images/artist_4.jpg'),
  DemoAccount('artist', '林夏', '艺人本人', 'assets/images/artist_1.jpg'),
  DemoAccount('owner', '周宁', '机构负责人', 'assets/images/artist_2.jpg'),
  DemoAccount('member', '许安', '机构成员', 'assets/images/artist_3.jpg'),
  DemoAccount('producer', '顾川', '出品方', 'assets/images/artist_5.jpg'),
];

const demoVideo = 'assets/offline/blessing.mp4';
const demoAuditionVideo = 'assets/offline/audition.mp4';
const demoImage = 'assets/images/scene_birthday.jpg';

const demoLabels = {
  'submitted': '已提交需求',
  'quoted': '待确认报价与约定',
  'signed': '待付首款',
  'producing_script': '剧本制作中',
  'script_review': '待确认剧本',
  'producing_sample': '样片制作中',
  'sample_review': '待确认样片',
  'middle_due': '待付中期款',
  'producing_rough': '粗剪制作中',
  'rough_review': '待确认粗剪',
  'tail_due': '待付尾款',
  'producing_final': '成片制作中',
  'final_ready': '待确认收讫',
  'received': '已收讫',
  'draft': '草稿',
  'review': '待模拟审核',
  'approved': '已展示',
  'rejected': '需修改',
  'unpaid': '待模拟付款',
  'paid': '待艺人接单',
  'accepted': '待提交试镜素材',
  'delivered': '待审核试镜素材',
  'ready': '待客户确认',
  'completed': '已完成',
  'open': '招募中',
  'applied': '已报名 · 待筛选',
  'offered': '待本人确认参演约定',
  'confirmed': '已确认 · 待模拟付款',
  'scheduled': '已安排参演',
  'shooting': '拍摄中',
  'invited': '邀请待接受',
  'active': '在职',
  'removed': '已移除',
  'published': '已发布',
  'pending': '待出品方处理',
  'interested': '感兴趣 · 待客服联系',
  'declined': '已婉拒',
};

String demoLabel(dynamic value) => demoLabels[value] ?? value.toString();
String demoMoney(int cents) => '¥${(cents / 100).toStringAsFixed(2)}';

DemoRow demoSeed() => {
      'schema': 1,
      'revision': 0,
      'sequence': 0,
      'actor': 'customer',
      'orders': <dynamic>[],
      'auditions': <dynamic>[],
      'notices': <dynamic>[],
      'applications': <dynamic>[],
      'payments': <dynamic>[],
      'messages': <dynamic>[],
      'commands': <String, dynamic>{},
      'artist': {
        'id': 'artist',
        'name': '林夏',
        'city': '苏州',
        'height': '168',
        'bio': '擅长生活短片、温暖祝福与都市角色。虚构演示艺人。',
        'avatar': 'assets/images/artist_1.jpg',
        'card': 'assets/images/artist_6.jpg',
        'consent': true,
        'status': 'approved',
        'history': <dynamic>[],
      },
      'organization': {
        'name': '晴川艺人工作室（演示）',
        'city': '苏州',
        'bio': '提供艺人经纪、形象管理与拍摄协调服务。',
        'image': 'assets/images/pr17-commercial-studio.png',
        'memberStatus': 'removed',
        'permissions': <dynamic>[],
        'history': <dynamic>[],
      },
      'project': {
        'id': 'project-1',
        'title': '城市来信 · 短片参演',
        'role': '书店店员',
        'location': '苏州 · 演示摄影棚',
        'description': '虚构剧情短片。参演约定、付款与拍摄进度单独办理。',
        'status': 'open',
        'fee': 20000,
        'history': <dynamic>[],
      },
    };

class DemoFailure implements Exception {
  const DemoFailure(this.message);
  final String message;
  @override
  String toString() => message;
}
