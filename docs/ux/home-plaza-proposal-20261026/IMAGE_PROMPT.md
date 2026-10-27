# 广场内容推荐版：绘图提示词

日期：2026-10-26，Asia/Shanghai。

工具：内置 image_gen；ui-mockup，新图生成。参考用户提供的标注截图、仓库保存的最早先锋电影刊物原稿和当前主页截图，按其视觉信息写入以下提示词。没有调用 CLI 或收费 API 回退。

这是设计讨论稿，人物、作品、封面与通告均为示意；不构成真实业务事实。未修改应用、Figma 或 PR36。

## 最终生成提示词

```text
Use case: ui-mockup
Asset type: high-fidelity Chinese mobile app homepage design proposal, one presentation board showing TWO consecutive scroll viewports of the SAME homepage.
Primary request: Redesign the existing “晶晶日上” plaza to have compact icon navigation and visually rich editorial content discovery. Maintain the distinctive avant-garde cinema magazine identity. This is a polished, practical app UI mockup, not an abstract poster.
Output: a high-resolution square design board, aim 2048x2048 or larger. Two large flat mobile UI rectangles side by side, each exactly in the visual proportions of 390x844 logical pixels. No hardware phone frames, no perspective, no floating devices. Both screens identical width and font scale, beautifully crisp. Use a pale neutral grey outer presentation background; app screens warm paper #F3F1E8. Place short external labels “01 / 广场首屏” above left and “02 / 下滑浏览” above right. Small board footer “概念设计 · 人物与作品均为示意”. Screen pixels should occupy most of the board.
Visual identity: Chinese avant-garde film magazine; dramatic Noto Serif SC Black-style Chinese serif headlines, clean Noto Sans SC body; ink black #151515, vermilion #EF4938 only as focused accent, warm paper #F3F1E8, fine rules, strict alignment, square image crops and square buttons, varied cinematic photography with teal sea, amber sunlight, rain and natural portraits. Richness comes from authentic-looking cinematic imagery and varied editorial rhythm. No neon, no rainbow icon tiles, no glassmorphism, no generic rounded card grid, no heavy shadows. Keep phone text comfortably legible, not tiny desktop text.
Shared shell BOTH screens:
- Compact phone status bar “9:41” and signal/battery glyphs.
- Brand header “晶晶日上” bold Chinese serif left, compact city selector “上海⌄”, magnifying-glass search icon and identity/person icon on right.
- Bottom navigation bar, five equal slots, recognizable simple line icons with exact labels “广场”, “试镜”, “通告”, “消息”, “我的”. “广场” active in ink with small vermilion dot. Bottom home indicator. No notification counts.
LEFT screen — top-of-page state, logged in, no pending task:
- Under header a compact category strip “精选  艺人  视频  同城”, “精选” black bold and thin vermilion underline.
- Then ONE compact row of five small monochrome line icons with short text beneath, exact labels: “找艺人” “看作品” “艺人榜” “找机构” “全部”. At least generous touch spacing, no square colored backgrounds. This row occupies only about 66 logical px.
- Hero editorial recommendation immediately below, about 240 logical px high, with little eyebrow “本期精选”. Cropped cinematic photographic seaside pier at dusk, two fictional adults standing apart with quiet emotion, slate blue water and warm peach sky. An asymmetrical image mostly toward the right, oversized black Chinese serif title “山海之间” arranged as two balanced lines “山海” / “之间”, overlapping a small paper-colored strip at the lower-left edge of the photograph. Tastefully echo a printed cinema magazine. Small genre text “剧情 · 生活” and concise link “查看作品 ↗”. One small vermilion square editorial marker. No rating, price, play count or fake approval badge. The hero is a real content-card design concept, not an oversized generic slogan.
- A thin rule.
- Section heading “发现艺人” bold Chinese serif, right link “更多 ↗”.
- Two adjacent portrait cards with generous rectangular photos and readable text underneath. Fictional young adult Chinese actors, one man in natural side light, one woman in urban daylight, editorial casting portraits, different but harmonious warm/cool tones. Names exactly “林川” and “苏禾”. Short secondary labels “上海 · 剧情” and “上海 · 表演”. No certification or numerical rating. Portrait cards are flat image+text, no surrounding rounded boxes. Both names and labels fully visible above bottom navigation.
- Avoid permanent story progress bar in this no-pending-task state. No content hidden under bottom navigation.
RIGHT screen — lower scroll position of the same homepage:
- Same compact header and category strip, showing the scrolled content below.
- Section “现成作品”, right “更多 ↗”.
- Two stacked compact landscape media rows; each has a 16:9 cinematic thumbnail left and title/detail right, enough separation:
  row one rainy old alley, lone adult with umbrella, amber lamp, title “雨巷来信”, smaller “悬疑 · 剧情”, action “查看预览 ↗”.
  row two sunlit nostalgic city lane, title “夏天的尽头”, smaller “生活 · 成长”, action “查看预览 ↗”.
  A small play triangle may appear only in these genuine preview-thumbnail concepts. Do not show durations, sales or free-full-film claims.
- Below a thin rule, heading “同城机会” and small city “上海”.
- Two clean compact typographic notice rows with small category labels and clear arrow:
  “招募” / “短片演员招募” / “剧情短片 · 上海” / arrow
  “活动” / “城市影像共创” / “影像活动 · 上海” / arrow
  Use warm paper, black typography, one small vermilion category marker; no fabricated dates, pay, private-chat buttons or verified company logos.
- A small dark editorial strip “艺人榜单” left, “查看榜单 ↗” right; no fake rankings.
- A compact warm-paper storytelling call-to-action area, bold serif “你的故事，也值得被看见”, small “从一个想法开始”, square vermilion button “写下故事 ↗”. This is secondary to discovery content.
- A slim understated link “我的故事与草稿 ↗”, no invented pending stage.
- Same five-tab bottom navigation, content fully clears it.
Constraints: Chinese labels must render exactly and be readable, consistent alignment and logical hierarchy. App title is 晶晶日上, not QQ音乐. Show no desktop browser chrome, testing toolbar, audit banner, arrows comparing screenshots, fake real transaction status, or implementation notes inside the UI. Keep upper navigation compact and content images prominent. This is one coherent redesign direction showing top and continuation, not competing alternatives.
```
