@echo off
title Atlantic Holiday - Airbnb Links Fetcher
cd /d "%~dp0"
echo =========================================================
echo   Atlantic Holiday - Auto Fetch Airbnb Listings
echo =========================================================
echo.
echo Launching Microsoft Edge...
echo Please log into your Airbnb Host account in Edge when it appears.
echo.
node scripts/reviews/fetch-listing-links.mjs --platform airbnb
pause
