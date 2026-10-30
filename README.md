# 咩咩咩捏捏得游戏铺 · 静态游戏作品站

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

