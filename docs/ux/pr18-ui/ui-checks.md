# 本地真实验证

2026-10-03。App相关169项测试通过、静态分析0诊断、完整Flutter Web构建通过。网页完整113项测试通过；渠道登记误判修复后项目22项及含静态检查的完整构建再通过。后端projects25项真实MySQL测试通过、0跳过；契约声明107接口/186格式与协作文档结构检查通过。

实际浏览器：App9组、网页13组全部通过，0页面异常，19+27张实际截图。普通短信登录、个人/机构OWNER和无acting的独立审核以原HTTP/MySQL处理，外部短信/存储/沙箱付款传输仅合成替身。覆盖完整选角、本人报名与邀请、原请求恢复、PLAN/EDITION顺序会签GET证明、真实独立角色费及原制作、开工条件、成片、内部送审、外部凭据独立核验、渠道登记、导航和窄屏，以及外部账号拒绝。

网页前11组真实通过后，实际发现渠道输入错误依赖账号allowed_actions；修复后重新正常短信登录，核对同一隔离库及已完成记录，续跑最后2组，结果标记resumed_passes=11。没有重建已消费资金或凭空重置业务事实。App在新的隔离实例完整9组运行通过。原失败及调试记录保留本地.local，不纳入通过截图。

[App结果](evidence/app-browser-results.json) · [网页结果](evidence/web-browser-results.json) · [机器可读检查](evidence/verification-summary.json) · [逐页原图](design-qa.md)。原始日志保留本树.local/pr18-app-tests.log、pr18-app-analyze.log、pr18-app-build.log、pr18-web-tests.log、pr18-projects-channel-fix-tests.log、pr18-web-build.log、pr18-backend-projects.log、pr18-contract.log、pr18-app-browser.log、pr18-web-browser.log。

仅本地完成本批；未上传PR18、合并共同版本或部署。按用户要求不做原生/真机测试，不新增本地依赖。正式发行渠道和真实商业授权仍由实际负责人核验。
