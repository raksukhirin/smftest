# Downloads the Microsoft.Web.WebView2 NuGet package (nuget.org, ~10 MB) and copies the SDK dlls into lib\ (not committed, see .gitignore).
param([string]$Version = '1.0.4258.31')
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('wv2_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $tmp | Out-Null
try {
    $zip = Join-Path $tmp 'pkg.zip'
    Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$Version/microsoft.web.webview2.$Version.nupkg" -OutFile $zip
    Expand-Archive $zip (Join-Path $tmp 'x')
    $lib = Join-Path $here 'lib'
    foreach ($a in 'x86', 'x64') { New-Item -ItemType Directory -Force (Join-Path $lib $a) | Out-Null }
    Copy-Item (Join-Path $tmp 'x\lib\net462\Microsoft.Web.WebView2.Core.dll') $lib -Force
    Copy-Item (Join-Path $tmp 'x\lib\net462\Microsoft.Web.WebView2.WinForms.dll') $lib -Force
    foreach ($a in 'x86', 'x64') { Copy-Item (Join-Path $tmp "x\runtimes\win-$a\native\WebView2Loader.dll") (Join-Path $lib $a) -Force }
    "WebView2 SDK $Version -> $lib"
} finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
