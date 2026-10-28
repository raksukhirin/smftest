# Field Mapping — Vessel Schedule (`frmSFSched`)

Maps each UI control in the mockup to its **VB6 source** (`frmSFSched.frm`) and
**DB column** (`SFVSED`). Use this when wiring the mockup to the real back-end.

## Primary table — `SFVSED` (one row = one sailing)

| UI field (`data-field`) | Grid column | DB column `SFVSED.*` | Type | Notes |
|---|---|---|---|---|
| `DETID` | — (key) | `DETID` | VARCHAR(20) | Zero-padded running id. VB6: `NewID("SFVSED","DETID",20)` |
| `LINERNO` | — | `LINERNO` | VARCHAR(20) | Carrier code (from master) |
| `LINERNAME` | Carrier | `LINERNAME` | VARCHAR(150) | Carrier display name |
| `VESSEL` | Vessel | `VESSEL` | VARCHAR(100) | From `SFVESSEL` master; required |
| `V_VOY` | Voy | `V_VOY` | VARCHAR(20) | Voyage no. (e.g. `S367`) |
| `DEPDATE` | Depart | `DEPDATE` | DATETIME | ETD; required |
| `DEPDAY` | Day | `DEPDAY` | VARCHAR(20) | **Derived** = weekday(DEPDATE). VB6: `xWeekdayName()` |
| `TRANSIT` | Transit Times | `TRANSIT` | INT | Days; required ≥ 0 |
| `ARRDATE` | Arrive | `ARRDATE` | DATETIME | **Derived** = DEPDATE + TRANSIT |
| `ARRDAY` | Day | `ARRDAY` | VARCHAR(20) | **Derived** = weekday(ARRDATE) |
| `LOADPORT` | Origin | `LOADPORT` | VARCHAR(20) | UN/LOCODE; required |
| `LOADPORTNAME` | — | `LOADPORTNAME` | VARCHAR(150) | Auto-filled from port master |
| `FINALPORT` | Destination | `FINALPORT` | VARCHAR(20) | UN/LOCODE; required |
| `FINALPORTNAME` | — | `FINALPORTNAME` | VARCHAR(150) | Auto-filled from port master |
| `REMARK` | — | `REMARK` | TEXT | Free text |
| `USERID` | — | `USERID` | VARCHAR(20) | Audit: created/updated by |
| `GROUPID` | — | `GROUPID` | VARCHAR(20) | Row-level access group |
| `LASTUPD` | — | `LASTUPD` | DATETIME | Last updated date |
| `LOCK` | — | `LOCK` | FLOAT | Optimistic concurrency token. VB6: `CDbl(Now)` |
| — | — | `PMKEY` | INT IDENTITY | Surrogate key (server-generated) |

### Derived fields (compute on save — do NOT trust client values)
```
DEPDAY  = weekday(DEPDATE)            // SUN..SAT codes
ARRDATE = DEPDATE + TRANSIT (days)
ARRDAY  = weekday(ARRDATE)
LOCK    = server timestamp           // refreshed every save
```
The mockup mirrors this in `src/detail.js → recompute()` and `src/crud.js → save()`.

## Master tables

| Master | DB table | Columns used | UI use |
|---|---|---|---|
| Vessel | `SFVESSEL` | `VESSEL`, `CALLSIGN`, `VSLTYPE` (`V`/`F`) | Vessel lookup + `vesselList` datalist |
| Port | (shared port master) | `PortCode`, `PortName`, `Country` | Port lookup, origin/dest code→name, country dropdowns, Port checklist |
| Carrier / Liner | (business/liner master) | `LinerNo`, `LinerName` | Carrier lookup, Carrier checklist |

> Ports & carriers are demo lists in `data.json → masters`. In production they
> resolve from the same masters the rest of Sea Freight uses (`SFVESSEL`, the
> shared port table, and the business/`SEALINE` vendor list).

## Search controls → filter predicates

| Control | Applies to | Predicate |
|---|---|---|
| SEARCH BY LOCATION → ORIGIN country/code | `LOADPORT` | country = port's country / code equals |
| SEARCH BY LOCATION → DESTINATION country/code | `FINALPORT` | country / code equals |
| SEARCH BY VESSEL → Vessel | `VESSEL` | contains (blank/`ALL` = no filter) |
| ID | `DETID` | contains |
| Search By (`DEP`/`ARR`) + Start Date + Weeks Out | `DEPDATE` or `ARRDATE` | between Start and Start + Weeks×7 |
| Date tab — DEPART checkboxes | `DEPDAY` | keep rows whose day is checked (all checked = no filter) |
| Date tab — ARRIVE checkboxes | `ARRDAY` | keep rows whose day is checked |
| Port tab checklist | `LOADPORT` OR `FINALPORT` | keep rows touching a checked port |
| Carrier tab checklist | `LINERNAME` | keep rows whose carrier is checked |

Result set is sorted by the active date key (`DEPDATE`/`ARRDATE`).

## Business rules carried over from VB6
- **Required**: Carrier, Vessel, Departure date, Transit (≥0), Load port, Final port.
- **Concurrency**: compare `LOCK` before update; on mismatch reload + warn
  (VB6: `FormatNumber(.Fields("Lock"),15) <> FormatNumber(dblLock,15)`).
- **Delete guard**: a sailing referenced by Booking/Job/BL must not be deleted
  (VB6 `UseVessel()` / `ChkUserCfgDel`). The mockup deletes freely — enforce
  server-side.
- **Permissions**: `ChkUserCfg("SFVSED", addMode)` gates add/save; rows filter by
  `GROUPID` for non-admins.
