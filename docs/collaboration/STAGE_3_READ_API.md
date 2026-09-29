# 读取合同内容和历史规则：本地接线说明

本侧已接通合同内容、历史规则和必要外部服务检查三项只读接口，并与账号接口一起测试。依赖待审第11份d2e6c93；候选格式0.3.0-rc.2。当前交付、远端检查及申请状态见[服务器进度](../status/CORE_CURRENT.md)，共享变化仍须队友审阅。

## 页面可以怎样用

先通过第二阶段登录取得令牌，读取本人身份列表，选择本人有权使用的身份。合同ID可由本阶段授权人员录入/复核后的封存结果提供，将来由订单/项目流程关联。没有公开创建合同入口，不提供万能测试账号或伪造订单。

```text
GET /api/v1/contract-snapshots/<合同内容ID>/content
Authorization: Bearer <有效登录令牌>
X-Acting-Party: <当前个人或机构ID>

GET /api/v1/rule-versions/<规则版本ID>/content?snapshot_id=<合同内容ID>
Authorization: Bearer <有效登录令牌>
X-Acting-Party: <当前个人或机构ID>
```

返回统一的meta与data。合同内容包括当时的当事方、规则副本、承诺和内容校验值；签署状态固定为NOT_SIGNED，不表示签约、付款或许可生效。规则读取必须指定获准查看的历史合同，只返回这份合同采用的版本，不随最新规则变化。

每次请求均检查有效登录、当前身份的有效成员关系、该身份属于合同当事方、账号获得这份合同的独立读取授权。任一不满足都不会返回内容；普通机构成员不自动获得授权。页面按文本显示条款，不执行条款中的HTML，也不要把内容保存在公共缓存。

缺令牌、令牌失效或退出后返回401；缺身份头部或参数不合法400；账号停用403；不存在或无权读取404；内容损坏或依赖故障503。每次重新校验，返回no-store；新内容接口不返回隐式304。不要把错误替换为演示成功。

原有不带/content的规则/合同文件元数据接口仍未实现。本次返回实际JSON内容，不编造私有文件asset ID；文件存储和下载另行接入。

## 查询必要外部服务条件

```text
GET /api/v1/contract-snapshots/<合同内容ID>/business-readiness?action=START_PAYMENT
Authorization: Bearer <有效登录令牌>
X-Acting-Party: <当前个人或机构ID>
```

action还可取START_IDENTITY_CHECK、START_SIGNING、START_DIGITAL_HUMAN。使用与内容读取相同的登录/身份/合同读取检查，返回meta和data。data包含action、environment（SANDBOX或PRODUCTION）、current_status和reason_code。当前启动入口没有商业服务绑定，返回NOT_ENABLED与PROVIDER_NOT_IMPLEMENTED；页面显示“服务尚未启用”，不能演示付款或签署成功。

SERVICE_READY仅表示必要服务条件当时满足，reason_code为null；不代表已签、已付或取得商业授权，也不是直接开放业务按钮的唯一依据。后续交易API必须再次检查服务及自身业务条件。未启用时reason_code指出缺实现、配置、验证证据、环境不匹配或服务状态不可用。请求未知动作400，无权合同404；不公开人员权限或供应商密钥。

## 怎样启动和验证

新API沿用[第二阶段启动说明](STAGE_2_ACCOUNT_API.md)。本地分支已经包含认证迁移0015–0019和合同迁移0020–0028；升级前备份，使用明确的本地数据库配置执行迁移，再启动src/http/main.js。不要把升级用于生产，本轮没有正式部署授权。

仓库根设置JX_MYSQL_TEST_ENV_FILE后，可执行完整检查`node scripts/backend-check.cjs all`；专项在backend_server执行`node scripts/test-mysql.js governance`。测试创建随机隔离库，使用合成账号会话和合同来源，HTTP、数据库、会话与读取权限是真实代码；不会发送短信或创建真实订单。

实际返回格式检查：

```text
.local/contract-venv/Scripts/python.exe scripts/validate_contract.py --runtime-fixtures .local/governance-http-fixtures.json
```

Linux将Scripts/python.exe替换为bin/python。示例仅用于显示字段，不能复制合成ID或令牌作为真实登录。没有新增npm依赖。

## 分工和边界

本侧已完成合同来源录入、复核、封存、运营操作权限及服务条件检查；后台写入用[操作工具](STAGE_3_COMMANDS.md)。后台使用真实有效会话，没有把任意JSON当合法订单或客户同意。具体商业字段由后续订单/许可模块校验。

队友可按候选格式准备内容展示、无权限和未启用提示。真实签署、付款、许可生效由后续业务流程完成，页面联调及供应商验证尚未发生。共享数据库与接口仍需另一方审阅，本侧未替队友认领。

升级、回退、完整测试及交付入口见[第三阶段交付](STAGE_3_HANDOFF.md)。不要删除历史内容、改写旧迁移或以Git回退代替数据恢复。
