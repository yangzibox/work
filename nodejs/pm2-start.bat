@echo off
chcp 65001 > nul
cd /d "D:\work\nodejs"
npx pm2 start backend.js --watch