@echo off
setlocal
cd /d "%~dp0"
echo =======================================================
echo   Atlantic Holiday - Auto Fetch All Property Links
echo =======================================================
echo.
echo Select an option:
echo   [1] Auto-discover from local computer (History, CSVs and Slugs)
echo   [2] Fetch from Airbnb Host Portal (interactive browser)
echo   [3] Fetch from Booking.com Extranet (interactive browser)
echo   [4] Fetch from BOTH portals
echo.
set /p choice="Enter option (1, 2, 3, or 4): "

if "%choice%"=="1" (
  node scripts/reviews/match-local-links.mjs
) else if "%choice%"=="2" (
  node scripts/reviews/fetch-listing-links.mjs --platform airbnb
) else if "%choice%"=="3" (
  node scripts/reviews/fetch-listing-links.mjs --platform booking
) else if "%choice%"=="4" (
  node scripts/reviews/fetch-listing-links.mjs --platform both
) else (
  node scripts/reviews/match-local-links.mjs
)

pause
