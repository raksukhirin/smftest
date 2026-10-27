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

## Approval tab (demo)
4th module **Approval** — same layout as `mockup\ApprovalFlow`: module pills (Sea/Air Export/Import) with the count waiting for the signed-in user, tabs Pending / Approved / Rejected / All, filters (search, working step, waiting for me / everyone, overdue), checkboxes + **Approve selected**, quick **APP. / REJ.** links per row, and a detail panel (progress, 13-step stepper, request, attachments, document, history, remark + Approve / Reject; Reject needs a reason; **UNDO** for 6 s).
- **Timeline Mgt** (switch at the top right of the page, `TimelineView.cs`): control view for following and controlling the workflow — KPI strip (in progress / on track / at risk / stalled / rejected / completed / average cycle time; click a box to filter), a **"waiting at step"** row that shows where work piles up, and a document × 13-step matrix (✓ approved, coloured cell = waiting with its age, ✕ rejected) with progress %, waiting time and owner. Grouped by risk or job type, filter by status / owner / search, hover a cell for approver and timing, click a row for the detail panel, **CSV** export. SLA: at risk after 24 h and stalled after 48 h at one step, or past the deadline (`ApprovalData.SlaWarnH / SlaLateH` — placeholders, set the real SLA).
- The user is `[Approval] User=` in `SMFDash.ini` (default `TEST`); a step is actionable only when that user is the step's approver.
- **Data is a demo list in memory** (`src\ApprovalData.cs`). Approve / reject change only the open window and are lost on restart — SMFDash is read-only and the approval tables are not known yet. When they are, write the update through a separate, explicit write path (not `Db.Query`).
- Step names 04-13 and the approver per step are placeholders. "View" on attachments is not implemented.

## Alerts tab
5th module **Alerts** (`AlertsPage.cs`, `AlertData.cs`) — same behaviour as the Alerts page in `mockup\ApprovalFlow`: each SQL HTML report (an `<h1>`/`<h2>` + one `<table>`) becomes a card (count, total, oldest age, severity stripe) and a table with search, user chips, group by user with subtotals, header sort, click a Job / Invoice No to copy it, totals row, **CSV** and **Original HTML**. The tab shows the total number of items.
- **Real files:** press **Load HTML…** or drag `.html` files onto the page. They are only read locally (the parser is a small regex reader — no extra library); nothing is written anywhere. Until then the 7 demo reports (modelled on the mails provided) are shown.
- Column types are detected from the values (date `dd-mm-yyyy`, money, days, user, Job No / Invoice No); empty columns are dropped; with no TOTAL DAYS column an **AGE** column is derived from the first date column. Severity: ≥ 90 days red, ≥ 30 amber. Age uses the demo clock (27 Oct 2026) like the rest of the Approval tabs.
- **Live from the database (`LiveAlerts.cs`, `sql\alerts_setup.sql`):** one alert = one view `AL_xxx` + one row in `SMALERTDEF`. With a DB configured, the tab reads the active rows of `SMALERTDEF` (SORTNO order) and `SELECT TOP 5000 *` from each view — real dates / numbers, ages from today's date, the subtitle says **LIVE**. If the table is missing (not installed yet) the demo reports stay and the status bar says why. A view that fails is reported but does not stop the others. Column `DOCNO` (the `SMALERT` key) is hidden; header = column name with `_` as space.
- **New views appear by themselves:** any view named `AL_*` that has a `DOCNO` column and is not listed in `SMALERTDEF` is added to the tab (title = the view's `MS_Description` extended property, else the view name). A `SMALERTDEF` row with `ACTIVE = 0` hides a view; a row only gives a nicer title / heading / mail subject. Helper views (`AL_APPLYINV`, `AL_JOBPAID` ...) have no `DOCNO`, so they are skipped. Mail is only sent for alerts that have a `SMALERTDEF` row with recipients.
- `sql\alerts_views.sql` holds the 9 views converted from the mail scripts in `@SQLMAIL\PILOT` (+ their `SMALERTDEF` rows, no recipients).
- The same script gives `dbo.usp_AlertMail @AlertCode [, @TestTo]` which builds the HTML mail from the same view, so adding an alert no longer means copying the HTML + `sp_send_dbmail` block. **Not run on a server yet** — the demo DB has no `SMALERT` and the script must be run by a DBA; try with `@TestTo` first. The generated column list / XML pattern was checked with a read-only query only.
- Not done: reports whose HTML has more than one table (only the first is read); the web mockup (`mockup\ApprovalFlow`) still uses its HTML sample files — a static page cannot query the DB (that needs the Laravel side).

## Layout of the code
| File | Role |
|---|---|
| `Program.cs`, `MainForm.cs` | window, module / Operations sub-tabs, async reload |
| `Pages.cs` | one function per module — arranges cards |
| `ApprovalPage.cs`, `ApprovalData.cs` | Approval tab (stateful page, kept alive between tab switches) + demo data |
| `Widgets.cs` | KpiCard, Card, PillButton, table (DataGridView) and the row layout |
| `Charts.cs` | Bar / GroupBar / Line / Donut / HBar / Funnel (hover for values) |
| `LiveData.cs` | the only SQL; add new live widgets here and drop the matching sample |
| `SampleData.cs` | placeholder numbers |
| `Db.cs`, `Ini.cs`, `SettingsForm.cs` | connection (copied from BLScan) |

## Next widgets to connect
See `mockup\Dashboard\mapping.md` — widgets marked ✅ first (Vessels due ≤7d, Jobs opened per week, Quotes expiring soon, Quotations vs Bookings).
