import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:jingjingshangri_app/account/account_session.dart';
import 'package:jingjingshangri_app/account/account_api.dart';
import 'package:jingjingshangri_app/account/rest_reminder.dart';
import 'fake_account_api.dart';

Future<AccountSession> actor(FakeAccountAdapter adapter) async {
  final s=AccountSession(api:adapter.createApi());
  await s.login('13800000000',invitationId,'123456');
  s.select(identity(personId));return s;
}
Widget app(AccountSession s)=>ChangeNotifierProvider<AccountSession>.value(value:s,
  child:MaterialApp(builder:(_,child)=>RestReminder(child:child!),home:const Scaffold(body:Text('本人页面'))));
void main(){
  test('本人尚无账本可继续开户，其他钱包404仍清域',()async{
    late FakeAccountAdapter adapter;
    adapter=FakeAccountAdapter(handler:(r)=>r.path.startsWith('/api/v1/wallet/')
      ?envelope({'code':'WALLET_NOT_FOUND'},status:404,error:true):adapter.defaultReply(r));
    final s=await actor(adapter);
    await expectLater(s.read('/api/v1/wallet/summary',actingParty:personId),throwsA(isA<AccountError>()));
    expect(s.walletAccessDenied,false);
    await expectLater(s.read('/api/v1/wallet/records',actingParty:personId),throwsA(isA<AccountError>()));
    expect(s.walletAccessDenied,true);
  });
  testWidgets('使用服务器保存间隔，停用后不再提示，不在后台累计', (tester)async{
    var minutes=15;
    late FakeAccountAdapter adapter;
    adapter=FakeAccountAdapter(handler:(r)=>r.path=='/api/v1/privacy/preferences'
      ?envelope({'object_version':1,'personalization':false,'marketing':false,'rest_reminder_minutes':minutes})
      :adapter.defaultReply(r));
    final s=(await tester.runAsync(()=>actor(adapter)))!;
    await tester.runAsync(()=>s.read('/api/v1/privacy/preferences'));
    await tester.pumpWidget(app(s));await tester.pump();await tester.pump();
    expect(s.restReminderMinutes,15);
    await tester.pump(const Duration(minutes:10));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(minutes:30));
    expect(find.textContaining('已连续使用'),findsNothing);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump(const Duration(minutes:14));
    expect(find.textContaining('已连续使用'),findsNothing);
    await tester.pump(const Duration(minutes:1));await tester.pump();
    expect(find.text('已连续使用 15 分钟，起身休息一下吧。'),findsOneWidget);
    minutes=0;await tester.runAsync(()=>s.read('/api/v1/privacy/preferences'));await tester.pump();
    await tester.pump(const Duration(seconds:10));await tester.pump();
    await tester.pump(const Duration(minutes:30));
    await tester.pumpAndSettle();
    expect(find.textContaining('已连续使用'),findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('换身份或退出取消原计时，不把迟到提醒交给新上下文',(tester)async{
    late FakeAccountAdapter adapter;
    adapter=FakeAccountAdapter(handler:(r)=>r.path=='/api/v1/privacy/preferences'
      ?envelope({'object_version':1,'personalization':false,'marketing':false,'rest_reminder_minutes':15})
      :adapter.defaultReply(r));
    final s=(await tester.runAsync(()=>actor(adapter)))!;
    await tester.runAsync(()=>s.read('/api/v1/privacy/preferences'));await tester.pumpWidget(app(s));await tester.pump();await tester.pump();
    await tester.pump(const Duration(minutes:10));s.select(identity(orgId));await tester.pump();
    await tester.pump(const Duration(minutes:5));expect(find.textContaining('已连续使用'),findsNothing);
    await tester.runAsync(()=>s.logout());await tester.pump();await tester.pump(const Duration(minutes:30));
    expect(find.textContaining('已连续使用'),findsNothing);
    expect(s.restReminderMinutes,null);
    await tester.pumpWidget(const SizedBox());
  });
}
