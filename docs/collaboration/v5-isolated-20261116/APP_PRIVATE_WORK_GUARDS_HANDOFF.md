# 私人交付：文案及异步回写守卫


仅修改 _PrivateWorkState：
- 与既有 deliverable 的 REWARD_FUNDED + amount==0 分支一致，付款说明显示零金额奖励订单，明确交付条件另核；不将奖励写成实付到账。
- media 入口 busy 防同帧重入；捕获原播放器后先脱离当前引用，再 dispose，await 后核 mounted/ticket/epoch/party；播放初始化及 play 后另核播放器归属；错误/完成回写同样检查身份与票据。
- 当前版本、验收、付款、退款、履约 deliverable 条件原样保留。受控 content / 下载前重读 / 文件保存与原权限 check 不变；未引入新接口。

静态核对范围：改动只在该 State 内；_ProjectDetail 的 66 footer 及其之前全部字节保持不变。备份前后 diff 仅上述文案/守卫，不改 API/契约/权限。静态可达风险修正不是实机复现结论。
未测试、编译、分析器、格式化或请求业务接口；未提交推送。

冻结 SHA256：`7e594f4a7cda18868c2a649e42ccc9356a2af5191710d83b6dd99ea5d58323a2`

补充 load()：原 await dispose 后才清 video/状态，重复 load 可使旧调用在新调用后恢复并清除新状态。现同步捕获并移除原播放器、先设置本次 busy/清空，dispose await 后先校验同 ticket/epoch/party 再请求；成功/异常/finally同守卫。保留新load使旧ticket失效的行为，不泛化重构。此为静态可达竞态，不声称运行复现。
