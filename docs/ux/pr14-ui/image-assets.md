# 原图册方向的 App 静态摄影素材

2026-09-30。用户要求所有页面参考原图册样式，采用原 `APP-07-01-v2` 的自然光稿纸摄影方向。使用内置 `image_gen` 生成背景图，原字节保存为 [story-manuscript-v2.png](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/assets/images/story-manuscript-v2.png)。该图只有静态无品牌纸张、桌面和绿植；标题、副标题及所有业务字段由界面绘制，没有嵌入价格、作者、签署或批准事实。

首页另按 `APP-01-01-v2` 的暖光旧车站、木凳和剧本摄影生成 [home-station-v2.png](../../../晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/assets/images/home-station-v2.png)。远处匿名轮廓和空白稿纸仅为静态故事装饰，不代表真实演员、项目剧照或公开私有作品；首页标题采用代码文字叠加。

之前两张立体纸雕试稿不符合原图册，已从工程素材中移除；生成原件保留于Codex的generated_images目录。管理端保持原图册工作台布局，不采用此横幅或立体装饰。常用操作和导航图标继续使用既有Material/SVG体系。

## 入戏横幅最终提示词（内置工具模式）

```text
Use case: photorealistic-natural
Asset type: decorative background photograph for the existing 'discover good screenplays' banner in a warm-white Chinese app.
Primary request: match the calm natural photographic mood of the original approved UI banner: blank warm cream manuscript paper on a light oak desk near a window, warm morning daylight and soft leaf shadows, a softly blurred small green plant in the distant upper-right background.
Composition/framing: wide horizontal banner about 2.4:1. A small stack of unprinted cream manuscript pages fills the right half and angles toward the lower-right. The left 55 percent is quiet, low-contrast warm ivory wall/desk and softly diffused daylight, with ample clean space for dark UI text placed by code. All paper edges that matter remain inside the image. This is a close-up real tabletop photograph, not a rendered UI, poster, icon, book cover or sculpture.
Lighting/mood: quiet, warm, editorial natural photography; believable paper fibers, real oak grain, gentle depth of field. Low contrast behind the future UI text.
Color palette: restrained warm white, light honey oak, a small muted natural green accent; no dramatic saturation.
Text: none, no letters or marks on the paper.
Constraints: no people, faces, logos, signatures, writing, watermarks, frames, 3D paper sculptures, theater arches, ribbons, embossed seals, gold trim, fantasy elements, decorative curls or UI controls. Preserve the simple photographic style of the approved manuscript-on-desk banner. Ordinary unbranded static decorative props only.
```

## 首页背景最终提示词（内置工具模式）

```text
Use case: photorealistic-natural. Asset type: static photographic background for the existing Chinese creative-writing App home page, inspired by its approved warm-white editorial design. Create only the photographic scene, no UI. A quiet old railway station platform in warm late-afternoon light, weathered wooden bench in the near lower-left foreground with an open blank cream manuscript notebook and a black fountain pen, station canopy and an old unbranded train receding along the right side, one very distant anonymous out-of-focus person walking away, no recognizable face. Natural photographic texture and gentle shallow depth of field, golden cream and muted olive tones, restrained soft natural shadows. Landscape 4:3 composition; keep upper-left and upper-middle visually calm and darker under the canopy so white code-rendered title and subtitle can overlay clearly. Manuscript must have completely blank pages, no markings. No readable text anywhere, no numbers, signage, logos, watermarks, UI, frame, ribbons, seals, 3D paper sculptures, or surreal props. This is a local decorative story image, not an actor photo or actual project still.
```
