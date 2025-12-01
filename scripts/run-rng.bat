@echo off
setlocal
pushd %~dp0..
echo === Starting RNG host on http://localhost:5102 ===
dotnet run --project backend\RngHost\RngHost.csproj --urls http://localhost:5102
popd
endlocal

