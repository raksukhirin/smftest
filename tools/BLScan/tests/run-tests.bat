@echo off
rem BLScan tests (exit code 0 = everything passed)
rem   1: template store / admin / cache
rem   2: golden set for form reading (needs bin\BLScan.exe built first)
rem   3: designer logic on a real page            (needs the exported sample pages, see tests\golden.json)
rem   4: designer window workflow (save sample, test all samples, save template)
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
set REFS=-r:System.dll -r:System.Core.dll -r:System.Data.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll -r:System.Security.dll -r:System.Web.Extensions.dll
set PNG=%CD%\..\..\mockup\BL_OCR\XIAMEN-2609S_pages\XIAMEN-2609S_p29.png
set T=%TEMP%\blscan_tests_%RANDOM%
mkdir "%T%"
set R1=0
set R2=0
set R3=0
set R4=0

echo === 1: template store and admin ===
"%CSC%" -nologo -codepage:65001 -out:"%T%\store_tests.exe" -r:System.Web.Extensions.dll -r:System.Core.dll tests\TemplateStoreTests.cs src\Template.cs src\Admin.cs
if errorlevel 1 exit /b 1
"%T%\store_tests.exe" "%T%\work" "%CD%\templates"
set R1=%errorlevel%
echo.

echo === 2: golden set ===
if not exist bin\BLScan.exe goto nobuild
start /wait "" bin\BLScan.exe /testgolden "%CD%\tests\golden.json" /templates "%CD%\templates" /out "%T%\golden"
set R2=%errorlevel%
type "%T%\golden\golden.txt"
goto step3
:nobuild
echo bin\BLScan.exe not built - golden set skipped
:step3
echo.

if not exist "%PNG%" goto nopng
echo === 3: designer logic ===
"%CSC%" -nologo -codepage:65001 -main:DesignerLogicTests -out:"%T%\dl.exe" %REFS% tests\DesignerLogicTests.cs src\*.cs
if errorlevel 1 exit /b 1
"%T%\dl.exe" "%PNG%" "%T%\dlwork" "%CD%\templates"
set R3=%errorlevel%
echo.
echo === 4: designer workflow ===
"%CSC%" -nologo -codepage:65001 -main:DesignerWorkflowTests -out:"%T%\dw.exe" %REFS% tests\DesignerWorkflowTests.cs src\*.cs
if errorlevel 1 exit /b 1
"%T%\dw.exe" "%T%\dwwork" "%CD%\templates" "%PNG%"
set R4=%errorlevel%
goto summary
:nopng
echo sample page not found - designer tests 3 and 4 skipped

:summary
echo.
if "%R1%%R2%%R3%%R4%"=="0000" goto allok
echo FAILED: store=%R1% golden=%R2% designer-logic=%R3% designer-workflow=%R4%
rmdir /s /q "%T%" 2>nul
exit /b 1
:allok
echo ALL PASSED
rmdir /s /q "%T%" 2>nul
exit /b 0
