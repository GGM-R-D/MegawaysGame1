@echo off
setlocal
pushd "%~dp0.."
echo === Starting RGS on http://localhost:5100 ===
echo.
dotnet run --project backend\RGS\RGS\RGS.csproj --urls http://localhost:5100
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo ERROR: RGS Service failed to start!
    echo ========================================
    echo.
    pause
    exit /b %ERRORLEVEL%
)
popd
endlocal

