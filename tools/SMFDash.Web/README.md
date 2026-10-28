# SMFDash.Web

The web UI (`mockup\Dashboard`, with `mockup\ApprovalFlow` as its Approval tab) in a **WebView2** window, with the same **read-only** DB access as SMFDash. `tools\SMFDash` is not changed; this folder compiles its data code (`..\SMFDash\src\*.cs` except `Program.cs` / `MainForm.cs`: Db, Ini, LiveData, LiveAlerts, SettingsForm ...) together with `src\*.cs` here.

## Build / run
```
powershell -ExecutionPolicy Bypass -File get-webview2.ps1   (once: downloads the WebView2 SDK dlls from nuget.org into lib\)
build.bat                                                    -> bin\SMFDash.Web.exe (+ SMFDash.ini copied from ..\SMFDash on the first build)
bin\SMFDash.Web.exe [/ui <folder with Dashboard\ and ApprovalFlow\>]   (default: ..\..\..\mockup)
```
- Needs the **Microsoft Edge WebView2 Runtime** on the PC (Windows 11 has it). Ship `bin\` as a folder: exe + `Microsoft.Web.WebView2.*.dll` + `runtimes\`.
- The pages are served from the `mockup` folder as `https://smfdash.local/` (virtual host mapping, no web server). The web files are **not copied**: edit `mockup\...`, restart the window. Tailwind and the font still come from the internet (CDN), as in the mockup.
- Settings (⚙ in the page header) opens the same dialog as SMFDash. The ini is `bin\SMFDash.ini` (encrypted with Windows DPAPI, machine scope) - to reuse the SMFDash connection copy `SMFDash\bin\SMFDash.ini` over it on the same PC. `bin\` is git-ignored (it holds the connection).

## Offline + package for customers
- Tailwind (Play CDN script 3.4.17) and the Inter font are kept in `mockup\vendor\` (`tailwind.js`, `inter.css`, `fonts\*.woff2`, licenses in `LICENSES.md`); `Dashboard` and `ApprovalFlow` load them from there, so nothing is fetched from the internet. (Other mockup folders still use the CDN.)
- `package.ps1` builds and creates `dist\SMFDash.Web\` + `dist\SMFDash.Web.zip` (~0.7 MB): exe, WebView2 dlls, `web\` (Dashboard, ApprovalFlow, vendor; no notes), a **blank** `SMFDash.ini` and `INSTALL.txt`. The exe uses `<exe folder>\web` when it exists. The script refuses to finish if an external URL is left in the pages or the ini holds a secret. `dist\` is git-ignored.
- The customer needs the Edge WebView2 Runtime (in Windows 11; `INSTALL.txt` says where to get it) and enters their own connection under Settings (stored with DPAPI, so per PC).
- Still to decide before shipping: the page title / footer still say "Mockup" and the header "[DEMO DATA]" parts, which widgets are live (see below), and a code-signing certificate (an unsigned exe may trigger SmartScreen).

## How the page gets data
The host injects `window.SMF.call(cmd)` into every page (a plain browser has no `SMF`, so the mockup keeps working with its demo data). Commands, all SELECT-only, run on a background task:

| cmd | result | used by |
|---|---|---|
| `info` | configured, target, approval user, alert display settings | - |
| `acc` | Accounting figures as `LiveData.LoadAcc` (bank balances, AR / AP aging, top receivables, payables due) with a `live` flag per part | Dashboard > Accounting (live parts replace the demo ones; header says "Accounting LIVE · other widgets DEMO") |
| `alerts` | `SMALERTDEF` + `AL_*` views as the mail-style HTML (same as `LiveAlerts`) | Approval > Alerts ("LIVE · server / db", **Reload from DB**) |
| `menu` | `TCMenu` (SUB_SYSNAME<>'0', by Sequence) | Approval sidebar |
| `workflow` | `TCStep` (no group rows) per module / document type + approvers from `TCGroupAuth` | Approval stepper / Timeline matrix |
| `approvals` | `TCDetail` ORDER BY REQNO DESC joined to `TCHead` | Approval list / detail / Timeline |
| `attachments` | `SMCUSTDOC` files (COMNO = document) with the link to open: a `DOCLOCATE` that starts with http(s) is used as it is, a file name becomes `<TIMELINECFG 3rd part>/<2nd part>/COMNO/STEPID/STATUSID/<file>`; local paths (`D:\...`) or rows without STEPID have no link | Approval detail > Attachments (this step's files first, then the other files of the document) |
| `settings` | opens the Settings dialog | Dashboard header |

`menu`, `workflow` and `approvals` read the database named in `SMCOMPANY.TIMELINECFG` (4th `\|` part, see `TimelineDb.cs`; the connection string never leaves the host). Approve / Reject in the page are preview only (not written to the DB).

Only pages of `https://smfdash.local/` may talk to the host (`OnMessage` checks the origin). Not live yet: Operations, Marketing, the Approval requests / Timeline (still the demo data in `ApprovalFlow\data.js`), cash flow / GL.
