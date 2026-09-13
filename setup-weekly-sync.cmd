@echo off
setlocal
cd /d "%~dp0"
echo =======================================================
echo   Atlantic Holiday - Weekly Reviews Auto-Sync Setup
echo =======================================================
echo.
echo Choose an option:
echo   [1] Schedule automatic sync every Monday at 09:00 AM
echo   [2] Schedule automatic sync every Sunday at 20:00 (8 PM)
echo   [3] Run weekly sync right now (sync + push to GitHub)
echo   [4] Remove / cancel scheduled task
echo   [5] Check scheduled task status
echo.
set /p choice="Enter option (1-5): "

if "%choice%"=="1" (
  schtasks /create /tn "AtlanticHoliday-WeeklyReviewsSync" /tr "\"C:\Program Files\nodejs\node.exe\" \"%~dp0scripts\reviews\weekly-sync.mjs\"" /sc weekly /d MON /st 09:00 /f
  echo.
  echo ✅ Successfully scheduled weekly sync for Mondays at 09:00 AM!
) else if "%choice%"=="2" (
  schtasks /create /tn "AtlanticHoliday-WeeklyReviewsSync" /tr "\"C:\Program Files\nodejs\node.exe\" \"%~dp0scripts\reviews\weekly-sync.mjs\"" /sc weekly /d SUN /st 20:00 /f
  echo.
  echo ✅ Successfully scheduled weekly sync for Sundays at 20:00 (8 PM)!
) else if "%choice%"=="3" (
  node scripts/reviews/weekly-sync.mjs
) else if "%choice%"=="4" (
  schtasks /delete /tn "AtlanticHoliday-WeeklyReviewsSync" /f
  echo.
  echo ✅ Scheduled task removed.
) else if "%choice%"=="5" (
  schtasks /query /tn "AtlanticHoliday-WeeklyReviewsSync" /fo LIST /v
) else (
  echo Invalid option.
)

pause
