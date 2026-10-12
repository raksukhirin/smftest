@echo off
rem Build BLScan.exe with the csc.exe of .NET Framework 4.x that ships with Windows (no Visual Studio / .NET SDK needed)
rem (ASCII only on purpose: Thai text in a .bat breaks cmd line parsing)
setlocal
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo csc.exe of .NET Framework 4 not found
  exit /b 1
)
if not exist bin mkdir bin
"%CSC%" -nologo -codepage:65001 -target:winexe -platform:anycpu -optimize+ ^
  -out:bin\BLScan.exe ^
  -r:System.dll -r:System.Core.dll -r:System.Data.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll -r:System.Security.dll -r:System.Web.Extensions.dll ^
  src\*.cs
if errorlevel 1 exit /b 1
if not exist bin\BLScan.ini copy BLScan.ini bin\BLScan.ini >nul
rem Default templates go beside the exe (not used when ini [Templates] Path points to a shared folder)
if not exist bin\templates mkdir bin\templates
xcopy /y /q templates\*.json bin\templates\ >nul
echo OK: bin\BLScan.exe
