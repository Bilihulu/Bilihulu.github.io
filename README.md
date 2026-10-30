# 小瓜的游戏铺 · 静态游戏作品站

浏览器直开的轻量游戏集合站，纯静态 HTML/CSS，零依赖、零构建。

## 目录结构
```
game-site/
├─ index.html          # 作品集首页
├─ assets/style.css    # 样式（漫画卡通 + 国风）
├─ .nojekyll           # 禁用 Jekyll
└─ games/
   ├─ shanhai/         # 山海 · 万兽契约（单文件 HTML）
   └─ qingyun/         # 青云问道 · 修仙RPG（多文件）
```

## 本地预览
```bash
cd game-site
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

## 部署到 GitHub Pages（两种任选）

### 方式 A：用户/组织站点（推荐，直接得到 `你的用户名.github.io`）
1. 在 GitHub 新建仓库，名为 `Bilihulu.github.io`（必须完全一致）。
2. 把 `game-site/` 目录内容推上去：
   ```bash
   cd game-site
   git init
   git add .
   git commit -m "first game shelf"
   git branch -M main
   git remote add origin https://github.com/Bilihulu/Bilihulu.github.io.git
   git push -u origin main
   ```
3. 仓库 Settings → Pages → Source 选 `main` 分支 → Save。
4. 等 1~2 分钟，访问 `https://Bilihulu.github.io` 即可。

### 方式 B：普通项目站点
1. 新建任意仓库（如 `games`）。
2. 同上推代码。
3. Settings → Pages → Source 选 `main` / `(root)` → Save。
4. 访问 `https://Bilihulu.github.io/games/`。

> 注意：本机出网走 Clash 代理时，`git push` 到 github.com 可能握手失败。
> 若遇到，可临时 `git config --global http.proxy ""` 走直连，或改用 SSH 方式推送。

## 加新游戏
1. 把游戏文件夹放进 `games/`（保证里面有 `index.html`）。
2. 在 `index.html` 里复制一张 `<article class="card">`，改标题/简介/链接即可。
