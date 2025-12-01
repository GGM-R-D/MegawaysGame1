@echo off
setlocal
pushd "%~dp0.."
echo === Starting RGS on http://localhost:5100 ===
dotnet run --project backend\RGS\RGS\RGS.csproj --urls http://localhost:5100
popd
endlocal

