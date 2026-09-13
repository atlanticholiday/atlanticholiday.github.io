@echo off
setlocal
cd /d "%~dp0"
node scripts/reviews/sync-reviews.mjs %*
pause
