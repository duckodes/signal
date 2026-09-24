@echo off
setlocal EnableExtensions

rem Download the latest Taiwan OpenStreetMap extract from Geofabrik.
set "REGION=taiwan"
set "DOWNLOAD_URL=https://download.geofabrik.de/asia/%REGION%-latest.osm.pbf"
set "MAP_DIR=%~dp0map-data"
set "TARGET=%MAP_DIR%\%REGION%-latest.osm.pbf"
set "TEMP_FILE=%TARGET%.download"
set "INFO_FILE=%MAP_DIR%\%REGION%-latest.txt"

if not exist "%MAP_DIR%" mkdir "%MAP_DIR%"

echo.
echo [FIELD] Downloading the latest %REGION% OSM data...
echo Source: %DOWNLOAD_URL%
echo Destination: %TARGET%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%TEMP_FILE%'"
if errorlevel 1 (
    echo.
    echo Download failed. The existing local map data was not changed.
    if exist "%TEMP_FILE%" del /q "%TEMP_FILE%"
    exit /b 1
)

move /y "%TEMP_FILE%" "%TARGET%" >nul
if errorlevel 1 (
    echo Could not replace the local map file.
    exit /b 1
)

(
    echo region=%REGION%
    echo source=%DOWNLOAD_URL%
    echo downloaded=%DATE% %TIME%
    echo file=%TARGET%
) > "%INFO_FILE%"

echo.
echo Map data updated successfully.
echo.
echo This .osm.pbf file is source data, not browser tiles.
echo Use a local tile server or vector tile builder to render fully offline roads.
pause
