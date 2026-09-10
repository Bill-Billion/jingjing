const fs=require('fs');
const f='C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/services/api_service.dart';
let t=fs.readFileSync(f,'utf8');
if(t.includes('faceVerifyInit')){console.log('already');process.exit(0);}
const NL=t.includes('\r\n')?'\r\n':'\n';
const anchor="      }, () => MockData.identityStatus());";
const idx=t.indexOf(anchor);
if(idx<0){console.log('ANCHOR NOT FOUND');process.exit(1);}
const insert=NL+`  // ====== 人脸核身（阿里云实人认证 cloudauth）======
  /// 初始化核身，返回 certifyId（需已实名 + 本人人脸照片URL或客户端采集 metaInfo）
  Future<Map<String, dynamic>> faceVerifyInit({
    required int humanId,
    String? facePictureUrl,
    String? facePictureBase64,
    String? metaInfo,
  }) =>
      _write(() async {
        final res = await _dio.post('/api/face-verify/init', data: {
          'humanId': humanId,
          if (facePictureUrl != null) 'facePictureUrl': facePictureUrl,
          if (facePictureBase64 != null) 'facePictureBase64': facePictureBase64,
          if (metaInfo != null) 'metaInfo': metaInfo,
        });
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'certifyId': 'DEMO_CERTIFY', 'ready': false}));

  /// 轮询核身结果：passed=true 通过 / false 未通过 / null(processing) 处理中
  Future<Map<String, dynamic>> faceVerifyResult(String certifyId) =>
      _guard(() async {
        final res = await _dio.get('/api/face-verify/result/\$certifyId');
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'passed': true, 'processing': false, 'ready': false}));

  /// 签署数字人授权（livenessTxnId 即核身 certifyId；服务端会再做一次云端复验，前端结果不作为最终依据）
  Future<Map<String, dynamic>> signCompliance({
    required int humanId,
    required String scope,
    required String livenessTxnId,
    String? expireAt,
  }) =>
      _write(() async {
        final res = await _dio.post('/api/compliance/sign', data: {
          'humanId': humanId,
          'scope': scope,
          'livenessTxnId': livenessTxnId,
          if (expireAt != null) 'expireAt': expireAt,
        });
        return res.data as Map<String, dynamic>;
      }, () => MockData.ok({'scope': scope}));
`.split('\n').join(NL);
t=t.slice(0,idx+anchor.length)+insert+t.slice(idx+anchor.length);
fs.writeFileSync(f,t,'utf8');
console.log('inserted, NL=',NL==='\r\n'?'CRLF':'LF','len=',t.length);
