# SMFDash

Windows dashboard for SMF — Operations / Accounting / Marketing. Same stack as BLScan: C# WinForms, built with the `csc.exe` of .NET Framework 4 that ships with Windows (C# 5 — no string interpolation, `?.`, etc.). Charts are drawn with GDI+ (`src\Charts.cs`), no extra libraries. **Read-only**: `Db.Query` rejects anything that is not a `SELECT`.

## Build / Run
```
build.bat            → bin\SMFDash.exe + bin\SMFDash.ini
SMFDash.exe          → the app
SMFDash.exe /shot <folder>   → save PNGs of every page (no database) to check the layout
```
Press **Settings** → Server / Database / (Windows auth or User+Password) → **Test** → **Save**. The password is stored as `encm:` (Windows DPAPI, machine scope) like BLScan — copying the ini to another machine needs the settings re-saved there. Without a DB the app opens with sample data only.

## What is real and what is sample
Every card shows its source in the top-right corner: **● LIVE** (from the DB) or **SAMPLE**.

| Widget | Source |
|---|---|
| Accounting · Bank balances, Cash & bank KPI | `SMBANKACC.BANKBAL` (last 4 digits of the account no. only) |
| Accounting · AR aging, AR outstanding, Top receivables | `ARSUBTRANS` open items |
| Accounting · AP aging, AP outstanding, Payables due this week | `APSUBTRANS` open items |
| Everything else (Operations, Marketing, cash flow, GL, KPI deltas/sparklines) | sample numbers from `src\SampleData.cs` — same as `mockup\Dashboard` |

Open-item rule (from `frmRPAging.frm`): group rows by `JOINID = CASE WHEN REFINVNO='' THEN INVNO ELSE REFINVNO END`, balance = `SUM(THBTOT*DOCBAL)` ≠ 0, due date = `DUEDATE` of the invoice row, skip `BATCHID LIKE 'CB%'`. Aging buckets count days past due.

**Not verified yet:**
- the queries were checked for syntax against `SMF_DEMO` only, not run through the app against a real database
- `SMBANKACC.BANKBAL` is not split by currency (a USD account is added as if it were THB) and was 0 in the demo rows checked — confirm it is maintained, or switch to `GLHISTORY`
- the AP sign convention (`DOCBAL`) and AR/AP numbers vs. the VB6 aging report — ask Accounting to compare one customer/vendor
- Branch and Period filters from the mockup are left out until the branch column is identified (`mockup\Dashboard\mapping.md`, item 4.5)

## Layout of the code
| File | Role |
|---|---|
| `Program.cs`, `MainForm.cs` | window, module / Operations sub-tabs, async reload |
| `Pages.cs` | one function per module — arranges cards |
| `Widgets.cs` | KpiCard, Card, PillButton, table (DataGridView) and the row layout |
| `Charts.cs` | Bar / GroupBar / Line / Donut / HBar / Funnel (hover for values) |
| `LiveData.cs` | the only SQL; add new live widgets here and drop the matching sample |
| `SampleData.cs` | placeholder numbers |
| `Db.cs`, `Ini.cs`, `SettingsForm.cs` | connection (copied from BLScan) |

## Next widgets to connect
See `mockup\Dashboard\mapping.md` — widgets marked ✅ first (Vessels due ≤7d, Jobs opened per week, Quotes expiring soon, Quotations vs Bookings).
