@echo off
rem Build BLScan.exe ด้วย csc ของ .NET Framework 4.x ที่มากับ Windows (ไม่ต้องลง Visual Studio / .NET SDK)
setlocal
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo ไม่พบ csc.exe ของ .NET Framework 4
  exit /b 1
)
if not exist bin mkdir bin
"%CSC%" -nologo -codepage:65001 -target:winexe -platform:anycpu -optimize+ ^
  -out:bin\BLScan.exe ^
  -r:System.dll -r:System.Core.dll -r:System.Data.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll -r:System.Security.dll -r:System.Web.Extensions.dll ^
  src\*.cs
if errorlevel 1 exit /b 1
if not exist bin\BLScan.ini copy BLScan.ini bin\BLScan.ini >nul
rem Template เริ่มต้นไปไว้ข้าง exe (ถ้าตั้งโฟลเดอร์กลางใน ini [Templates] Path ก็ไม่ใช้ชุดนี้)
if not exist bin\templates mkdir bin\templates
xcopy /y /q templates\*.json bin\templates\ >nul
echo OK: bin\BLScan.exe
