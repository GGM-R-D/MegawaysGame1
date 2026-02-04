@echo off
setlocal
pushd %~dp0..
echo === Starting Game Engine host on http://localhost:5101 ===
echo.
dotnet run --project backend\GameEngineHost\GameEngine.Host.csproj --urls http://localhost:5101
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo ERROR: Game Engine failed to start!
    echo ========================================
    echo.
    pause
    exit /b %ERRORLEVEL%
)
popd
endlocal

