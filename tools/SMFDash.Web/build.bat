@echo off
rem Build SMFDash.Web.exe with the csc.exe of .NET Framework 4.x (C# 5). Compiles the data code of ..\SMFDash\src (not Program/MainForm) + src\*.cs here.
rem Needs the WebView2 SDK dlls in lib\ - run get-webview2.ps1 once (the Edge WebView2 Runtime itself must be installed on the PC).
rem (ASCII only on purpose: Thai text in a .bat breaks cmd line parsing)
setlocal enabledelayedexpansion
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo csc.exe of .NET Framework 4 not found
  exit /b 1
)
if not exist lib\Microsoft.Web.WebView2.Core.dll (
  echo lib\Microsoft.Web.WebView2.Core.dll missing - run:  powershell -ExecutionPolicy Bypass -File get-webview2.ps1
  exit /b 1
)
set SRC=
for %%f in (..\SMFDash\src\*.cs) do (
  if /i not "%%~nxf"=="Program.cs" if /i not "%%~nxf"=="MainForm.cs" set SRC=!SRC! "%%f"
)
if not exist bin mkdir bin
"%CSC%" -nologo -codepage:65001 -target:winexe -platform:anycpu -optimize+ -main:SMFDash.WebProgram -win32manifest:app.manifest ^
  -out:bin\SMFDash.Web.exe ^
  -r:System.dll -r:System.Core.dll -r:System.Data.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll -r:System.Security.dll -r:System.Web.Extensions.dll ^
  -r:lib\Microsoft.Web.WebView2.Core.dll -r:lib\Microsoft.Web.WebView2.WinForms.dll ^
  src\*.cs !SRC!
if errorlevel 1 exit /b 1
copy /y lib\Microsoft.Web.WebView2.Core.dll bin\ >nul
copy /y lib\Microsoft.Web.WebView2.WinForms.dll bin\ >nul
rem anycpu: WebView2Loader.dll of both bitness where the SDK looks for it (bin\runtimes\win-*\native); the SDK picks x86 / x64 itself
if not exist bin\runtimes\win-x86\native mkdir bin\runtimes\win-x86\native
if not exist bin\runtimes\win-x64\native mkdir bin\runtimes\win-x64\native
copy /y lib\x86\WebView2Loader.dll bin\runtimes\win-x86\native\ >nul
copy /y lib\x64\WebView2Loader.dll bin\runtimes\win-x64\native\ >nul
if not exist bin\SMFDash.ini copy ..\SMFDash\SMFDash.ini bin\SMFDash.ini >nul
echo OK: bin\SMFDash.Web.exe
