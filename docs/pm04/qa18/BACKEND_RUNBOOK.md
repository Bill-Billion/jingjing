# 后端同版复跑要点

**第六轮终态（2026-11-25）**：G05本人肖像/造型→独审公开→精选双审→撤回，G06现有机构资料/主图/私证→独审→撤回，均取得App与Vue同记录实际读取及撤回后清理证据。旧公开文件拒绝、本人私有原件仍在；不是出品资格或新机构入驻验收。环境补现行艺人合同/平台，16项HTTP通过；两次驱动失败保留，第2次G06/第3次G05完成，最后2856e237退出0，10条检查含重复、9名称。产品07822585、rc.2/0225不变，环境73fac544。仍T1；声音/到期/换图/分页等缺口保留，151/18组未晋级。见[第六轮回执](ROUND_06_PUBLIC_DISPLAY.md)。

**第五轮终态（2026-11-25）**：G02同一人物本人App同意→Vue独审→本人委托→员工素材/造型→本人撤回已实测。错声音用途/代签/私证拒绝；Flutter与Vue同素材摘要，撤回后两页清理、机构文件拒绝，本人原资产仍在。最后驱动65e646b1退出0，17条检查/15名称含重复；9次驱动停点保留，不是9业务缺陷。产品仍07822585、rc.2/0225；仍T1和局部证据，151/18组未晋级。当前合成人物a935c3ac已经撤回授权，不能按初始已授权样例重测。继续G05受控展示/G06目录及其余端×场景。见[第五轮回执](ROUND_05_PERSONAL_CONSENT.md)。

2026-11-25第四轮追加：员工逐人授权修复后端与双端源码07822585，API0.31.79-rc.2、迁移0225未变；详情见[第四轮](ROUND_04_STAFF_AUTHORIZATION.md)。下面f071及7e为首批历史版本。

Flutter Web合成入口实际命令为 `flutter build web --release --no-pub --no-web-resources-cdn --target test/support/v5_business_browser_main.dart --dart-define=R05_R12_SYNTHETIC_ONLY=true`，在App源码目录运行。隔离测试必须携带本地渲染资源，不能等待外部CanvasKit CDN。此包仅供回环5500合成测试，不代替lib/main.dart安装包或实体机。PowerShell收集原生命令stderr时保留提示并读取实际退出码，不因提示字符串判为业务失败；先确认输出目录存在并使用物理绝对日志路径。等待UI宿主READY、确认ui-access已生成后才启动浏览器检查。

本轮实际测试输入为f0710079585be912291ea1708e0b49e9bc96f0ca；产品后端/API/迁移与PR43环境7e35958a相同。QA后续文档/工具提交不是重新受测产品SHA。原始G01—17运行目录不覆盖，补测或回归使用新的批号。

1. 在独立QA树按后端package-lock运行`npm ci --no-audit --no-fund`。准备本机MySQL8、回环33316、专用jx_local用户和jx_dev基础库；`JX_MYSQL_TEST_ENV_FILE`指向本机受控JSON，不打印或入库。各集成文件自行创建随机测试库，不能以此宣称跨端同记录。
2. 在执行测试的同一PowerShell中明确设置下列工具变量为本机真实绝对路径；只设FFmpeg会导致G05前置失败。`FFMPEG_PATH`是旧恢复演练工具使用的另一变量，不要假定与`JX_TEST_FFMPEG`自动互通。

```powershell
$env:JX_MYSQL_TEST_ENV_FILE='<本机受控测试配置绝对路径>'
$env:JX_TEST_FFMPEG='<本机ffmpeg.exe绝对路径>'
$env:JX_TEST_FFPROBE='<本机ffprobe.exe绝对路径>'
$env:JX_TEST_FONT='<本机实际字体文件绝对路径>'
$env:FFMPEG_PATH=$env:JX_TEST_FFMPEG
node scripts/qa18-backend-discovery.cjs G01 pm04-g1-discovery-<新批号>
```

将占位换为实际值，不能字面执行。原执行器保留命令、测试源码摘要、原始TAP、逐检查JSONL、同次HTTP夹具与异常结果。发现普通失败记录后继续无依赖组；重大安全/权限/资金问题停止相关链并处理。G09实际使用已有support和contract-six，不找不存在的infringement文件。

3. 契约检查使用独立venv和`contracts/requirements-lock.txt`固定版本；该文件没有哈希，不能附加`--require-hashes`。测试夹具必须来自当前运行且位于`.local/`，逐文件报告路径必须位于`.local/ci-evidence/`；保留首次准备失败和正确运行的不同日志，不修改校验器绕过路径要求。
4. G18实际备份恢复需要显式`JX_MYSQL_EXE`和`JX_MYSQLDUMP_EXE`。旧explore-seed还需`.local/client-samples`中的sample-1/2/3-full与preview.mp4、test-portrait.jpg。本轮使用带标记的合成色块视频/图片，摘要见证据G18/synthetic-media-manifest；不复制真人或用户私有素材冒充已授权。实际恢复到新库，不覆盖任何原库；保留原已付款订单与反馈记录的关联。完整代码回退、到期实测和真实候选产物冒烟需另验。
5. 提供方登记程序`qa18_registry.py`只登记准确标准×端×场景，不接收模块总PASS替代全部标准。已有原始目录不能`init`覆盖，本轮登记目录为`pm04-g1-discovery-20261125-reg01`；后续事实追加，并用`check/report/export`核查。不同机器/环境的PASS各建run_id；最终完整回归另建`full_regression`，输入双方最终准确SHA。

原始HTTP响应、凭据和受控文件保留在.local。发布报告只保留必要断言、记录别名/合成ID、结果与原文哈希；任何新候选上传前核机密材料。安装包人工体验在完整机测回归之后进行。
