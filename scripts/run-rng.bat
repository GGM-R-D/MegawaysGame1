@echo off
setlocal
pushd %~dp0..
echo === Starting RNG host on http://localhost:5102 ===
echo.
dotnet run --project backend\RngHost\RngHost.csproj --urls http://localhost:5102
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo ERROR: RNG Host failed to start!
    echo ========================================
    echo.
    pause
    exit /b %ERRORLEVEL%
)
popd
endlocal

