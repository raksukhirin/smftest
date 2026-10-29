@echo off
rem pack.bat - build, test and package BLScan for a customer
rem   pack.bat            build + run tests + package (stops if build or tests fail)
rem   pack.bat /notest    skip the tests
rem Output: bin\pack\BLScan\ (folder) and bin\pack\BLScan-yyyyMMdd.zip
rem The package never contains BLScan.ini (DB settings), admin.json, _samples or _trash:
rem templates are copied from the source folder, not from bin\templates.
rem (ASCII only on purpose: Thai text in a .bat breaks cmd line parsing)
setlocal
cd /d "%~dp0"

echo === 1/4 build ===
if not exist "%~dp0src\sn.txt" echo WARNING: src\sn.txt not found - no customer will have EDI
call "%~dp0build.bat"
if errorlevel 1 (
  echo.
  echo BUILD FAILED. If BLScan.exe is open, close it and run again.
  exit /b 1
)

if /i "%~1"=="/notest" goto skiptest
echo.
echo === 2/4 tests ===
call "%~dp0tests\run-tests.bat"
if errorlevel 1 (
  echo.
  echo TESTS FAILED - nothing was packaged. Fix the tests or run: pack.bat /notest
  exit /b 1
)
goto package
:skiptest
echo.
echo === 2/4 tests skipped ===

:package
echo.
echo === 3/4 package folder ===
set OUT=%CD%\bin\pack\BLScan
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"
mkdir "%OUT%\templates"
mkdir "%OUT%\templates\edi"
copy /y bin\BLScan.exe "%OUT%\" >nul
if errorlevel 1 exit /b 1
copy /y docs\Install-Guide.html "%OUT%\" >nul
copy /y templates\*.json "%OUT%\templates\" >nul
copy /y templates\edi\*.json "%OUT%\templates\edi\" >nul

rem safety: these must never be in the package
if exist "%OUT%\BLScan.ini" (echo ERROR: BLScan.ini in package & exit /b 1)
if exist "%OUT%\templates\admin.json" (echo ERROR: admin.json in package & exit /b 1)

echo Package folder: %OUT%
dir /b /s "%OUT%"

echo.
echo === 4/4 zip ===
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set STAMP=%%d
set ZIP=%CD%\bin\pack\BLScan-%STAMP%.zip
if exist "%ZIP%" del /q "%ZIP%"
powershell -NoProfile -Command "Compress-Archive -Path '%OUT%' -DestinationPath '%ZIP%' -Force"
if errorlevel 1 (echo ZIP FAILED & exit /b 1)

echo.
echo DONE: %ZIP%
echo Reminder: the customer serial must be listed in src\sn.txt BEFORE running pack.bat
echo           (the customer opens BLScan, clicks the locked EDI card and sends you the License To / Serial shown).
exit /b 0
