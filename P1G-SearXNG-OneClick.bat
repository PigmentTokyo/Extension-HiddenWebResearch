@echo off
setlocal EnableExtensions DisableDelayedExpansion
title P1G Search - SearXNG One-Click Install and Repair

if /i "%~1"=="/?" goto :help
if /i "%~1"=="/help" goto :help

echo ========================================================
echo   P1G Search - SearXNG One-Click Install and Repair
echo ========================================================
echo.
echo This script will:
echo   1. Detect an existing container named searxng.
echo   2. Back up its current settings.yml.
echo   3. Keep only Google, Bing, DuckDuckGo and Baidu.
echo   4. Remove Wikidata, Startpage, Torch and Ahmia.
echo   5. Restart SearXNG and run a real search test.
echo.

docker --version >nul 2>&1
if errorlevel 1 (
    echo [FAILED] Docker was not found.
    echo Install and start Docker Desktop first:
    echo https://www.docker.com/products/docker-desktop/
    goto :failed
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [FAILED] Docker Desktop is not running or is not accessible.
    echo Start Docker Desktop, wait for Running, and run this file again.
    goto :failed
)

set "MODE=new"
set "PORT=8888"
set "INSTALL_DIR=%~dp0searxng-docker"
set "SETTINGS_FILE=%INSTALL_DIR%\settings.yml"

docker inspect searxng >nul 2>&1
if not errorlevel 1 (
    set "MODE=repair"
    set "SETTINGS_FILE="
    for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$c = docker inspect searxng 2^>$null ^| ConvertFrom-Json; if ($c) { $m = $c[0].Mounts ^| Where-Object { $_.Destination -eq '/etc/searxng/settings.yml' } ^| Select-Object -First 1; if ($m) { $m.Source } }"`) do set "SETTINGS_FILE=%%I"
    for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$p = docker port searxng 8080/tcp 2^>$null ^| Select-Object -First 1; if ($p) { ($p -split ':')[-1] }"`) do set "PORT=%%I"
)

if /i "%MODE%"=="repair" (
    if not defined SETTINGS_FILE (
        echo [FAILED] A container named searxng exists, but its mounted settings.yml was not found.
        echo Nothing was changed. Run this command and send its output to the plugin author:
        echo docker inspect searxng
        goto :failed
    )
    echo [DETECTED] Existing SearXNG installation:
    echo            %SETTINGS_FILE%
    echo [DETECTED] Existing host port: %PORT%
) else (
    echo [DETECTED] No existing container. A new installation will be created at:
    echo            %INSTALL_DIR%
    set "PORT_INPUT="
    set /p "PORT_INPUT=Host port [8888] - press Enter to keep it: "
    if defined PORT_INPUT set "PORT=%PORT_INPUT%"
)

if not defined PORT set "PORT=8888"
echo %PORT%| findstr /r /x "[0-9][0-9]*" >nul
if errorlevel 1 (
    echo [FAILED] Port must contain digits only.
    goto :failed
)

powershell -NoProfile -Command "$p=[int]'%PORT%'; if($p -lt 1 -or $p -gt 65535){exit 1}" >nul 2>&1
if errorlevel 1 (
    echo [FAILED] Port must be between 1 and 65535.
    goto :failed
)

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"`) do set "STAMP=%%I"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))"`) do set "SECRET_KEY=%%I"

if not defined STAMP set "STAMP=backup"
if not defined SECRET_KEY set "SECRET_KEY=p1g-searxng-local-change-this-key"

if exist "%SETTINGS_FILE%" (
    copy /y "%SETTINGS_FILE%" "%SETTINGS_FILE%.backup-%STAMP%" >nul
    if errorlevel 1 (
        echo [FAILED] Could not back up settings.yml. Check the file permissions.
        goto :failed
    )
    echo [BACKUP] %SETTINGS_FILE%.backup-%STAMP%
) else (
    for %%I in ("%SETTINGS_FILE%") do if not exist "%%~dpI" mkdir "%%~dpI"
)

>"%SETTINGS_FILE%" (
    echo use_default_settings:
    echo   engines:
    echo     keep_only:
    echo       - google
    echo       - bing
    echo       - duckduckgo
    echo       - baidu
    echo(
    echo general:
    echo   instance_name: SearXNG Local for P1G
    echo   debug: false
    echo(
    echo search:
    echo   safe_search: 0
    echo   autocomplete: ""
    echo   default_lang: zh-CN
    echo   formats:
    echo     - html
    echo     - json
    echo(
    echo server:
    echo   secret_key: "%SECRET_KEY%"
    echo   bind_address: 0.0.0.0
    echo   port: 8080
    echo   limiter: false
    echo   image_proxy: true
    echo(
    echo outgoing:
    echo   request_timeout: 8.0
    echo   max_request_timeout: 15.0
    echo(
    echo engines:
    echo   - name: google
    echo     engine: google
    echo     shortcut: g
    echo     timeout: 10.0
    echo     disabled: false
    echo   - name: bing
    echo     engine: bing
    echo     shortcut: b
    echo     timeout: 10.0
    echo     disabled: false
    echo   - name: duckduckgo
    echo     engine: duckduckgo
    echo     shortcut: ddg
    echo     timeout: 10.0
    echo     disabled: false
    echo   - name: baidu
    echo     engine: baidu
    echo     shortcut: bd
    echo     timeout: 10.0
    echo     disabled: false
)

if errorlevel 1 (
    echo [FAILED] Could not write settings.yml. Check whether the file is locked.
    goto :failed
)

if /i "%MODE%"=="repair" goto :restart_existing

>"%INSTALL_DIR%\docker-compose.yml" (
    echo services:
    echo   searxng:
    echo     image: searxng/searxng:latest
    echo     container_name: searxng
    echo     ports:
    echo       - "%PORT%:8080"
    echo     volumes:
    echo       - ./settings.yml:/etc/searxng/settings.yml:ro
    echo     environment:
    echo       - SEARXNG_BASE_URL=http://localhost:%PORT%/
    echo     restart: unless-stopped
)

echo [INSTALL] Pulling and starting SearXNG. Please wait...
pushd "%INSTALL_DIR%"
docker compose pull
if errorlevel 1 (
    popd
    echo [FAILED] Could not pull the SearXNG image. Check the network and retry.
    goto :failed
)
docker compose up -d
set "START_RESULT=%ERRORLEVEL%"
popd
if not "%START_RESULT%"=="0" (
    echo [FAILED] The SearXNG container did not start.
    goto :show_logs
)
goto :wait_ready

:restart_existing
echo [REPAIR] Restarting the existing SearXNG container...
docker restart searxng >nul
if errorlevel 1 (
    echo [FAILED] Could not restart the container.
    goto :show_logs
)

:wait_ready
echo [CHECK] Waiting for SearXNG to become ready...
set /a READY_TRY=0
:ready_loop
set /a READY_TRY+=1
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%PORT%/' -TimeoutSec 3; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){exit 0}; exit 1 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto :search_test
if %READY_TRY% GEQ 30 (
    echo [WARNING] SearXNG was not reachable after 60 seconds.
    goto :show_logs
)
timeout /t 2 /nobreak >nul
goto :ready_loop

:search_test
echo [TEST] Running one real search...
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $u='http://127.0.0.1:%PORT%/search?q=SillyTavern&format=json'; $r=Invoke-RestMethod -Uri $u -TimeoutSec 45; if(@($r.results).Count -gt 0){ Write-Output @($r.results).Count; exit 0 }; exit 2 } catch { exit 1 }" >"%TEMP%\p1g-searxng-result-count.txt" 2>nul
if errorlevel 1 (
    echo [WARNING] SearXNG started, but this search returned no results.
    echo The configuration repair is active; the current network or engines may be blocking the test.
    goto :verify_engines
)
set /p "RESULT_COUNT=" <"%TEMP%\p1g-searxng-result-count.txt"
echo [PASSED] Search returned %RESULT_COUNT% results.

:verify_engines
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { $c=Invoke-RestMethod -Uri 'http://127.0.0.1:%PORT%/config' -TimeoutSec 15; $n=@($c.engines ^| ForEach-Object { $_.name }); $bad=@('wikidata','startpage','startpage news','startpage images','torch','ahmia') ^| Where-Object { $n -contains $_ }; if($bad.Count){ Write-Output ($bad -join ', '); exit 2 }; exit 0 } catch { exit 1 }" >"%TEMP%\p1g-searxng-bad-engines.txt" 2>nul
set "CONFIG_RESULT=%ERRORLEVEL%"
if "%CONFIG_RESULT%"=="2" goto :bad_engines
if "%CONFIG_RESULT%"=="1" goto :config_unavailable
echo [PASSED] Wikidata, Startpage, Torch and Ahmia are no longer loaded.
goto :success

:bad_engines
set /p "BAD_ENGINES=" <"%TEMP%\p1g-searxng-bad-engines.txt"
echo [WARNING] These unwanted engines are still present: %BAD_ENGINES%
echo Send a screenshot of this window to the plugin author.
goto :success

:config_unavailable
echo [WARNING] The search test finished, but the engine list could not be verified.

:success
echo.
echo ========================================================
echo   Repair completed
echo ========================================================
echo SearXNG URL: http://localhost:%PORT%
echo P1G Search settings:
echo   Search source: Local SearXNG
echo   Base URL: http://localhost:%PORT%
echo   Preferences string: leave empty
echo.
echo Do not run the old one-click-install-1.bat again.
echo It would restore the faulty default-engine configuration.
echo.
pause
exit /b 0

:show_logs
echo.
echo -------------------- Recent logs --------------------
docker logs --tail 80 searxng
echo -----------------------------------------------------

:failed
echo.
echo The operation did not complete. If settings.yml was changed, a timestamped backup is beside it.
echo Send a full screenshot of this window to the plugin author.
echo.
pause
exit /b 1

:help
echo P1G-SearXNG-OneClick.bat
echo.
echo Double-click this file to:
echo   - repair an existing container named searxng, or
echo   - create a new searxng-docker installation beside this file.
exit /b 0
