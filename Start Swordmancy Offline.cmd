@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js/npm chua duoc cai dat hoac khong co trong PATH.
    echo Hay cai Node.js roi chay lai file nay.
    pause
    exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
    echo Chua thay thu muc node_modules.
    echo Chay npm install mot lan truoc khi dung file nay.
    pause
    exit /b 1
)

echo Dang mo Trial of Swordmancy Simulator...
echo Dong cua so nay hoac bam Ctrl+C de tat local server.
echo.

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING" /C:":3001 .*LISTENING"') do (
    echo Dang tat local server cu tren PID %%P...
    taskkill /F /PID %%P >nul 2>nul
)

npm run dev -- --host 127.0.0.1 --port 3000

pause
