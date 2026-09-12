@echo off
cd /d "%~dp0"
node scripts/pms/sync-calendar.mjs %*
if %errorlevel% neq 0 (
    echo.
    echo An error occurred while syncing PMS calendar.
    pause
)
