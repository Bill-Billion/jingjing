# 两批独立本地交付

2026-10-03，本轮按原第16和17份分别完成前端及浏览器验收。两批都基于已上传PR15前端1e10cce，明确引入各自原后端；不是第七、八阶段已合并的共同服务器。原GitHub分支和主目录保留，当前没有上传、合入或部署。

|批次|本地分支与保存版本|浏览器审查|通过检查|
|---|---|---|---|
|PR16 制作/逐版审阅/交付|ux/pr16-pages，功能7bea26f，最终5a294b0|App8773/mobile-preview.html；网页5206/production/projects|App146、Web91、浏览器App7/Web10、PR15回归11；后端制作20/交易25/许可28/任务21|
|PR17 商单/MCN/佣金/榜单|ux/pr17-pages，功能见本批README|App8774/mobile-preview.html；网页5205/gigs/catalogue|App141、Web91、浏览器App7/Web9；后端商单23/交易25/许可27|

PR16资料在本机独立目录 `/Users/yanghaoran/Code/jingjing-pr11-pages/docs/ux/pr16-ui/README.md`，PR17资料在本目录[README](README.md)。第16份预览使用3282，第17份3302，随机库和合成账号互不覆盖；原15预览未停止。原图册都固定acd5f99，共计本批15+21张最终参考图。

下一次明确集中交付时分别追加原[PR16](https://github.com/Bill-Billion/jingjing/pull/16)与[PR17](https://github.com/Bill-Billion/jingjing/pull/17)，保留每份原历史。进入共同版本前需审阅两份的共享HTTP入口、建表顺序、公共约定和前端共用菜单；尚未合并时不能从第17份进入不存在的制作模块，也不能把独立测试通过等同于共同服务器联调已完成。真实外部服务与原生设备另行验收，手机测试保持用户取消的决定。
