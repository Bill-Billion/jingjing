# 艺人频道与城市选择 · Image Gen v2

- 生成方式：内置 `image_gen`，参考图生成。
- 参考图：`../channels/artists-channel-v1.png`，仅作品牌、纸灰色彩和摄影风格参考；布局全部重排。
- 目标文件：`artists-city-v2.png`。
- 首轮生成来源：`/Users/yanghaoran/.codex/generated_images/01a178af-138f-7862-a707-df6b73c6fe8a/exec-125fb4bb-2e6d-43bf-a6c7-489816289f44.png`。
- 定点修正输入：首轮来源图（调用时已复制至目标文件），修正黑色广场图标与四个明星头像。
- 最终生成来源：`/Users/yanghaoran/.codex/generated_images/01a178af-138f-7862-a707-df6b73c6fe8a/exec-055bf451-95d2-4f90-9518-46c63daf4672.png`。

## Exact prompt

Use case: ui-mockup
Asset type: a crisp, high-fidelity mobile app design review board, flat front-on raster UI, two complete 390×844 logical-pixel viewports side by side, approximately square high-resolution canvas. No phone device frame, no perspective, no browser or chat shell. Neutral light gray background outside the two UI rectangles. The UI screens must be fully visible including bottom edges, not cropped.

Input image 1 is ONLY a visual style and brand reference. Replace its oversized hero portrait, old two-column large portraits, ranking banner and second feed screen entirely. Recompose both screens according to this new specification. Do not preserve the old layout or old face identities. Use small portrait images and dense, readable information.

Visual system: warm paper gray #F3F1E8 for app surfaces, ink black #151515 for text and thin dividers, vermilion #EF4938 for restrained active accents. Noto Serif SC Black-like bold Chinese serif headlines and brand; clean Chinese sans-serif interface and body text. Square-corner photographic cards, almost no elevation, precise editorial spacing, hairline separators. Clear legible Chinese glyphs. All people are fictional adult Chinese actors, different genders and ages, natural varied faces and clothes, cinematic natural-light editorial photography. No recognizable real celebrity. No verified badges, fans, prices, ratings, distances or appointment dates.

Board labels outside screens, left aligned above their respective screens: “01 / 艺人频道” and “02 / 选择城市”. Outside below the screens place exactly: “概念设计 · 人物与内容均为示意”. There should be no other explanatory annotations on the board.

LEFT SCREEN — artists channel, complete 390×844 viewport:
At top a compact status row, then compact masthead containing the brand “晶晶日上” on the left, “上海⌄” toward the right, a search outline icon and small account outline icon. Then one compact navigation row exactly “精选  艺人  视频  同城”, with “艺人” bold and a small red underline. Together the status, brand and channel navigation occupy only about 112 logical pixels of height.

FIRST content block immediately below navigation: title “明星推荐”, with “上海 · 更多↗” aligned to its right. Exactly one row of FOUR SMALL circular actor headshots, each about 56–60 logical pixels in diameter, with each name below. Left to right names exactly “周亦宁”, “何予安”, “陈聿”, “林屿”. These fictional adult actors vary in gender and age, approximately late 20s to 50s. This whole block is compact, around 110 logical pixels tall. Do not add any hero poster or oversized featured person.

SECOND content block after a fine divider: a compact single horizontal row headed “本地艺人”, followed by small filter controls “全部标签⌄”, “可约试镜”, “筛选”. “可约试镜” is only a neutral filter button, without selected checkmark or booked status.

Immediately below, a THREE COLUMN by THREE ROW grid of NINE small actor portrait cards. Each image is approximately 108×100 logical pixels, with square corners. Under each image show a clear bold name and one short smaller tag. Keep the entire nine-card grid visible in the viewport. The grid cards in reading order:
Row 1: “苏禾” / “上海·表演”; “陈默” / “上海·配音”; “林夏” / “上海·表演”.
Row 2: “方宁” / “上海·舞蹈”; “叶舟” / “上海·配音”; “许清” / “上海·表演”.
Row 3: “许舟” / “上海·表演”; “白露” / “上海·舞蹈”; “江禾” / “上海·配音”.
All nine portraits must be different faces with different clothing; maintain consistent cinematic natural light. Use readable typography, modest consistent gutters and a short caption band. Density is a core requirement: a total of 13 people visible in the left viewport, 4 small round star avatars plus 9 small rectangular local actor portraits. No duplicate artist block, no giant photograph, no rankings banner.

Below the grid place one quiet short text action “查看更多艺人 ↗”. At bottom a fixed primary navigation strip with five evenly spaced black outline icons and labels exactly “广场  试镜  通告  消息  我的”. “广场” is the active item: black house icon with one small vermilion dot at upper-right, label in vermilion. Every other icon and label is black. Include a bottom home indicator. Fit all content comfortably within the full viewport.

RIGHT SCREEN — city selection SECONDARY page, complete 390×844 viewport:
Compact status row then independent title bar “‹ 选择城市”. This is a secondary page: DO NOT include the brand masthead, four-channel navigation or the five-item primary bottom navigation. Include only bottom home indicator.

At top below title an understated search input with small search icon and exact placeholder “搜索城市”. Then a compact section headed “当前浏览” with a paper card containing large “上海” and smaller “手动选择优先”. It is clearly the current browsing city.

Next a section headed “推荐城市” with a compact subtle card showing large “杭州”, smaller “大致位置，可手动修改”, and a restrained vermilion action button labeled “使用杭州”. This is only a suggestion and is not currently selected. Keep the current city Shanghai visibly separate from the suggested city Hangzhou. Do not say the app switched automatically or that location succeeded.

Below place a small location-pin icon with text action “获取当前位置”. Then heading “热门城市” and exactly six modest city buttons in TWO ROWS of THREE COLUMNS: first row “北京”, “上海”, “杭州”; second row “广州”, “深圳”, “成都”. Shanghai may have a subtle thin vermilion border to indicate current browsing. Under the city grid, short explanatory copy exactly “无法定位时，可直接选择城市”. Leave calm blank space below and a bottom home indicator.

Rendering constraints: visually polished compact Chinese editorial app UI, precise alignment and all specified text readable. Flat planar screen rectangles. Preserve brand and palette from reference only. Do not expose implementation terms such as API or IP. No invented numeric claims, distances, prices, fans, ratings, availability dates or success messages. No real celebrities. No additional modules or decorative giant banners. No outer rounded phone shell. No primary navigation on the city selection page.

## Targeted refinement prompt

Use case: ui-mockup
Edit this existing two-screen board with exactly two targeted corrections. Preserve the entire layout, all Chinese text, both complete screen rectangles, background, board labels, city-selection content and brand typography unchanged.

Correction 1: In the LEFT screen's bottom navigation, change only the HOUSE ICON for the active “广场” item from solid red to BLACK OUTLINE, matching the black outline visual weight of the other four icons. Keep a small vermilion red dot at the house icon's upper-right and keep the “广场” text red. The icon itself must be black, with no red fill. Do not change the four other icons. The RIGHT screen must continue to have NO five-item primary bottom navigation.

Correction 2: Replace only the FOUR circular star headshot photographs in the “明星推荐” row with four new distinct fictional Chinese adult actors, so none repeats a person in the nine rectangular local-artist cards below. The circular avatar subjects left to right: a 40-year-old short-haired woman in an ivory shirt; a 50-year-old man with very short salt-and-pepper hair in a charcoal jacket; a 30-year-old man with close-cropped hair and round wireframe glasses in a forest-green shirt; a 35-year-old woman with a neat tied-back ponytail in a navy jacket. Natural varied faces, cinematic natural light, no real celebrity likeness. Keep the four circles' exact sizes and positions, and preserve the four names exactly “周亦宁”, “何予安”, “陈聿”, “林屿”. Keep all nine rectangular local-artist portraits, names and tags unchanged.

Everything else must remain unchanged. In particular current browsing city stays “上海”, recommended city stays “杭州”, “手动选择优先” and “大致位置，可手动修改” retain their separate meanings, and there are no invented numeric claims or large banners. Preserve the outside caption “概念设计 · 人物与内容均为示意”.
