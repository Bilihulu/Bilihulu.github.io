#!/usr/bin/env bash
# 一键部署到 GitHub Pages（用户站点：Bilihulu.github.io）
# 在本机（已登录 GitHub / 存有凭证）运行：bash deploy.sh
#
# 说明：推送时强制绕开本地代理（Clash 等会把 github.com 掐断），
#       如果你的 GitHub 走的是 SSH，可改用：
#       git remote set-url origin git@github.com:Bilihulu/Bilihulu.github.io.git
set -e
cd "$(dirname "$0")"

USER="Bilihulu"
REPO="$USER.github.io"

# 确保 GitHub Pages 不启动 Jekyll（我们的资源路径含 build 产物）
touch .nojekyll

git init -q 2>/dev/null || true
git add -A
git commit -q -m "deploy game shelf" 2>/dev/null || echo "（无新改动，跳过提交）"
git branch -M main 2>/dev/null || true
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$USER/$REPO.git"

echo "==> 推送到 $REPO（已绕开本地代理）..."
# 清空代理环境变量，避免 git/curl 走 Clash 被掐断
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
  git push -u origin main

echo ""
echo "部署完成！稍等 1~2 分钟，访问："
echo "  https://$REPO"
