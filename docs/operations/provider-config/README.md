# 新版外部服务配置：怎样填写、怎样检查

本轮已做两件准备：把旧api材料与新版字段逐项对照，生成一份只在本机保存的待补草稿；提供不含真实值的模板和离线检查工具。尚未调用真实服务，没有修改数据库里的服务可用状态。

## 文件在哪里

|文件|给谁使用|是否含真实凭证|
|---|---|---|
|[需要甲方补充的资料](MATERIALS_TO_PROVIDE.md)|项目负责人和甲方|不含，可以共享|
|[公开配置模板](sandbox.env.example)|双方开发者|不含，可以入Git|
|[现有材料缺项表](supplied-materials-status.json)|双方开发者|只列字段名和缺项，不含值|
|本侧工作树.local/provider-config/sandbox-v2.env|本侧开发者在本机继续填写|含从api材料读取的部分凭证，禁止上传或转发|
|工作区api原始两份文件|项目负责人保管|含机密，保持原样，不入Git、不进软著包|

本地草稿明确设置为测试环境，短信和交易开关关闭，MySQL连接与登录密钥留空。它不是可直接启动的环境文件；火山凭证也未经权限范围验证。旧数据库地址和密码没有迁入，材料里200元/日默认预算没有迁入，未将备用密钥另行复制到报告。

**新版OSS并不读取旧的OSS_ENABLED开关。** 是否能调用取决于完整配置及数据库中的服务验证记录。不能以旧开关为false就断言新版存储一定关闭；真实环境必须核对对应配置和验证证据。

## 开发者操作顺序

1. 根据用户对OSS/TOS的确认选定产品。当前建议复用已有OSS实现；若选TOS，需要另做对应实现，不是改几个字段名。
2. 在.local中补草稿，测试与生产分开。MYSQL主机/用户/TLS由实际环境决定；AUTH_SECRET_BASE64由我们安全生成32字节密钥，SMS_CONFIG_REVISION由我们登记，不需要甲方编写这些技术内容。
3. 对旧字段迁移作确认：ALIPAY_APP_ID/PID/PRIVATE_KEY/PUBLIC_KEY可以对应新版TRADE_ALIPAY_*，但MERCHANT_PARTY_ID必须取本系统真实商户主体；不能直接把PID当主体ID。OSS地域格式应为oss-开头，旧OSS_ENDPOINT留空。
4. 用下面的离线命令查缺项。它只读指定文件，不加载应用、不连接数据库、不调用网络；输出不含字段值。配置不完整时不会被写成服务可用。
5. 在隔离环境验证功能；正式供应商调用需要另行明确环境、授权素材及预算，证据审核后才更改服务可用状态。不能先标记可用再补证据。

在仓库根目录执行：

```powershell
python scripts/provider_config_audit.py --env .local/provider-config/sandbox-v2.env --environment sandbox --require base,sms,storage
python scripts/provider_config_audit_test.py
node --test scripts/run-ui-browser-check.test.cjs
```

第一次检查预期会返回缺项；指定--require的组不齐时退出码为2，输入格式/文件错误为1，离线检查通过为0。0只代表所要求的配置字段检查通过，不代表服务在线或付费功能已开通。未知组直接报错。

需要重新从原始文件生成草稿时指定一个新的.local路径，工具拒绝覆盖已有草稿，也禁止把含凭证草稿写到.local以外：

```powershell
python scripts/provider_config_audit.py --env "../../api/晶晶日上.env" --environment sandbox --draft .local/provider-config/sandbox-v2.env --report .local/provider-config/source-review-v2.json
```

工具不会自动读取HTML中的备用密钥；语音字段只作为当前旧助手的准备项，正式语音产品应按接口版本补充自己的鉴权及资源标识。实名、审核、电子签还需产品选择和新版实现，不以字段齐全代替接通。正式环境禁止自动复制旧凭证生成草稿，须单独提供对应环境的材料。

目前只改测试与配置准备工具，没有改变对页面开放的业务接口。队友无需为此改页面，后续接入按原接口和具体阶段约定协作。

补充核对：旧config.js读取音色字段ARK_TTS_SPEAKER，而不是SPEECH_VOICE_ID；模板与检查工具已按实际旧配置名称列示。旧config.js仍有在缺SPEECH_API_KEY时回退ARK_API_KEY的逻辑，这不证明语音凭证可混用，后续新版语音接入必须去掉这种回退并按真实产品鉴权。当前新版语音实现仍标为未完成，语音栏目只供准备材料，具体应用/资源标识以选定接口为准。
