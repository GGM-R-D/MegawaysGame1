@echo off
setlocal
pushd "%~dp0.."
echo === Starting Frontend on http://localhost:3010 ===
echo.

REM Check if node_modules exists, if not install dependencies
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ========================================
        echo ERROR: Failed to install dependencies!
        echo ========================================
        echo.
        pause
        exit /b %ERRORLEVEL%
    )
    cd ..
    echo.
)

REM Start the frontend
cd frontend
call npm run dev
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo ERROR: Frontend failed to start!
    echo ========================================
    echo.
    pause
    exit /b %ERRORLEVEL%
)
cd ..
popd
endlocal

