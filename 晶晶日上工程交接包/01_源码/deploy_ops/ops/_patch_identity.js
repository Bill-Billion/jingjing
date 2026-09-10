const fs=require('fs');
const f='C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/pages/identity/identity_page.dart';
let t=fs.readFileSync(f,'utf8');const NL=t.includes('\r\n')?'\r\n':'\n';let logs=[];
// 1) import
if(!t.includes("services/api_service.dart")){
  t=t.replace("import '../../widgets/primary_button.dart';",
    "import '../../widgets/primary_button.dart';"+NL+"import '../../services/api_service.dart';");
  logs.push('import');
}
// 2) 方法签名
t=t.replace("  void _submit() {","  Future<void> _submit() async {"); logs.push('sig');
// 3) 替换假延时块为真实调用
const oldBlock=[
"    setState(() => _submitting = true);",
"    Future.delayed(const Duration(seconds: 1), () {",
"      if (mounted) {",
"        setState(() => _submitting = false);",
"        ScaffoldMessenger.of(context).showSnackBar(",
"          const SnackBar(content: Text('提交成功，等待审核（1-3个工作日）')),",
"        );",
"        Navigator.pop(context);",
"      }",
"    });",
"  }"].join(NL);
const newBlock=[
"    setState(() => _submitting = true);",
"    try {",
"      final res = await ApiService().submitIdentity({",
"        'identityType': _type,",
"        'realName': _nameController.text.trim(),",
"        'idCard': _idController.text.trim(),",
"      });",
"      if (!mounted) return;",
"      final status = res['status'] as String?;",
"      String tip;",
"      if (status === 'approved' && res['verifiedBy'] == 'aliyun_element') {",
"        tip = '实名认证已通过';",
"      } else if (status == 'approved') {",
"        tip = '实名信息已提交并记录（云端核验开通后自动升级为权威核验）';",
"      } else if (status == 'rejected') {",
"        tip = (res['rejectReason'] ?? '实名信息核验未通过，请核对后重试').toString();",
"      } else {",
"        tip = '已提交，等待平台审核';",
"      }",
"      ScaffoldMessenger.of(context).showSnackBar(",
"        SnackBar(content: Text(tip), behavior: SnackBarBehavior.floating),",
"      );",
"      if (status != 'rejected') Navigator.pop(context);",
"    } catch (e) {",
"      if (!mounted) return;",
"      ScaffoldMessenger.of(context).showSnackBar(",
"        const SnackBar(content: Text('提交失败，请检查网络后重试'), behavior: SnackBarBehavior.floating),",
"      );",
"    } finally {",
"      if (mounted) setState(() => _submitting = false);",
"    }",
"  }"].join(NL);
if(t.includes(oldBlock)){ t=t.replace(oldBlock,newBlock); logs.push('block'); } else { logs.push('BLOCK-MISS'); }
fs.writeFileSync(f,t,'utf8');
console.log(logs.join(','),'NL=',NL==='\r\n'?'CRLF':'LF');
