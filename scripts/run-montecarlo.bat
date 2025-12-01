@echo off
setlocal
if "%~1"=="" (
  set ARGS=--spins=100000 --bet=0.2 --betMode=standard --buyFrequency=0 --engineBaseUrl=http://localhost:5101 --wait
) else (
  set ARGS=%*
)
pushd "%~dp0.."
echo === Running Monte Carlo simulator (Game Engine) ===
dotnet run --project simulations\JungleRelicsSim -- %ARGS%
popd
endlocal

