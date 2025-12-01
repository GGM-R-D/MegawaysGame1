@echo off
setlocal
pushd %~dp0..
echo === Starting Game Engine host on http://localhost:5101 ===
dotnet run --project backend\GameEngineHost\GameEngine.Host.csproj --urls http://localhost:5101
popd
endlocal

