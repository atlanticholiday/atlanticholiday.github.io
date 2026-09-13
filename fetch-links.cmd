@echo off
setlocal
cd /d "%~dp0"
echo =======================================================
echo   Atlantic Holiday - Auto Fetch All Property Links
echo =======================================================
echo.
echo Select an option:
echo   [1] Fetch from Airbnb Host Portal
echo   [2] Fetch from Booking.com Extranet
echo   [3] Fetch from BOTH
echo.
set /p choice="Enter option (1, 2, or 3): "

if "%choice%"=="1" (
  node scripts/reviews/fetch-listing-links.mjs --platform airbnb
) else if "%choice%"=="2" (
  node scripts/reviews/fetch-listing-links.mjs --platform booking
) else if "%choice%"=="3" (
  node scripts/reviews/fetch-listing-links.mjs --platform both
) else (
  node scripts/reviews/fetch-listing-links.mjs --platform airbnb
)

pause
