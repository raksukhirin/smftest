# Builds a folder (and a zip) that can be given to a customer: dist\SMFDash.Web\
#   SMFDash.Web.exe + WebView2 dlls + web\ (Dashboard, ApprovalFlow, vendor = Tailwind + Inter, all local) + a BLANK SMFDash.ini
# The customer's own bin\SMFDash.ini (server, user, password) is never copied. Run:  powershell -ExecutionPolicy Bypass -File package.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$mock = Join-Path $here '..\..\mockup' | Resolve-Path
$dist = Join-Path $here 'dist\SMFDash.Web'

& cmd /c "`"$here\build.bat`""
if ($LASTEXITCODE -ne 0) { throw 'build failed' }

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory $dist | Out-Null

# program
$bin = Join-Path $here 'bin'
Copy-Item (Join-Path $bin 'SMFDash.Web.exe'), (Join-Path $bin 'Microsoft.Web.WebView2.Core.dll'), (Join-Path $bin 'Microsoft.Web.WebView2.WinForms.dll') $dist
Copy-Item (Join-Path $bin 'runtimes') $dist -Recurse
Copy-Item (Join-Path $here '..\SMFDash\SMFDash.ini') (Join-Path $dist 'SMFDash.ini')       # template: no server / user / password

# web files (no mockup notes)
$web = Join-Path $dist 'web'
foreach ($d in 'Dashboard', 'ApprovalFlow', 'vendor') {
    Copy-Item (Join-Path $mock $d) (Join-Path $web $d) -Recurse
}
Get-ChildItem $web -Recurse -Include '*.md' -Exclude 'LICENSES.md' | Where-Object { $_.Name -ne 'LICENSES.md' } | Remove-Item -Force

Copy-Item (Join-Path $here 'INSTALL.txt') $dist

# sanity: nothing in the package may point at the internet or hold a connection
$bad = Get-ChildItem $dist -Recurse -File -Include '*.html', '*.css' | Select-String -Pattern 'cdn\.tailwindcss|fonts\.googleapis|fonts\.gstatic' -List
if ($bad) { throw ('external reference left in: ' + ($bad.Path -join ', ')) }
$ini = Get-Content (Join-Path $dist 'SMFDash.ini') -Raw
if ($ini -match 'encm:') { throw 'SMFDash.ini in the package contains an encrypted secret' }

$zip = Join-Path $here 'dist\SMFDash.Web.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $dist -DestinationPath $zip
'{0}  ({1:N1} MB)' -f $zip, ((Get-Item $zip).Length / 1MB)
