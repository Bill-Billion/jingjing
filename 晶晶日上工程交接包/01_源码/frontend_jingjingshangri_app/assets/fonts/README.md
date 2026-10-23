# 新版刊物字体

标题采用原设计中的 Noto Serif SC：Bold 700 与 Black 900，正文采用 Noto Sans SC。`EditorialSerif` 只是现有 Flutter/CSS 的兼容注册名称，实际字形已经换成 Noto Serif SC；没有将700字重冒充Black。主要大标题使用900，分节与小标题使用700。

Noto Serif SC 来源固定为 Google Fonts 仓库提交 `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`：
https://github.com/google/fonts/tree/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notoserifsc

原始可变字体 SHA-256：`050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9`。用 fontTools 4.61.1 按真实700/900轴值实例化，更新字体名称及weight class；每份保留上游全部30,928个Unicode映射，没有只收录示例姓名或UI文字。原始字库之外的字符仍由平台回退，用户输入不被过滤。

Noto Sans SC保留原完整100–900可变字库：
https://github.com/google/fonts/tree/main/ofl/notosanssc

原始TTF SHA-256：`a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`。Vue改用无损WOFF2，Flutter使用各平台可读的TTF。默认Roboto回退名称同时注册到本地NotoSansSC，避免CanvasKit为未指定字体的中文另向Google下载；最终是否仍有外网请求，以浏览器网络证据为准。

生成脚本：`scripts/build-editorial-fonts.py <固定版本NotoSerifSC可变TTF>`；工具只在任务私有环境，不增加App或Web依赖。字体文件大小、哈希和字符覆盖见FONT_MANIFEST.json，完整许可证见NotoSerifSC-OFL.txt与NotoSansSC-OFL.txt。保留完整字库会增加Flutter资源体积，字体一致不等于已完成真机首访性能验收。
