@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo  Rufus Research - Chrome 启动脚本
echo ========================================

:: 1. 关闭所有 Chrome 进程
echo [1/3] 关闭已有的 Chrome 进程...
taskkill /F /IM chrome.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: 2. 删除锁文件
del "%LOCALAPPDATA%\Google\Chrome\User Data\SingletonLock" >nul 2>&1
del "%LOCALAPPDATA%\Google\Chrome\User Data\SingletonCookie" >nul 2>&1
del "%LOCALAPPDATA%\Google\Chrome\User Data\SingletonSocket" >nul 2>&1

:: 3. 创建专用调试 profile（如果不存在）
set "RUFUS_PROFILE=%LOCALAPPDATA%\Google\Chrome\User Data\RufusDebug"
if not exist "%RUFUS_PROFILE%" (
    echo [2/3] 创建专用调试 profile...
    mkdir "%RUFUS_PROFILE%"
    :: 复制关键登录文件
    copy "%LOCALAPPDATA%\Google\Chrome\User Data\Default\Preferences" "%RUFUS_PROFILE%\Preferences" >nul 2>&1
    copy "%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cookies" "%RUFUS_PROFILE%\Cookies" >nul 2>&1
    copy "%LOCALAPPDATA%\Google\Chrome\User Data\Default\Login Data" "%RUFUS_PROFILE%\Login Data" >nul 2>&1
    copy "%LOCALAPPDATA%\Google\Chrome\User Data\Default\Login Data-journal" "%RUFUS_PROFILE%\Login Data-journal" >nul 2>&1
    copy "%LOCALAPPDATA%\Google\Chrome\User Data\Default\Web Data" "%RUFUS_PROFILE%\Web Data" >nul 2>&1
    copy "%LOCALAPPDATA%\Google\Chrome\User Data\Default\Web Data-journal" "%RUFUS_PROFILE%\Web Data-journal" >nul 2>&1
    copy "%LOCALAPPDATA%\Google\Chrome\User Data\Default\Secure Preferences" "%RUFUS_PROFILE%\Secure Preferences" >nul 2>&1
    echo    Profile 创建完成
) else (
    echo [2/3] 调试 profile 已存在，跳过创建
)

:: 4. 启动 Chrome（带远程调试端口）
echo [3/3] 启动 Chrome (端口 9222)...
start "" "%PROGRAMFILES%\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="%RUFUS_PROFILE%"

echo.
echo ========================================
echo  Chrome 已启动!
echo  请在弹出的窗口中:
echo  1. 确认已登录 Amazon
echo  2. 邮编设为 90001
echo  3. 然后回到 Claude Code 告诉我 "准备好了"
echo ========================================
echo.
pause
