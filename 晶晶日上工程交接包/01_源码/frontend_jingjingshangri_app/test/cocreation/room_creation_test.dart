import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/cocreation/cocreation_pages.dart';
import '../account/fake_account_api.dart';
import '../customization/customization_fixtures.dart';
import '../engagement/community_safety_test.dart' show communitySession;
import '../stock/v5_test_host.dart';
import 'creation_options_test.dart' show creationRule, creationProducer;

Finder select(String label) => find.byWidgetPredicate((w) =>
    w is DropdownButtonFormField<String> && w.decoration.labelText == label);
Future<void> choose(WidgetTester t, String label, String value) async {
  await reveal(t, select(label));
  t.widget<DropdownButtonFormField<String>>(select(label)).onChanged!(value);
  await frames(t);
}

Map<String, dynamic> roomReply(RequestOptions r) => {
      'id': invitationId,
      'object_version': 1,
      'current_status': 'OPEN',
      ...Map<String, dynamic>.from(r.data as Map),
      'rule_snapshot': creationRule()['rule'],
      'counts': {'joined_count': 0},
      'participation_sha256': 'b' * 64,
      'allowed_actions': ['READ', 'INVITE'],
    };
Future<void> completeForm(WidgetTester t) async {
  for (final f in [('共创名称', '家庭合成影片'), ('拍摄用途', '家庭纪念'), ('使用地域', '中国')]) {
    final field = find.widgetWithText(TextField, f.$1);
    await reveal(t, field);
    await t.enterText(field, f.$2);
  }
  await choose(t, '本次获准承制方', orgId);
  await choose(t, '已发布共创规则', secondTemplateId);
  await reveal(t, find.byIcon(Icons.calendar_today_outlined));
  await t.tap(find.byIcon(Icons.calendar_today_outlined));
  await t.pumpAndSettle();
  t
      .widget<CalendarDatePicker>(find.byType(CalendarDatePicker))
      .onDateChanged(DateTime.now().add(const Duration(days: 3)));
  await t.pump();
  await t.tap(find.text('OK'));
  await t.pumpAndSettle();
  await t.tap(find.text('OK'));
  await t.pumpAndSettle();
  final check =
      find.widgetWithText(CheckboxListTile, '已核对本故事、承制方与参与条款，确认建立共创房间');
  await reveal(t, check);
  await t.tap(check);
  await frames(t);
}

void main() {
  for (final unknown in [false, true]) {
    testWidgets(
        unknown ? '建房未知结果保留原body/key，核对后恢复并进入同一房间' : '首次选真实承制方和规则后建房，成功进入邀请与进度',
        (t) async {
      var writes = 0;
      final routes = <String>[];
      final a = FakeAccountAdapter(handler: (r) {
        if (r.path.endsWith('/customization-requests')) {
          return envelope({
            'items': [summary(status: 'SUBMITTED')],
            'next_cursor': null
          });
        }
        if (r.path.endsWith('/creation-options')) {
          return envelope({
            'items': r.queryParameters['kind'] == 'RULE'
                ? [creationRule()]
                : [creationProducer()],
            'next_cursor': null,
            'unavailable_reason': null
          });
        }
        if (r.path.endsWith('/cocreation/rooms')) {
          if (r.method == 'GET') {
            return envelope({'items': [], 'next_cursor': null});
          }
          writes++;
          if (unknown && writes == 1) {
            return envelope({'code': 'COMMIT_OUTCOME_UNKNOWN'},
                status: 503, error: true);
          }
          return envelope(roomReply(r));
        }
        return FakeAccountAdapter().defaultReply(r);
      });
      final s = (await t.runAsync(() => communitySession(a)))!;
      t.view.physicalSize = const Size(390, 844);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(ChangeNotifierProvider.value(
          value: s,
          child: MaterialApp(
            home: const CocreationPage(view: 'new', recordId: requestId),
            onGenerateRoute: (settings) {
              routes.add(settings.name!);
              return MaterialPageRoute(
                  builder: (_) => const Scaffold(body: Text('本房间邀请与进度')));
            },
          )));
      await frames(t);
      await completeForm(t);
      await reveal(t, find.text('保存共创房间'));
      await t.tap(find.text('保存共创房间'));
      await frames(t);
      if (unknown) {
        expect(routes, isEmpty);
        await reveal(t, find.text('先核对当前记录'));
        await t.tap(find.text('先核对当前记录'));
        await frames(t);
        await reveal(t, find.text('使用原编号继续核对'));
        await t.tap(find.text('使用原编号继续核对'));
        await frames(t);
      }
      expect(routes, ['/cocreation?view=room&recordId=$invitationId']);
      expect(find.text('本房间邀请与进度'), findsOneWidget);
      final commands = a.requests
          .where(
              (r) => r.path.endsWith('/cocreation/rooms') && r.method == 'POST')
          .toList();
      expect(commands.length, unknown ? 2 : 1);
      expect(commands.first.data['request_id'], requestId);
      expect(commands.first.data['producer_party_id'], orgId);
      expect(commands.first.headers['If-Match'], isNull);
      if (unknown) {
        expect(commands.first.data, commands.last.data);
        expect(commands.first.headers['Idempotency-Key'],
            commands.last.headers['Idempotency-Key']);
      }
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('故事切换会清除旧选项，迟到响应不能授权新故事', (t) async {
    final delayed = Completer<ResponseBody>();
    final a = FakeAccountAdapter(handler: (r) {
      if (r.path.endsWith('/customization-requests')) {
        return envelope({
          'items': [
            summary(status: 'SUBMITTED'),
            summary(id: secondRequestId, status: 'INTAKE')
          ],
          'next_cursor': null
        });
      }
      if (r.path.endsWith('/creation-options')) {
        if (r.queryParameters['request_id'] == requestId) return delayed.future;
        return envelope({'code': 'COCREATION_STORY_SUPPLEMENT_PENDING'},
            status: 409, error: true);
      }
      return FakeAccountAdapter().defaultReply(r);
    });
    final s = (await t.runAsync(() => communitySession(a)))!;
    await host(t, s, const CocreationPage(view: 'new', recordId: requestId));
    await choose(t, '本人已提交故事', secondRequestId);
    delayed.complete(envelope({
      'items': [creationProducer()],
      'next_cursor': null,
      'unavailable_reason': null
    }));
    await frames(t);
    await reveal(t, select('本次获准承制方'));
    expect(t.widget<DropdownButton<String>>(find.descendant(of:select('本次获准承制方'),matching:find.byType(DropdownButton<String>))).items,
        isEmpty);
    await reveal(t, find.text('保存共创房间'));
    expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, '保存共创房间'))
            .onPressed,
        isNull);
    expect(
        a.requests
            .where((r) => r.method == 'POST' && r.path.contains('cocreation')),
        isEmpty);
    expect(t.takeException(), isNull);
  });
}
