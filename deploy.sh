#!/usr/bin/env bash
# 一键部署到 GitHub Pages（用户站点：Bilihulu.github.io）
# 在本机（已登录 GitHub / 存有凭证）运行：bash deploy.sh
set -e
cd "$(dirname "$0")"

USER="Bilihulu"
REPO="$USER.github.io"

git init -q 2>/dev/null || true
git add -A
git commit -q -m "deploy game shelf" 2>/dev/null || echo "（无新改动，跳过提交）"
git branch -M main 2>/dev/null || true
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$USER/$REPO.git"

echo "==> 推送到 $REPO ..."
git push -u origin main

echo ""
echo "部署完成！稍等 1~2 分钟，访问："
echo "  https://$REPO"
