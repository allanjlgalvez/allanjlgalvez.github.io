@echo off
setlocal
title NEXUS - Actualizar
cd /d "%~dp0"
set "URL=https://github.com/allanjlgalvez/allanjlgalvez.github.io/releases/download/nexus-latest"

echo.
echo   ============================================
echo     NEXUS - instalar / actualizar
echo   ============================================
echo   Carpeta: %CD%
echo   Tus datos (carpeta "datos") NO se tocan.
echo.

where curl >nul 2>nul || (
  echo   ERROR: Windows no tiene curl. Necesitas Windows 10 o superior.
  pause & exit /b 1
)

tasklist /fi "imagename eq nexus.exe" 2>nul | find /i "nexus.exe" >nul && (
  echo   Cerrando NEXUS...
  taskkill /im nexus.exe /f >nul 2>nul
  timeout /t 2 /nobreak >nul
)

echo   Descargando la ultima version...
curl -fL --progress-bar -o nexus.nuevo "%URL%/nexus.exe"
if errorlevel 1 goto :error

if exist nexus.exe move /y nexus.exe nexus.anterior.exe >nul
move /y nexus.nuevo nexus.exe >nul
curl -fsL -o LEEME.md "%URL%/LEEME.md"
curl -fsL -o version.txt "%URL%/version.txt"
set /p VER=<version.txt
echo.
echo   Listo: NEXUS %VER%
echo   (la version anterior quedo como nexus.anterior.exe)
echo.
rem Acceso directo con icono en el escritorio (solo si no existe)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $l=Join-Path $d 'NEXUS.lnk'; if(-not (Test-Path $l)){ $s=(New-Object -ComObject WScript.Shell).CreateShortcut($l); $s.TargetPath='%~dp0nexus.exe'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0nexus.exe,0'; $s.Description='NEXUS - contactos'; $s.Save(); Write-Host '  Acceso directo NEXUS creado en el escritorio.' }" 2>nul
rem Refresca el cache de iconos de Windows para que se vea el icono nuevo
ie4uinit.exe -show >nul 2>nul
start "" "%~dp0nexus.exe"

rem Este mismo archivo tambien se actualiza, al final y en segundo plano.
curl -fsL -o actualizar.nuevo "%URL%/actualizar.bat"
if exist actualizar.nuevo start "" /min cmd /c "timeout /t 2 /nobreak >nul & move /y actualizar.nuevo actualizar.bat >nul"
timeout /t 3 >nul
exit /b 0

:error
echo.
echo   ERROR: no se pudo descargar. Revisa tu conexion a internet.
if exist nexus.nuevo del nexus.nuevo
pause
exit /b 1
