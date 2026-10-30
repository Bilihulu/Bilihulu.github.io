# 上架 itch.io 指南

两个游戏都是纯 HTML5，**itch.io 支持浏览器直接玩**，上传一个 zip 即可。
本目录已帮你打好包：`build/shanhai.zip`、`build/qingyun.zip`。

## 通用上传步骤（每个游戏重复一次）
1. 登录 https://itch.io ，右上角 **Create new project**。
2. **Kind of project** 选 `HTML`。
3. 填标题、简介（文案见下），**Classification** 内容分级选 `Everyone` / 无敏感内容。
4. **Uploads** → 上传对应的 zip。
5. 上传后在该文件处勾选 **"This file will be played in the browser"**，
   Homepage 选 `index.html`。
6. **Visibility** 先选 `Restricted`（自己可见）测试能跑通，再改 `Public`。
7. **Pricing**：建议先 `Free`（或 `Pay what you want` 随赏），攒口碑。
8. 封面图建议 630×500，截图挑游戏内最佳画面（见各游戏建议）。
9. 发布后把游戏链接回填到 GitHub 站点首页（见下方「回填」）。

---

## 游戏一：山海 · 万兽契约

- **标题**：山海 · 万兽契约 (Shanhai: Beastbound)
- **短描述**：国风神兽收集养成 —— 唤灵、探险、图鉴、战斗与觉醒，点开即玩。
- **长描述（建议直接复制）**：
  ```
  一款国风剪纸美术的神兽收集养成游戏，单文件 HTML、点开即玩。

  · 唤灵台：抽取并契约山海神兽
  · 山海行：探索区域、推进剧情节点
  · 万兽录：收集图鉴、查看神兽档案
  · 战斗：组建阵容、释放技能、击败强敌
  · 觉醒突破：培养神兽进阶飞天

  特点：纯浏览器运行，手机/电脑自适应；localStorage 自动存档；
  无任何外部依赖与登录。
  ```
- **标签**：chinese, mythology, monsters, collection, rpg, browser, singleplayer, casual
- **分类**：Games → Role Playing（或 Adventure）
- **截图建议**：唤灵台抽兽界面、万兽录图鉴页、阵容战斗画面

---

## 游戏二：青云问道 · 修仙RPG

- **标题**：青云问道 · 修仙RPG (Qingyun Quest: Immortal RPG)
- **短描述**：水墨仙侠单人沉浸修仙 —— 打坐炼气、任务历练、炼丹突破，降伏后山妖蟒。
- **长描述（建议直接复制）**：
  ```
  一款水墨仙侠主题的单人沉浸修仙 RPG，零依赖单页、点开即玩。

  · 完整修仙闭环：道号 → 打坐 → 炼气 1-9 → 筑基 → 击败青鳞妖蟒
  · 任务链：九环主线串联成长
  · 炼丹：火候小游戏炼制丹药
  · 离线收益：离线按 50% 速率累积，最长 8 小时
  · 存档：localStorage 本地保存，支持导入/导出

  特点：Canvas 程序化水墨场景 + Web Audio 程序化音效，无任何外部素材；
  手机/电脑自适应。
  ```
- **标签**：chinese, wuxia, xianxia, cultivation, rpg, browser, singleplayer, ink
- **分类**：Games → Role Playing
- **截图建议**：标题水墨山峦、打坐/炼气界面、炼丹小游戏、Boss 战

---

## 打包新游戏（复用）
以后加新游戏，把文件夹丢进 `games/`，在本目录运行：
```bash
python pack.py
```
会自动生成 `build/游戏名.zip`，直接上传 itch.io。

## 回填到 GitHub 站点
发布后拿到链接（如 `https://你的名.itch.io/shanhai`），
告诉我，我把首页每个卡片加一个「在 itch.io 玩」按钮，双线打通。
